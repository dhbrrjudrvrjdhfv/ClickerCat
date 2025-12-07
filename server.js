const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} | ${req.method} ${req.path}`);
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
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS nickname VARCHAR(30);`);
  // Widen column if it exists and is smaller
  await pool.query(`ALTER TABLE players ALTER COLUMN nickname TYPE VARCHAR(30);`);
}

ensureGameState();
ensureTables();

if (process.env.RESET_GAME === 'true') {
  (async () => {
    await pool.query('DELETE FROM clicks');
    await pool.query('DELETE FROM players');
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

const clients = new Map();

app.get('/api/live', (req, res) => {
  const playerId = getPlayerId(req, res);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  clients.set(res, playerId);
  req.on('close', () => clients.delete(res));
});

async function broadcast() {
  const todayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay]);
  const yesterdayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay + 1]);
  const timeRes = await pool.query(`SELECT timestamp_value FROM game_state WHERE key = 'current_day'`);
  const todayClicks = parseInt(todayRes.rows[0].c) || 0;
  const yesterdayClicks = parseInt(yesterdayRes.rows[0].c) || 0;
  const remaining = Math.max(0, yesterdayClicks - todayClicks);
  const dayStart = timeRes.rows[0] ? timeRes.rows[0].timestamp_value : new Date();
  const secondsLeft = Math.max(0, 86400 - Math.floor((Date.now() - new Date(dayStart)) / 1000));

  const top100 = await pool.query(`
    SELECT p.nickname, COUNT(c.id) as clicks 
    FROM players p 
    LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1 
    WHERE p.nickname IS NOT NULL 
    GROUP BY p.id, p.nickname 
    ORDER BY clicks DESC LIMIT 100`, [currentDay]);

  const leaderboard = top100.rows.map(r => ({ nickname: r.nickname, clicks: parseInt(r.clicks) }));

  for (const [client, playerId] of clients.entries()) {
    const playerData = await pool.query(`
      WITH ranked AS (
        SELECT p.id, p.nickname, COUNT(c.id) as clicks, 
               RANK() OVER (ORDER BY COUNT(c.id) DESC) as rank 
        FROM players p 
        LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1 
        WHERE p.nickname IS NOT NULL 
        GROUP BY p.id, p.nickname
      ) 
      SELECT nickname, clicks, rank FROM ranked WHERE id = $2`, [currentDay, playerId]);

    let player = { nickname: 'Anonymous', clicks: 0, rank: '-' };
    if (playerData.rows[0]) {
      player = {
        nickname: playerData.rows[0].nickname,
        clicks: parseInt(playerData.rows[0].clicks) || 0,
        rank: parseInt(playerData.rows[0].rank)
      };
    }

    const data = JSON.stringify({
      day: currentDay,
      todayClicks,
      yesterdayClicks,
      remaining,
      secondsLeft,
      leaderboard,
      player
    });

    try {
      client.write('data: ' + data + '\n\n');
    } catch (e) {
      clients.delete(client);
    }
  }
}

setInterval(broadcast, 500);

async function checkDayEnd() {
  const timeRes = await pool.query(`SELECT timestamp_value FROM game_state WHERE key = 'current_day'`);
  const dayStart = timeRes.rows[0] ? timeRes.rows[0].timestamp_value : new Date();
  const secondsLeft = Math.max(0, 86400 - Math.floor((Date.now() - new Date(dayStart)) / 1000));

  if (secondsLeft <= 0) {
    const todayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay]);
    const yesterdayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay + 1]);
    const today = parseInt(todayRes.rows[0].c) || 0;
    const yesterday = parseInt(yesterdayRes.rows[0].c) || 0;

    if (today >= yesterday) {
      currentDay = Math.max(0, currentDay - 1);
      await pool.query(`UPDATE game_state SET value = $1, timestamp_value = NOW() WHERE key = 'current_day'`, [currentDay]);
      console.log('Day ended successfully - now Day ' + currentDay);
      broadcast();
    } else {
      console.log('Day ended - GAME LOST');
    }
  }
}
setInterval(checkDayEnd, 1000);

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
  const nickname = (req.body.nickname || '').trim();

  if (!nickname || nickname.length < 1 || nickname.length > 30) {
    return res.status(400).json({ error: 'Nickname must be 1–30 characters' });
  }

  try {
    const result = await pool.query('UPDATE players SET nickname = $1 WHERE id = $2', [nickname, playerId]);
    if (result.rowCount === 0) {
      await pool.query('INSERT INTO players (id, nickname) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET nickname = $2', [playerId, nickname]);
    }
    broadcast();
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') {
      res.status(400).json({ error: 'Nickname already taken' });
    } else {
      res.status(500).json({ error: 'Database error' });
    }
  }
});

app.get('/api/check-nickname', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const result = await pool.query('SELECT nickname FROM players WHERE id = $1', [playerId]);
  res.json({ hasNickname: !!(result.rows[0]?.nickname) });
});

// admin routes unchanged
app.post('/api/skip-day', async (req, res) => { /* ... */ });
app.post('/api/day-end', async (req, res) => { /* ... */ });
app.post('/api/force-midnight', async (req, res) => { /* ... */ });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} - Day ${currentDay}`));

