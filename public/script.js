const mole = document.getElementById('mole');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');

let gameLost = false;
let dayEndInProgress = false;
let lastPos = null;
let lastClickCount = 0;        // ← NEW: tracks real clicks

function getRandomPosition() {
  const main = document.querySelector('.main');
  const mainRect = main.getBoundingClientRect();
  const moleRect = mole.getBoundingClientRect();
  const maxX = mainRect.width - moleRect.width;
  const maxY = mainRect.height - moleRect.height;

  let x, y;
  do {
    x = Math.random() * maxX;
    y = Math.random() * maxY;
  } while (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 120);
  lastPos = { x, y };
  return { x, y };
}

function moveMole() {
  if (gameLost) return;
  const pos = getRandomPosition();
  mole.style.left = `${pos.x}px`;
  mole.style.top = `${pos.y}px`;
}

// LIVE SSE
const evtSource = new EventSource('/api/live');

evtSource.onmessage = (event) => {
  const d = JSON.parse(event.data);

  dayCounterValue.textContent = d.day;
  yesterdayClicksValue.textContent = d.yesterdayClicks;
  todayClicksValue.textContent = d.todayClicks;
  remainingClicksValue.textContent = d.remaining;

  // ← ONLY move mole when the click count actually increased
  if (d.todayClicks > lastClickCount) {
    moveMole();
    lastClickCount = d.todayClicks;
  }

  const h = String(Math.floor(d.secondsLeft / 3600)).padStart(2, '0');
  const m = String(Math.floor((d.secondsLeft % 3600) / 60)).padStart(2, '0');
  const s = String(d.secondsLeft % 60).padStart(2, '0');
  timeLeftValue.textContent = `${h}:${m}:${s}`;

  if (d.secondsLeft <= 0 && !gameLost && !dayEndInProgress) endDay();
};

// YOUR click — instant local move + tell server
mole.addEventListener('click', async () => {
  if (gameLost) return;
  moveMole();                     // instant for you
  lastClickCount++;               // prevent double-jump on your own click

  try {
    await fetch('/api/click', { method: 'POST' });
  } catch (e) {}
});

async function endDay() {
  if (gameLost || dayEndInProgress) return;
  dayEndInProgress = true;
  const res = await fetch('/api/day-end', { method: 'POST' });
  const data = await res.json();
  if (data.lost) {
    gameLost = true;
    alert('Game Over! Not enough clicks today.');
  }
  setTimeout(() => dayEndInProgress = false, 8000);
}

// Dev Skip Day
document.getElementById('skip-day')?.addEventListener('click', () => {
  fetch('/api/force-midnight', { method: 'POST' });
});

// First appearance
moveMole();
lastClickCount = 0;
