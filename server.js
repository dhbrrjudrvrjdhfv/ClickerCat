// server.js
const express = require('express');
const { Pool } = require('pg');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public')); // Serves index.html, style.css, script.js

// Connect to Render PostgreSQL
const pool = new Pool({
connectionString: process.env.DATABASE_URL,
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Rate limiting: YOU set the limit
const MAX_CLICKS_PER_SECOND = 5; // ← Change this number if you want
const clickTimes = new Map(); // playerId → [timestamps]

// Initialize DB tables
async function initDB() {
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
`);
}
initDB();

// Get or create player ID
function getPlayerId(req, res) {
let playerId = req.cookies.playerId;
if (!playerId) {
playerId = uuidv4();
res.cookie('playerId', playerId, {
httpOnly: true,
secure: process.env.NODE_ENV === 'production',
maxAge: 10 * 365 * 24 * 60 * 60 * 1000
});
}
return playerId;
}

// API: Record a click
app.post('/api/click', async (req, res) => {
const playerId = getPlayerId(req, res);
const now = new Date();

// === RATE LIMIT: 5 clicks per second ===
const times = clickTimes.get(playerId) || [];
const recent = times.filter(t => now - t < 1000); // last 1 second
if (recent.length >= MAX_CLICKS_PER_SECOND) {
return res.status(429).json({ error: 'Too fast!' });
}
times.push(now);
clickTimes.set(playerId, times.slice(-10)); // keep last 10

// Calculate current day (Day 100 = start)
const startDate = new Date('2025-01-01'); // Change if needed
const day = 100 - Math.floor((now - startDate) / (24 * 60 * 60 * 1000));

try {
await pool.query(
'INSERT INTO clicks (player_id, day) VALUES ($1, $2)',
[playerId, day]
);
res.json({ success: true });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'DB error' });
}
});

// API: Get game state for this player
app.get('/api/state', async (req, res) => {
const playerId = req.cookies.playerId;
const now = new Date();
const startDate = new Date('2025-01-01');
const day = 100 - Math.floor((now - startDate) / (24 * 60 * 60 * 1000));

try {
const [todayRes, yesterdayRes] = await Promise.all([
playerId
? pool.query('SELECT COUNT(*) FROM clicks WHERE player_id = $1 AND day = $2', [playerId, day])
: { rows: [{ count: 0 }] },
pool.query('SELECT COUNT(*) FROM clicks WHERE day = $1', [day + 1])
]);

const todayClicks = parseInt(todayRes.rows[0].count) || 0;
const yesterdayClicks = parseInt(yesterdayRes.rows[0].count) || 0;
const remaining = Math.max(0, yesterdayClicks - todayClicks);

res.json({
day,
todayClicks,
yesterdayClicks,
remaining
});
} catch (err) {
res.status(500).json({ error: 'State error' });
}
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`Server running on port ${PORT}`);
});