const mole = document.getElementById('mole');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');

let gameLost = false;
let dayEndInProgress = false;

function getRandomPosition() {
  const main = document.querySelector('.main');
  const mainRect = main.getBoundingClientRect();
  const moleRect = mole.getBoundingClientRect();
  const maxX = mainRect.width - moleRect.width;
  const maxY = mainRect.height - moleRect.height;
  let x, y, last = null;
  do {
    x = Math.random() * maxX;
    y = Math.random() * maxY;
  } while (last && Math.hypot(x - last.x, y - last.y) < 100);
  last = { x, y };
  return { x, y };
}

// === LIVE SSE CONNECTION ===
const evtSource = new EventSource('/api/live');

evtSource.onmessage = (event) => {
  const data = JSON.parse(event.data);

  dayCounterValue.textContent = data.day;
  yesterdayClicksValue.textContent = data.yesterdayClicks;
  todayClicksValue.textContent = data.todayClicks;
  remainingClicksValue.textContent = data.remaining;

  const h = String(Math.floor(data.secondsLeft / 3600)).padStart(2, '0');
  const m = String(Math.floor((data.secondsLeft % 3600) / 60)).padStart(2, '0');
  const s = String(data.secondsLeft % 60).padStart(2, '0');
  timeLeftValue.textContent = `${h}:${m}:${s}`;

  if (data.secondsLeft <= 0 && !gameLost && !dayEndInProgress) {
    endDay();
  }
};

evtSource.onerror = () => {
  console.log('SSE disconnected — reconnecting...');
};

// === Click handling (instant feel + server is truth) ===
mole.addEventListener('click', async () => {
  if (gameLost) return;

  // optimistic +1
  todayClicksValue.textContent = parseInt(todayClicksValue.textContent) + 1;

  try {
    await fetch('/api/click', { method: 'POST' });
  } catch (e) {
    // if failed, server will correct us on next broadcast
  }
});

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

// Skip Day
document.getElementById('skip-day')?.addEventListener('click', () => {
  fetch('/api/force-midnight', { method: 'POST' });
});

// Initial position
const pos = getRandomPosition();
mole.style.left = `${pos.x}px`;
mole.style.top = `${pos.y}px`;
