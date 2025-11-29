const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Log every request
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
  try {
    await pool.query(`
      ALTER TABLE game_state
      ADD COLUMN IF NOT EXISTS timestamp_value TIMESTAMPTZ;
    `);

    const res = await pool.query(`
      SELECT value, timestamp_value
      FROM game_state
      WHERE key = 'current_day'
    `);

    if (res.rows.length === 0) {
      await pool.query(`
        INSERT INTO game_state (key, value, timestamp_value)
        VALUES ('current_day', 100, NOW())
      `);
      currentDay = 100;
    } else {
      currentDay = res.rows[0].value || 100;
      if (!res.rows[0].timestamp_value) {
        await pool.query(`UPDATE game_state SET timestamp_value = NOW() WHERE key = 'current_day'`);
      }
    }
  } catch (err) {
    console.error('ensureGameState error:', err);
  }
}
ensureGameState();

// RESET VIA ENV (you already know this works)
if (process.env.RESET_GAME === 'true') {
  (async () => {
    console.log('RESET_GAME = true → wiping everything');
    await pool.query('DELETE FROM clicks');
    await pool.query(`INSERT INTO game_state (key, value, timestamp_value)
                     VALUES ('current_day', 100, NOW())
                     ON CONFLICT (key) DO UPDATE SET value = 100, timestamp_value = NOW()`);
    currentDay = 100;
  })();
}

function getPlayerId(req, res) {
  let playerId = req.cookies.playerId;
  if (!playerId) {
    playerId = uuidv4();
    res.cookie('playerId', playerId, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 10 * 365 * 24 * 60 * 60 * 1000 });
  }
  return playerId;
}

app.get('/api/time', async (req, res) => {
  try {
    const result = await pool.query(`SELECT timestamp_value FROM game_state WHERE key = 'current_day'`);
    let secondsLeft = 86400;
    if (result.rows[0]?.timestamp_value) {
      const elapsed = Math.floor((Date.now() - new Date(result.rows[0].timestamp_value)) / 1000);
      secondsLeft = Math.max(0, 86400 - elapsed);
    }
    res.json({ secondsLeft });
  } catch (err) {
    console.error('Time error:', err);
    res.json({ secondsLeft: 86400 });
  }
});

app.post('/api/click', async (req, res) => {
  const playerId = getPlayerId(req, res);
  const now = Date.now();
  const times = clickTimes.get(playerId) || [];
  const recent = times.filter(t => now - t < 1000);
  if (recent.length >= MAX_CLICKS_PER_SECOND) return res.status(429).json({ error: 'Too fast!' });
  times.push(now);
  clickTimes.set(playerId, times.slice(-10));

  try {
    await pool.query('INSERT INTO players (id) VALUES ($1) ON CONFLICT DO NOTHING', [playerId]);
    await pool.query('INSERT INTO clicks (player_id, day) VALUES ($1, $2)', [playerId, currentDay]);
    console.log(`Click registered – Day ${currentDay} – Total today: ${(await pool.query('SELECT COUNT(*) FROM clicks WHERE day=$1', [currentDay])).rows[0].count}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Click error:', err);
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
    res.json({ day: currentDay, todayClicks, yesterdayClicks, remaining });
  } catch (err) {
    console.error('State error:', err);
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

    console.log(`JUDGMENT → Day ${currentDay} | Today: ${todayClicks} | Needed ≥ ${yesterdayClicks}`);

    if (todayClicks >= yesterdayClicks) {
      currentDay = Math.max(0, currentDay - 1);
      await pool.query(`UPDATE game_state SET value = $1, timestamp_value = NOW() WHERE key = 'current_day'`, [currentDay]);
      console.log(`→ PASS! New day: ${currentDay}`);
      res.json({ success: true, newDay: currentDay });
    } else {
      console.log(`→ FAIL! Game Over.`);
      res.json({ lost: true });
    }
  } catch (err) {
    console.error('Day-end error:', err);
    res.json({ lost: true });
  }
});

// DEV: Skip Day → forces real judgment in ~3 seconds
app.post('/api/force-midnight', async (req, res) => {
  console.log('Skip Day pressed → forcing 00:00:03');
  try {
    const almostMidnight = new Date(Date.now() - (86400 - 3) * 1000);
    await pool.query(`UPDATE game_state SET timestamp_value = $1 WHERE key = 'current_day'`, [almostMidnight]);
    res.json({ success: true });
  } catch (err) {
    console.error('force-midnight error:', err);
    res.status(500).json({ error: 'failed' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running – Day ${currentDay}`));
