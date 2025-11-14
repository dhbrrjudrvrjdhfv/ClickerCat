// script.js
const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');

let todayClicks = 0;
let yesterdayClicks = 0;
let dayCounter = 100;
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

// Update remaining (display only, never negative)
function updateRemaining() {
const remaining = yesterdayClicks - todayClicks;
remainingClicksValue.textContent = Math.max(0, remaining);
}

// Timer display
function updateTimer() {
const hours = Math.floor(totalSecondsLeft / 3600);
const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
const seconds = totalSecondsLeft % 60;
timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Game over
function showGameOver() {
gameLost = true;
timerRunning = false;
mole.style.display = 'none';

const values = [
yesterdayClicksValue,
remainingClicksValue,
todayClicksValue,
timeLeftValue,
dayCounterValue
];

values.forEach(v => {
v.textContent = 'X';
v.classList.add('lost');
});
}

// Day end
function triggerDayEnd() {
if (totalSecondsLeft > 0 || !timerRunning) return;

// Win: met or beat yesterday's clicks
if (todayClicks >= yesterdayClicks) {
yesterdayClicks = todayClicks;
yesterdayClicksValue.textContent = yesterdayClicks;

todayClicks = 0;
todayClicksValue.textContent = todayClicks;
updateRemaining();

if (dayCounter > 0) {
dayCounter--;
dayCounterValue.textContent = dayCounter;

if (dayCounter === 0) {
timerRunning = false;
totalSecondsLeft = 0;
updateTimer();
return;
}
}

totalSecondsLeft = 24 * 60 * 60;
updateTimer();
} else {
showGameOver();
}
}

// Countdown
setInterval(() => {
if (timerRunning && totalSecondsLeft > 0) {
totalSecondsLeft--;
updateTimer();
if (totalSecondsLeft === 0) triggerDayEnd();
}
}, 1000);

// Init
updateTimer();
updateRemaining();

// Mole
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
if (!timerRunning || gameLost) return;

e.stopPropagation();
todayClicks++;
todayClicksValue.textContent = todayClicks;
updateRemaining();
moveMole();
});