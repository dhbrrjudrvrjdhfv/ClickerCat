const mole = document.getElementById('mole');
const todaySpan = document.getElementById('today');
const remainingSpan = document.getElementById('remaining');
const yesterdaySpan = document.getElementById('yesterday');
const timeSpan = document.getElementById('time');
const daySpan = document.getElementById('day');
let lastPos = null;
let lastClickCount = 0;
function randomPos() {
  const gameArea = document.getElementById('gameArea');
  const rect = gameArea.getBoundingClientRect();
  const moleRect = mole.getBoundingClientRect();
  const maxX = rect.width - moleRect.width;
  const maxY = rect.height - moleRect.height;
  let x, y;
  do {
    x = Math.floor(Math.random() * maxX);
    y = Math.floor(Math.random() * maxY);
  } while (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 130);
  lastPos = { x, y };
  return { x, y };
}
function moveMole() {
  const pos = randomPos();
  mole.style.left = pos.x + 'px';
  mole.style.top = pos.y + 'px';
}
moveMole();
const es = new EventSource('/api/live');
es.onmessage = e => {
  const d = JSON.parse(e.data);
  daySpan.textContent = d.day;
  yesterdaySpan.textContent = d.yesterdayClicks;
  todaySpan.textContent = d.todayClicks;
  remainingSpan.textContent = d.remaining;
  const s = d.secondsLeft;
  const h = String(Math.floor(s/3600)).padStart(2,'0');
  const m = String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sec = String(s%60).padStart(2,'0');
  timeSpan.textContent = `${h}:${m}:${sec}`;
  if (d.todayClicks > lastClickCount) {
    moveMole();
    lastClickCount = d.todayClicks;
  }
};
mole.onclick = async () => {
  moveMole();
  lastClickCount++;
  try { await fetch('/api/click', {method:'POST'}); } catch(e) {}
};
