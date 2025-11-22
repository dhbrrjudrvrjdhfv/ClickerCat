// server.js — CENTRAL TIME FROM FIRST LAUNCH EVER
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
        value INTEGER,
        timestamp_value TIMESTAMPTZ
      );
    `);

    // Reset if requested
    if (process.env.RESET_GAME === 'true') {
      await pool.query('DELETE FROM clicks');
      await pool.query(`
        INSERT INTO game_state (key, value, timestamp_value) 
        VALUES ('current_day', 100, NOW())
        ON CONFLICT (key) DO UPDATE SET value = 100, timestamp_value = NOW();
      `);
      currentDay = 100;
      console.log('GAME RESET — Day 100 + new timestamp');
    } else {
      const res = await pool.query(`
        SELECT value, timestamp_value 
        FROM game_state 
        WHERE key = 'current_day'
      `);
      if (res.rows.length > 0) {
        currentDay = res.rows[0].value;
        console.log(`Game loaded. Day: ${currentDay}`);
      } else {
        // First launch ever
        await pool.query(`
          INSERT INTO game_state (key, value, timestamp_value) 
          VALUES ('current_day', 100, NOW())
        `);
        currentDay = 100;
        console.log('FIRST LAUNCH EVER — timestamp locked');
      }
    }
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

// NEW: Central time endpoint
app.get('/api/time', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT timestamp_value AS day_start 
      FROM game_state 
      WHERE key = 'current_day'
    `);
    const dayStart = result.rows[0].day_start;
    const now = new Date();
    const elapsed = Math.floor((now - dayStart) / 1000);
    const secondsLeft = Math.max(0, 86400 - elapsed);
    res.json({ secondsLeft });
  } catch (err) {
    console.error(err);
    res.status(500).json({ secondsLeft: 0 });
  }
});

// existing /api/click unchanged
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
    await pool.query('INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING', [playerId]);
    await pool.query('INSERT INTO clicks (player_id, day) VALUES ($1, $2)', [playerId, currentDay]);
    res.json({ success: true });
  } catch (err) {
    console.error('Click insert error:', err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/api/state', async (req, res) => {
  try {
    const [todayRes, yesterdayRes] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM clicks WHERE day = $1', [currentDay]),
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
      await pool.query(`
        UPDATE game_state 
        SET value = $1, timestamp_value = NOW() 
        WHERE key = 'current_day'
      `, [currentDay]);
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
