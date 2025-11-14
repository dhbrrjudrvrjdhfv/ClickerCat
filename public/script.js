// public/script.js — FINAL: Works with fixed HTML
const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');

let totalSecondsLeft = 24 * 60 * 60;
let gameLost = false;
let timerRunning = true;
let lastPosition = null;

// DEV BUTTONS
const skipHourBtn = document.getElementById('skip-hour');
const skipDayBtn = document.getElementById('skip-day');

skipHourBtn.addEventListener('click', () => {
  if (!timerRunning) return;
  totalSecondsLeft = Math.max(0, totalSecondsLeft - 3600);
  updateTimer();
  if (totalSecondsLeft <= 0) triggerDayEnd();
});

skipDayBtn.addEventListener('click', () => {
  if (!timerRunning) return;
  totalSecondsLeft = 0;
  updateTimer();
  triggerDayEnd();
});

function updateTimer() {
  const hours = Math.floor(totalSecondsLeft / 3600);
  const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
  const seconds = totalSecondsLeft % 60;
  timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function showGameOver() {
  gameLost = true;
  timerRunning = false;
  mole.style.display = 'none';
  const values = [yesterdayClicksValue, remainingClicksValue, todayClicksValue, timeLeftValue, dayCounterValue];
  values.forEach(v => {
    v.textContent = 'X';
    v.classList.add('lost');
  });
}

async function triggerDayEnd() {
  if (totalSecondsLeft > 0 || !timerRunning) return;

  console.log('Day ending...');
  try {
    const res = await fetch('/api/day-end', { method: 'POST' });
    const data = await res.json();
    console.log('Day end response:', data);
    if (data.lost) {
      showGameOver();
    } else {
      totalSecondsLeft = 24 * 60 * 60;
      updateTimer();
      fetchState();
    }
  } catch (err) {
    console.error('Day end failed:', err);
    showGameOver();
  }
}

setInterval(() => {
  if (timerRunning && totalSecondsLeft > 0) {
    totalSecondsLeft--;
    updateTimer();
    if (totalSecondsLeft === 0) triggerDayEnd();
  }
}, 1000);

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    console.log('State:', data);
    updateDisplay(data);
  } catch (err) {
    console.error('State error:', err);
  }
}

function updateDisplay(data) {
  todayClicksValue.textContent = data.todayClicks || 0;
  yesterdayClicksValue.textContent = data.yesterdayClicks || 0;
  remainingClicksValue.textContent = data.remaining || 0;
  dayCounterValue.textContent = data.day || 100;
}

async function recordClick() {
  if (!timerRunning || gameLost) return;
  console.log('Click sent');
  try {
    const res = await fetch('/api/click', { method: 'POST' });
    console.log('Click status:', res.status);
    if (res.ok) {
      fetchState();
    }
  } catch (err) {
    console.error('Click failed:', err);
  }
}

function getRandomPosition() {
  const mainRect = main.getBoundingClientRect();
  const buttonRect = mole.getBoundingClientRect();
  const maxX = mainRect.width - buttonRect.width;
  const maxY = mainRect.height - buttonRect.height;
  let x, y;
  do {
    x = Math.random() * maxX;
    y = Math.random() * maxY;
  } while (lastPosition && Math.abs(x - lastPosition.x) < 50 && Math.abs(y - lastPosition.y) < 50);
  lastPosition = { x, y };
  return { x, y };
}

function moveMole() {
  if (!timerRunning || gameLost) return;
  const pos = getRandomPosition();
  mole.style.left = `${pos.x}px`;
  mole.style.top = `${pos.y}px`;
}

moveMole();

mole.addEventListener('click', (e) => {
  e.stopPropagation();
  recordClick();
  moveMole();
});

updateTimer();
fetchState();
