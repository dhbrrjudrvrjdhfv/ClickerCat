const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');

let gameLost = false;

// Remove all old timer variables and functions

async function updateState() {
  try {
    const [stateRes, timeRes] = await Promise.all([
      fetch('/api/state'),
      fetch('/api/time')
    ]);
    const state = await stateRes.json();
    const time = await timeRes.json();

    dayCounterValue.textContent = state.day;
    yesterdayClicksValue.textContent = state.yesterdayClicks;
    todayClicksValue.textContent = state.todayClicks;
    remainingClicksValue.textContent = state.remaining;

    const h = Math.floor(time.secondsLeft / 3600).toString().padStart(2, '0');
    const m = Math.floor((time.secondsLeft % 3600) / 60).toString().padStart(2, '0');
    const s = (time.secondsLeft % 60).toString().padStart(2, '0');
    timeLeftValue.textContent = `${h}:${m}:${s}`;

    if (time.secondsLeft <= 0 && !gameLost) {
      endDay();
    }
  } catch (err) {
    console.error('Update error:', err);
  }
}

async function endDay() {
  if (gameLost) return;
  try {
    const res = await fetch('/api/day-end', { method: 'POST' });
    const data = await res.json();
    if (data.lost) {
      gameLost = true;
      alert('Game Over! Not enough clicks today.');
    }
    // else success → new day + new timestamp already set server-side
  } catch (err) {
    console.error('Day end error:', err);
  }
}

mole.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (gameLost) return;
  try {
    const res = await fetch('/api/click', { method: 'POST' });
    if (res.ok) {
      const pos = getRandomPosition();
      mole.style.left = `${pos.x}px`;
      mole.style.top = `${pos.y}px`;
    }
  } catch (err) {
    console.error(err);
  }
});

// Random position (unchanged)
let lastPosition = null;
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

// Initial position
const initialPos = getRandomPosition();
mole.style.left = `${initialPos.x}px`;
mole.style.top = `${initialPos.y}px`;

// DEV TOOLS REMOVED (they break central time)
// Remove the entire <div id="dev-tools"> from index.html too

// Update everything every second
setInterval(updateState, 1000);
updateState(); // first call
