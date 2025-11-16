// public/script.js — FINAL: Live stats only, NO mole movement, NO fake clicks
const mole = document.getElementById('mole');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');

let totalSecondsLeft = 24 * 60 * 60;
let gameLost = false;
let timerRunning = true;

// === DEV TOOLS ===
const devTools = document.getElementById('dev-tools');
if (devTools) {
  const skipHour = document.getElementById('skip-hour');
  const skipDay = document.getElementById('skip-day');
  const resetMe = document.getElementById('reset-me');

  if (skipHour) skipHour.addEventListener('click', () => skipTime(3600));
  if (skipDay) skipDay.addEventListener('click', () => skipTime(24 * 3600));
  if (resetMe) resetMe.addEventListener('click', () => {
    document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    location.reload();
  });
}

// === COUNTDOWN TIMER ===
function updateTimerDisplay() {
  const hours = Math.floor(totalSecondsLeft / 3600);
  const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
  const seconds = totalSecondsLeft % 60;

  const timeLeftValue = stats[3].querySelector('.value');
  timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function startTimer() {
  if (!timerRunning || gameLost) return;

  totalSecondsLeft--;
  updateTimerDisplay();

  if (totalSecondsLeft <= 0) {
    endDay();
    return;
  }

  setTimeout(startTimer, 1000);
}

// === SKIP TIME (DEV) ===
function skipTime(seconds) {
  totalSecondsLeft = Math.max(0, totalSecondsLeft - seconds);
  updateTimerDisplay();
  if (totalSecondsLeft <= 0) endDay();
}

// === CLICK HANDLER ===
mole.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (gameLost || !timerRunning) return;

  console.log('Click sent');
  try {
    const res = await fetch('/api/click', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      console.log('Click status: 200');
      await updateState(); // Live update
    } else {
      console.log('Click failed:', data);
    }
  } catch (err) {
    console.error('Click error:', err);
  }
});

// === LIVE STATE UPDATE (EVERY 1 SECOND) ===
async function updateState() {
  try {
    const res = await fetch('/api/state');
    const state = await res.json();

    dayCounterValue.textContent = state.day;
    yesterdayClicksValue.textContent = state.yesterdayClicks;
    todayClicksValue.textContent = state.todayClicks;
    remainingClicksValue.textContent = state.remaining;

    // Handle game over
    if (state.lost) {
      gameLost = true;
      timerRunning = false;
      alert('Game Over! Not enough clicks today.');
    }
  } catch (err) {
    console.error('State fetch error:', err);
  }
}

// Poll state every 1 second
setInterval(updateState, 1000);

// === DAY END ===
async function endDay() {
  if (gameLost) return;
  timerRunning = false;
  console.log('Day ending...');

  try {
    const res = await fetch('/api/day-end', { method: 'POST' });
    const data = await res.json();
    console.log('Day end response:', data);

    if (data.success) {
      totalSecondsLeft = 24 * 60 * 60;
      timerRunning = true;
      startTimer();
      await updateState();
    } else if (data.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks.');
    }
  } catch (err) {
    console.error('Day end error:', err);
  }
}

// === INITIALIZE ===
(async () => {
  await updateState();
  updateTimerDisplay();
  startTimer();
})();
