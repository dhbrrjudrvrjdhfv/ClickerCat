// public/script.js — Universal timer, live stats, mole only on YOUR click
const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const yesterdayClicksValue = stats[0].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const todayClicksValue = stats[2].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');

let totalSecondsLeft = 24 * 60 * 60;
let gameLost = false;
let lastPos = null;

// === DEV TOOLS (CLIENT-SIDE) ===
const devTools = document.getElementById('dev-tools');
if (devTools) {
  const skipHour = document.getElementById('skip-hour');
  const skipDay = document.getElementById('skip-day');
  const resetMe = document.getElementById('reset-me');

  skipHour?.addEventListener('click', () => {
    totalSecondsLeft = Math.max(0, totalSecondsLeft - 3600);
    updateTimerDisplay();
    if (totalSecondsLeft <= 0) endDay();
  });

  skipDay?.addEventListener('click', () => {
    totalSecondsLeft = 0;
    updateTimerDisplay();
    endDay();
  });

  resetMe?.addEventListener('click', () => {
    document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    location.reload();
  });
}

// === TIMER ===
function updateTimerDisplay() {
  const h = Math.floor(totalSecondsLeft / 3600);
  const m = Math.floor((totalSecondsLeft % 3600) / 60);
  const s = totalSecondsLeft % 60;
  timeLeftValue.textContent = `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
}

function startTimer() {
  setInterval(() => {
    if (gameLost) return;
    totalSecondsLeft = Math.max(0, totalSecondsLeft - 1);
    updateTimerDisplay();
    if (totalSecondsLeft <= 0) endDay();
  }, 1000);
}

// === MOLE ===
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
  mole.style.top = `${y}px`;
}

// === CLICK ===
mole.addEventListener('click', async e => {
  e.stopPropagation();
  if (gameLost) return;

  console.log('Click sent');
  try {
    const r = await fetch('/api/click', { method: 'POST' });
    const d = await r.json();
    if (r.ok) {
      moveMole();
      await syncState();
    }
  } catch (err) { console.error(err); }
});

// === STATE SYNC ===
async function syncState() {
  try {
    const res = await fetch('/api/state');
    const st = await res.json();

    dayCounterValue.textContent = st.day;
    yesterdayClicksValue.textContent = st.yesterdayClicks;
    todayClicksValue.textContent = st.todayClicks;
    remainingClicksValue.textContent = st.remaining;

    if (st.dayStart) {
      const elapsed = Math.floor((Date.now() - st.dayStart) / 1000);
      totalSecondsLeft = Math.max(0, 24 * 3600 - elapsed);
      updateTimerDisplay();
    }

    if (st.lost) {
      gameLost = true;
      alert('Game Over!');
    }
  } catch (e) { console.error(e); }
}

// === DAY END ===
async function endDay() {
  if (gameLost) return;
  try {
    const r = await fetch('/api/day-end', { method: 'POST' });
    const d = await r.json();
    if (d.success) {
      totalSecondsLeft = 24 * 60 * 60;
      startTimer();
      await syncState();
    } else if (d.lost) {
      gameLost = true;
      alert('Game Over!');
    }
  } catch (err) { console.error(err); }
}

// === INIT ===
(async () => {
  const init = getRandomPosition();
  mole.style.left = `${init.x}px`;
  mole.style.top = `${init.y}px`;

  await syncState();
  startTimer();
  setInterval(syncState, 1000);
})();
