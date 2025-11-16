// public/script.js — FULL LIVE GAME: Real-time stats, countdown, mole, day-end
const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');

let totalSecondsLeft = 24 * 60 * 60;
let gameLost = false;
let timerRunning = true;
let lastPosition = null;

// === DEV TOOLS ===
const devTools = document.getElementById('dev-tools');
if (devTools) {
  const skipHour = document.getElementById('skip-hour');
  const skipDay = document.getElementById('skip-day');
  const resetMe = document.getElementById('reset-me');

  if (skipHour) skipHour.addEventListener('click', () => skipTime(3600));
  if (skipDay) skipDay.addEventListener('click', skipDayManually);
  if (resetMe) resetMe.addEventListener('click', () => {
    document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    location.reload();
  });
}

// === COUNTDOWN TIMER ===
function updateTimer() {
  if (!timerRunning || gameLost) return;

  const hours = Math.floor(totalSecondsLeft / 3600);
  const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
  const seconds = totalSecondsLeft % 60;

  const timeLeftValue = stats[3].querySelector('.value');
  timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  if (totalSecondsLeft <= 0) {
    endDay();
    return;
  }

  totalSecondsLeft--;
  setTimeout(updateTimer, 1000);
}

// === SKIP TIME (DEV) ===
function skipTime(seconds) {
  totalSecondsLeft = Math.max(0, totalSecondsLeft - seconds);
  updateTimerDisplay();
  if (totalSecondsLeft <= 0) endDay();
}

function updateTimerDisplay() {
  const hours = Math.floor(totalSecondsLeft / 3600);
  const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
  const seconds = totalSecondsLeft % 60;
  const timeLeftValue = stats[3].querySelector('.value');
  timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// === MOLE LOGIC ===
function getRandomPosition() {
  const mainRect = main.getBoundingClientRect();
  const moleRect = mole.getBoundingClientRect();
  const maxX = mainRect.width - moleRect.width;
  const maxY = mainRect.height - moleRect.height;

  let x, y;
  do {
    x = Math.random() * maxX;
    y = Math.random() * maxY;
  } while (lastPosition && Math.hypot(x - lastPosition.x, y - lastPosition.y) < 100);

  lastPosition = { x, y };
  return { x, y };
}

function moveMole() {
  if (gameLost || !timerRunning) return;
  const pos = getRandomPosition();
  mole.style.left = `${pos.x}px`;
  mole.style.top = `${pos.y}px`;
}

mole.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (gameLost || !timerRunning) return;

  console.log('Click sent');
  try {
    const res = await fetch('/api/click', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      console.log('Click status: 200');
      moveMole();
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

    if (state.lost) {
      gameLost = true;
      timerRunning = false;
      alert('You lost! Not enough clicks today.');
    }
  } catch (err) {
    console.error('State error:', err);
  }
}

// Poll every 1 second
setInterval(updateState, 1000);

// === DAY END LOGIC ===
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
      updateTimer();
      await updateState();
    } else if (data.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks.');
    }
  } catch (err) {
    console.error('Day end error:', err);
  }
}

async function skipDayManually() {
  await endDay();
}

// === INITIAL LOAD ===
(async () => {
  await updateState();
  updateTimer();
  moveMole();
  setInterval(moveMole, 2000);
})();
