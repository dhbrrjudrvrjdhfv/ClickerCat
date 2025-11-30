**server.js**

```javascript
const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MAX_CLICKS_PER_SECOND = 5;
const clickTimes = new Map();
let currentDay = 100;

async function ensureGameState() {
  await pool.query(`ALTER TABLE game_state ADD COLUMN IF NOT EXISTS timestamp_value TIMESTAMPTZ;`);
  const res = await pool.query(`SELECT value, timestamp_value FROM game_state WHERE key = 'current_day'`);
  if (res.rows.length === 0) {
    await pool.query(`INSERT INTO game_state (key, value, timestamp_value) VALUES ('current_day', 100, NOW())`);
    currentDay = 100;
  } else {
    currentDay = res.rows[0].value || 100;
    if (!res.rows[0].timestamp_value) await pool.query(`UPDATE game_state SET timestamp_value = NOW() WHERE key = 'current_day'`);
  }
}

async function ensureTables() {
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname VARCHAR(20) UNIQUE;`);
}

ensureGameState();
ensureTables();

if (process.env.RESET_GAME === 'true') {
  (async () => {
    await pool.query('DELETE FROM clicks');
    await pool.query(`INSERT INTO game_state (key, value, timestamp_value) VALUES ('current_day', 100, NOW())
                     ON CONFLICT (key) DO UPDATE SET value = 100, timestamp_value = NOW()`);
    currentDay = 100;
  })();
}

function getPlayerId(req, res) {
  let id = req.cookies.playerId;
  if (!id) {
    id = uuidv4();
    res.cookie('playerId', id, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 365 * 24 * 60 * 60 * 1000 });
  }
  return id;
}

const clients = new Set();

app.get('/api/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

async function broadcast() {
  const [todayRes, yesterdayRes, timeRes] = await Promise.all([
    pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay]),
    pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay + 1]),
    pool.query('SELECT timestamp_value FROM game_state WHERE key = \'current_day\'')
  ]);

  const todayClicks = parseInt(todayRes.rows[0].c) || 0;
  const yesterdayClicks = parseInt(yesterdayRes.rows[0].c) || 0;
  const remaining = Math.max(0, yesterdayClicks - todayClicks);
  const dayStart = timeRes.rows[0]?.timestamp_value || new Date();
  const secondsLeft = Math.max(0, 86400 - Math.floor((Date.now() - new Date(dayStart)) / 1000));

  const data = JSON.stringify({ day: currentDay, todayClicks, yesterdayClicks, remaining, secondsLeft });

  for (const client of clients) client.write(`data: ${data}\n\n`);
}

setInterval(broadcast, 100);

app.post('/api/click', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const now = Date.now();
  const times = clickTimes.get(playerId) || [];
  if (times.filter(t => now - t < 1000).length >= MAX_CLICKS_PER_SECOND) {
    return res.status(429).json({ error: 'Too fast!' });
  }
  times.push(now);
  clickTimes.set(playerId, times.slice(-10));

  await pool.query('INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING', [playerId]);
  await pool.query('INSERT INTO clicks (player_id, day) VALUES ($1, $2)', [playerId, currentDay]);

  broadcast();
  res.json({ success: true });
});

app.post('/api/set-nickname', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const { nickname } = req.body;
  
  if (!nickname || nickname.length < 2 || nickname.length > 20) {
    return res.status(400).json({ error: 'Invalid nickname' });
  }

  try {
    await pool.query(
      'UPDATE players SET nickname = $1 WHERE id = $2 AND nickname IS NULL',
      [nickname, playerId]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  const playerId = getPlayerId(req, res);
  
  try {
    const top100 = await pool.query(`
      SELECT p.nickname, COUNT(c.id) as clicks
      FROM players p
      LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1
      WHERE p.nickname IS NOT NULL
      GROUP BY p.id, p.nickname
      ORDER BY clicks DESC
      LIMIT 100
    `, [currentDay]);

    const playerData = await pool.query(`
      SELECT p.nickname, COUNT(c.id) as clicks,
        (SELECT COUNT(DISTINCT p2.id) + 1 
         FROM players p2 
         LEFT JOIN clicks c2 ON p2.id = c2.player_id AND c2.day = $1
         WHERE p2.nickname IS NOT NULL
         GROUP BY p2.id
         HAVING COUNT(c2.id) > COUNT(c.id)) as rank
      FROM players p
      LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1
      WHERE p.id = $2
      GROUP BY p.id, p.nickname
    `, [currentDay, playerId]);

    res.json({
      leaderboard: top100.rows.map(r => ({
        nickname: r.nickname,
        clicks: parseInt(r.clicks)
      })),
      player: playerData.rows[0] ? {
        nickname: playerData.rows[0].nickname || 'Anonymous',
        clicks: parseInt(playerData.rows[0].clicks) || 0,
        rank: parseInt(playerData.rows[0].rank) || '-'
      } : null
    });
  } catch (e) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/day-end', async (req, res) => {
  const [todayRes, yesterdayRes] = await Promise.all([
    pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay]),
    pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay + 1])
  ]);

  const today = parseInt(todayRes.rows[0].c) || 0;
  const yesterday = parseInt(yesterdayRes.rows[0].c) || 0;

  if (today >= yesterday) {
    currentDay = Math.max(0, currentDay - 1);
    await pool.query(`UPDATE game_state SET value = $1, timestamp_value = NOW() WHERE key = 'current_day'`, [currentDay]);
    broadcast();
    res.json({ success: true });
  } else {
    broadcast();
    res.json({ lost: true });
  }
});

app.post('/api/force-midnight', async (req, res) => {
  const almost = new Date(Date.now() - (86400 - 3) * 1000);
  await pool.query(`UPDATE game_state SET timestamp_value = $1 WHERE key = 'current_day'`, [almost]);
  broadcast();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running – Day ${currentDay}`));
```
