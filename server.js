const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const uuid = require('uuid');                // ← changed to normal require
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

// Auto-create columns (no manual SQL needed)
async function ensureTables() {
  const columns = [
    "nickname VARCHAR(30) UNIQUE",
    "total_clicks BIGINT DEFAULT 0",
    "streak INT DEFAULT 0",
    "first_seen TIMESTAMPTZ DEFAULT NOW()",
    "days_played INT DEFAULT 0",
    "last_click TIMESTAMPTZ"
  ];
  for (const def of columns) {
    try { await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS ${def}`); }
    catch (e) { /* ignore */ }
  }
}

async function ensureGameState() {
  await pool.query('ALTER TABLE game_state ADD COLUMN IF NOT EXISTS timestamp_value TIMESTAMPTZ;');
  const res = await pool.query(`SELECT value, timestamp_value FROM game_state WHERE key = 'current_day'`);
  if (res.rows.length === 0) {
    await pool.query(`INSERT INTO game_state (key, value, timestamp_value) VALUES ('current_day', 100, NOW())`);
    currentDay = 100;
  } else {
    currentDay = res.rows[0].value || 100;
    if (!res.rows[0].timestamp_value) {
      await pool.query(`UPDATE game_state SET timestamp_value = NOW() WHERE key = 'current_day'`);
    }
  }
}

ensureGameState();
ensureTables();

function getPlayerId(req, res) {
  let id = req.cookies.playerId;
  if (!id) {
    id = uuid.v4();                                          // ← now works
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
  const dayStart = timeRes.rows[0]?.timestamp_value || new Date();
  const secondsLeft = Math.max(0, 86400 - Math.floor((Date.now() - new Date(dayStart)) / 1000));

  const topRes = await pool.query(`
    SELECT p.nickname, p.total_clicks, p.streak, p.first_seen, p.days_played, p.last_click,
           COUNT(c.id) AS today_clicks
    FROM players p
    LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1
    WHERE p.nickname IS NOT NULL
    GROUP BY p.id, p.nickname
    ORDER BY today_clicks DESC LIMIT 100
  `, [currentDay]);

  const leaderboard = topRes.rows.map(r => ({
    nickname: r.nickname,
    clicks: parseInt(r.today_clicks) || 0,
    total_clicks: Number(r.total_clicks || 0),
    streak: Number(r.streak || 0),
    first_seen: r.first_seen,
    days_played: Number(r.days_played || 1),
    last_click: r.last_click
  }));

  for (const [client, playerId] of clients.entries()) {
    const playerRes = await pool.query(`
      WITH ranked AS (
        SELECT p.id, p.nickname, p.total_clicks, p.streak, p.first_seen, p.days_played, p.last_click,
               COUNT(c.id) AS clicks,
               RANK() OVER (ORDER BY COUNT(c.id) DESC) AS rank
        FROM players p
        LEFT JOIN clicks c ON p.id = c.player_id AND c.day = $1
        WHERE p.nickname IS NOT NULL
        GROUP BY p.id, p.nickname
      )
      SELECT nickname, clicks, rank, total_clicks, streak, first_seen, days_played, last_click
      FROM ranked WHERE id = $2
    `, [currentDay, playerId]);

    let player = { nickname: 'Anonymous', clicks: 0, rank: '-', total_clicks: 0, streak: 0, first_seen: null, days_played: 1, last_click: null };
    if (playerRes.rows[0]) {
      const p = playerRes.rows[0];
      player = {
        nickname: p.nickname,
        clicks: parseInt(p.clicks) || 0,
        rank: p.rank,
        total_clicks: Number(p.total_clicks || 0),
        streak: Number(p.streak || 0),
        first_seen: p.first_seen,
        days_played: Number(p.days_played || 1),
        last_click: p.last_click
      };
    }

    const data = JSON.stringify({ day: currentDay, todayClicks, yesterdayClicks, remaining, secondsLeft, leaderboard, player });
    try { client.write('data: ' + data + '\n\n'); }
    catch (e) { clients.delete(client); }
  }
}
setInterval(broadcast, 500);

async function checkDayEnd() {
  const timeRes = await pool.query(`SELECT timestamp_value FROM game_state WHERE key = 'current_day'`);
  const dayStart = timeRes.rows[0]?.timestamp_value || new Date();
  const secondsLeft = Math.max(0, 86400 - Math.floor((Date.now() - new Date(dayStart)) / 1000));

  if (secondsLeft <= 0) {
    const todayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay]);
    const yesterdayRes = await pool.query('SELECT COUNT(*) as c FROM clicks WHERE day = $1', [currentDay + 1]);
    const today = parseInt(todayRes.rows[0].c) || 0;
    const yesterday = parseInt(yesterdayRes.rows[0].c) || 0;

    if (today >= yesterday) {
      currentDay = Math.max(0, currentDay - 1);
      await pool.query(`UPDATE game_state SET value = $1, timestamp_value = NOW() WHERE key = 'current_day'`, [currentDay]);

      const todayActive = await pool.query('SELECT DISTINCT player_id FROM clicks WHERE day = $1', [currentDay + 1]);
      const yesterdayActive = await pool.query('SELECT DISTINCT player_id FROM clicks WHERE day = $1', [currentDay + 2]);
      const yesterdaySet = new Set(yesterdayActive.rows.map(r => r.player_id));

      for (const { player_id } of todayActive.rows) {
        const wasYesterday = yesterdaySet.has(player_id);
        if (wasYesterday) {
          await pool.query('UPDATE players SET streak = streak + 1, days_played = days_played + 1 WHERE id = $1', [player_id]);
        } else {
          await pool.query('UPDATE players SET streak = 1, days_played = days_played + 1 WHERE id = $1', [player_id]);
        }
      }

      console.log('Day ended – now Day ' + currentDay);
      broadcast();
    }
  }
}
setInterval(checkDayEnd, 1000);

// FIXED CLICK ROUTE (lifetime clicks + ONLINE/OFFLINE work)
app.post('/api/click', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const now = Date.now();

  const times = clickTimes.get(playerId) || [];
  if (times.filter(t => now - t < 1000).length >= MAX_CLICKS_PER_SECOND) {
    return res.status(429).json({ error: 'Too fast!' });
  }
  times.push(now);
  clickTimes.set(playerId, times.slice(-10));

  await pool.query(`
    INSERT INTO players (id, total_clicks, last_click, first_seen)
    VALUES ($1, 1, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      total_clicks = COALESCE(players.total_clicks, 0) + 1,
      last_click = NOW()
  `, [playerId]);

  await pool.query('INSERT INTO clicks (player_id, day) VALUES ($1, $2)', [playerId, currentDay]);
  broadcast();
  res.json({ success: true });
});

app.post('/api/set-nickname', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const nickname = (req.body.nickname || '').trim();
  if (!nickname || nickname.length < 1 || nickname.length > 30) {
    return res.status(400).json({ error: 'Invalid nickname' });
  }
  try {
    await pool.query('INSERT INTO players (id, nickname) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET nickname = $2', [playerId, nickname]);
    broadcast();
    res.json({ success: true });
  } catch (e) {
    if (e.code === '23505') res.status(400).json({ error: 'Nickname taken' });
    else res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/check-nickname', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const result = await pool.query('SELECT nickname FROM players WHERE id = $1', [playerId]);
  res.json({ hasNickname: !!(result.rows[0]?.nickname) });
});

app.post('/api/skip-day', async (req, res) => {
  await pool.query(`UPDATE game_state SET timestamp_value = NOW() - INTERVAL '86397 seconds' WHERE key = 'current_day'`);
  broadcast();
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} – Day ${currentDay}`));
