// script.js — FIXED: Timer synced with server

const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');

let totalSecondsLeft = 86400;
let gameLost = false;
let timerRunning = true;
let lastPosition = null;

// **************************************
// NEW: Get time from server
// **************************************
async function syncTime() {
    const res = await fetch('/api/time');
    const t = await res.json();

    totalSecondsLeft = t.secondsLeft;
}

// === DEV TOOLS ===
const devTools = document.getElementById('dev-tools');
if (devTools) {
    const skipHour = document.getElementById('skip-hour');
    const skipDay = document.getElementById('skip-day');
    const resetMe = document.getElementById('reset-me');

    if (skipHour) {
        skipHour.addEventListener('click', () => skipTime(3600));
    }
    if (skipDay) {
        skipDay.addEventListener('click', () => skipTime(24 * 3600));
    }
    if (resetMe) {
        resetMe.addEventListener('click', () => {
            document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
            location.reload();
        });
    }
}

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

function moveMoleOnClick() {
    const pos = getRandomPosition();
    mole.style.left = `${pos.x}px`;
    mole.style.top = `${pos.y}px`;
}

// **************************************
// TIMER DISPLAY
// **************************************
function updateTimerDisplay() {
    const hours = Math.floor(totalSecondsLeft / 3600);
    const minutes = Math.floor((totalSecondsLeft % 3600) / 60);
    const seconds = totalSecondsLeft % 60;

    const timeLeftValue = stats[3].querySelector('.value');
    timeLeftValue.textContent = `${hours.toString().padStart(2, '0')}:${minutes
        .toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// **************************************
// TIMER LOOP (LOCAL but synced to server start)
–**************************************
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

function skipTime(seconds) {
    totalSecondsLeft = Math.max(0, totalSecondsLeft - seconds);
    updateTimerDisplay();
    if (totalSecondsLeft <= 0) endDay();
}

// CLICK HANDLING
mole.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (gameLost || !timerRunning) return;

    try {
        const res = await fetch('/api/click', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            moveMoleOnClick();
            await updateState();
        }
    } catch (err) {
        console.error('Click error:', err);
    }
});

// LIVE STATE UPDATE
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
            alert('Game Over! Not enough clicks today.');
        }
    } catch (err) {
        console.error('State fetch error:', err);
    }
}

setInterval(updateState, 1000);

// **************************************
// DAY END (now also resyncs timer)
// **************************************
async function endDay() {
    if (gameLost) return;
    timerRunning = false;

    try {
        const res = await fetch('/api/day-end', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
            // Reset timer
            await syncTime();
            updateTimerDisplay();
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

// **************************************
// INITIALIZE GAME
// **************************************
(async () => {
    await syncTime();
    await updateState();
    updateTimerDisplay();
    startTimer();

    const initialPos = getRandomPosition();
    mole.style.left = `${initialPos.x}px`;
    mole.style.top = `${initialPos.y}px`;
})();
