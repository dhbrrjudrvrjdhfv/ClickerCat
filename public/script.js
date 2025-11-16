/*  public/script.js
    Universal timer + live global stats + mole moves only on YOUR click
*/

const mole   = document.getElementById('mole');
const main   = document.querySelector('.main');
const stats  = document.querySelectorAll('.stat');

const yesterdayClicksValue = stats[0].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const todayClicksValue     = stats[2].querySelector('.value');
const timeLeftValue        = stats[3].querySelector('.value');
const dayCounterValue      = stats[4].querySelector('.value');

let gameLost   = false;
let lastPos    = null;

/* -------------------------------------------------
   DEV TOOLS (keep the HTML block in index.html)
------------------------------------------------- */
const devTools = document.getElementById('dev-tools');
if (devTools) {
  const skipHour = document.getElementById('skip-hour');
  const skipDay  = document.getElementById('skip-day');
  const resetMe  = document.getElementById('reset-me');

  skipHour?.addEventListener('click', () => skipTime(3600));
  skipDay?.addEventListener('click',  () => skipTime(24 * 3600));
  resetMe?.addEventListener('click', () => {
    document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    location.reload();
  });
}

/* -------------------------------------------------
   RANDOM POSITION – used on load & on YOUR click
------------------------------------------------- */
function getRandomPosition() {
  const mainRect = main.getBoundingClientRect();
  const moleRect = mole.getBoundingClientRect();
  const maxX = mainRect.width - moleRect.width;
  const maxY = mainRect.height - moleRect.height;

  let x, y;
  do {
    x = Math.random() * maxX;
    y = Math.random() * maxY;
  } while (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 100);

  lastPos = { x, y };
  return { x, y };
}
function moveMole() {
  const { x, y } = getRandomPosition();
  mole.style.left = `${x}px`;
  mole.style.top  = `${y}px`;
}

/* -------------------------------------------------
   UNIVERSAL TIMER – synced with server
------------------------------------------------- */
let serverDayStart = null;   // timestamp when current day began (ms)

function updateTimerDisplay(secondsLeft) {
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  timeLeftValue.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function startUniversalTimer() {
  setInterval(() => {
    if (gameLost) return;
    const now = Date.now();
    const elapsed = Math.floor((now - serverDayStart) / 1000);
    const left = Math.max(0, 24 * 3600 - elapsed);
    updateTimerDisplay(left);
    if (left <= 0) endDay();
  }, 1000);
}

/* -------------------------------------------------
   FETCH STATE (stats + dayStart) – every second
------------------------------------------------- */
async function syncState() {
  try {
    const res = await fetch('/api/state');
    const st  = await res.json();

    // ---- stats (global for everyone) ----
    dayCounterValue.textContent      = st.day;
    yesterdayClicksValue.textContent = st.yesterdayClicks;
    todayClicksValue.textContent     = st.todayClicks;
    remainingClicksValue.textContent = st.remaining;

    // ---- universal timer ----
    if (st.dayStart && !serverDayStart) {
      serverDayStart = st.dayStart;          // first time we see it
      startUniversalTimer();
      const elapsed = Math.floor((Date.now() - serverDayStart) / 1000);
      const left = Math.max(0, 24 * 3600 - elapsed);
      updateTimerDisplay(left);
    }

    // ---- game over ----
    if (st.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks today.');
    }
  } catch (e) { console.error('syncState error', e); }
}

/* -------------------------------------------------
   CLICK – YOUR click only
------------------------------------------------- */
mole.addEventListener('click', async e => {
  e.stopPropagation();
  if (gameLost) return;

  console.log('Click sent');
  try {
    const r = await fetch('/api/click', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      console.log('Click status: 200');
      moveMole();          // mole jumps **only for you**
      await syncState();   // refresh live numbers
    } else {
      console.log('Click failed', d);
    }
  } catch (err) { console.error('Click error', err); }
});

/* -------------------------------------------------
   DAY END
------------------------------------------------- */
async function endDay() {
  if (gameLost) return;
  console.log('Day ending...');
  try {
    const r = await fetch('/api/day-end', { method: 'POST' });
    const d = await r.json();
    console.log('Day end response', d);
    if (d.success) {
      serverDayStart = null;   // force re-sync on next poll
      await syncState();
    } else if (d.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks.');
    }
  } catch (err) { console.error('Day end error', err); }
}

/* -------------------------------------------------
   DEV: SKIP TIME (admin only – needs server endpoint)
------------------------------------------------- */
async function skipTime(seconds) {
  try {
    await fetch('/api/skip-time', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds })
    });
    serverDayStart = null;
    await syncState();
  } catch (err) { console.error('skipTime error', err); }
}

/* -------------------------------------------------
   INITIAL LOAD
------------------------------------------------- */
(async () => {
  // 1. Put mole somewhere
  const init = getRandomPosition();
  mole.style.left = `${init.x}px`;
  mole.style.top  = `${init.y}px`;

  // 2. First state sync (gets dayStart)
  await syncState();

  // 3. Keep syncing every second
  setInterval(syncState, 1000);
})();
