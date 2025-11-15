// server.js — FINAL: Day 100 on every deploy, player insert, secure cookie
const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

const MAX_CLICKS_PER_SECOND = 5;
const clickTimes = new Map();

let currentDay = 100;

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id UUID PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS clicks (
        id SERIAL PRIMARY KEY,
        player_id UUID REFERENCES players(id),
        clicked_at TIMESTAMPTZ DEFAULT NOW(),
        day INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS game_state (
        key TEXT PRIMARY KEY,
        value INTEGER
      );
    `);

    // FORCE RESET TO DAY 100 ON EVERY DEPLOY
    await pool.query(
      'INSERT INTO game_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
      ['current_day', 100]
    );
    currentDay = 100;
    console.log('Day counter RESET to 100 (every deploy)');

  } catch (err) {
    console.error('DB init error:', err);
  }
}
initDB();

function getPlayerId(req, res) {
  let playerId = req.cookies.playerId;
  if (!playerId) {
    playerId = uuidv4();
    res.cookie('playerId', playerId, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 10 * 365 * 24 * 60 * 60 * 1000
    });
  }
  return playerId;
}

app.post('/api/click', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const now = new Date();
  const times = clickTimes.get(playerId) || [];
  const recent = times.filter(t => now - t < 1000);

  if (recent.length >= MAX_CLICKS_PER_SECOND) {
    return res.status(429).json({ error: 'Too fast!' });
  }

  times.push(now);
  clickTimes.set(playerId, times.slice(-10));

  try {
    // INSERT PLAYER IF NOT EXISTS
    await pool.query(
      'INSERT INTO players (id) VALUES ($1) ON CONFLICT (id) DO NOTHING',
      [playerId]
    );

    await pool.query(
      'INSERT INTO clicks (player_id, day) VALUES ($1, $2)',
      [playerId, currentDay]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Click insert error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/state', async (req, res) => {
  const playerId = req.cookies.playerId;
  try {
    const [todayRes, yesterdayRes] = await Promise.all([
      playerId
        ? pool.query('SELECT COUNT(*) as count FROM clicks WHERE player_id = $1 AND day = $2', [playerId, currentDay])
        : { rows: [{ count: '0' }] },
      pool.query('SELECT COUNT(*) as count FROM clicks WHERE day = $1', [currentDay + 1])
    ]);

    const todayClicks = parseInt(todayRes.rows[0].count) || 0;
    const yesterdayClicks = parseInt(yesterdayRes.rows[0].count) || 0;
    const remaining = Math.max(0, yesterdayClicks - todayClicks);

    res.json({
      day: currentDay,
      todayClicks,
      yesterdayClicks,
      remaining
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'State error' });
  }
});

app.post('/api/day-end', async (req, res) => {
  try {
    const [todayTotal, yesterdayTotal] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM clicks WHERE day = $1', [currentDay]),
      pool.query('SELECT COUNT(*) as count FROM clicks WHERE day = $1', [currentDay + 1])
    ]);

    const todayClicks = parseInt(todayTotal.rows[0].count) || 0;
    const yesterdayClicks = parseInt(yesterdayTotal.rows[0].count) || 0;

    if (todayClicks >= yesterdayClicks) {
      currentDay = Math.max(0, currentDay - 1);
      await pool.query('UPDATE game_state SET value = $1 WHERE key = $2', [currentDay, 'current_day']);
      console.log(`Day ended. New day: ${currentDay}`);
      res.json({ success: true, newDay: currentDay });
    } else {
      res.json({ lost: true });
    }
  } catch (err) {
    console.error('Day end error:', err);
    res.json({ lost: true });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}, Day: ${currentDay}`);
});
