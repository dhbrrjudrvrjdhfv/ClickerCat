const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');

let gameLost = false;
let lastPosition = null;
let previousSecondsLeft = 86400;
let dayEndInProgress = false;

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

async function updateEverything() {
  try {
    const [stateRes, timeRes] = await Promise.all([fetch('/api/state'), fetch('/api/time')]);
    const state = await stateRes.json();
    const time = await timeRes.json();

    dayCounterValue.textContent = state.day;
    yesterdayClicksValue.textContent = state.yesterdayClicks;
    todayClicksValue.textContent = state.todayClicks;
    remainingClicksValue.textContent = state.remaining;

    // PERFECT GLOBAL TIMER — same on every device
    const now = Date.now();
    const elapsed = Math.floor((now - time.dayStart) / 1000);
    const secondsLeft = Math.max(0, 86400 - elapsed);

    const h = String(Math.floor(secondsLeft / 3600)).padStart(2, '0');
    const m = String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, '0');
    const s = String(secondsLeft % 60).padStart(2, '0');
    timeLeftValue.textContent = `${h}:${m}:${s}`;

    if (previousSecondsLeft > 0 && secondsLeft <= 0 && !gameLost && !dayEndInProgress) {
      endDay();
    }
    previousSecondsLeft = secondsLeft;
  } catch (e) {}
}

async function endDay() {
  if (gameLost || dayEndInProgress) return;
  dayEndInProgress = true;
  try {
    const res = await fetch('/api/day-end', { method: 'POST' });
    const data = await res.json();
    if (data.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks today.');
    }
  } catch (e) {}
  setTimeout(() => dayEndInProgress = false, 8000);
}

mole.addEventListener('click', async () => {
  if (gameLost) return;
  try {
    const res = await fetch('/api/click', { method: 'POST' });
    if (res.ok) {
      const pos = getRandomPosition();
      mole.style.left = `${pos.x}px`;
      mole.style.top = `${pos.y}px`;
    }
  } catch (e) {}
});

mole.style.left = `${getRandomPosition().x}px`;
mole.style.top = `${getRandomPosition().y}px`;

setInterval(updateEverything, 1000);
updateEverything();

// Skip Day → instant judgment in 3 seconds
document.getElementById('skip-day')?.addEventListener('click', async () => {
  await fetch('/api/force-midnight', { method: 'POST' });
  updateEverything();
});
