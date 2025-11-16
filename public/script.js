// public/script.js — FIXED: No crash, timer runs, skip works
const mole = document.getElementById('mole');
const main = document.querySelector('.main');
const stats = document.querySelectorAll('.stat');
const todayClicksValue = stats[2].querySelector('.value');
const remainingClicksValue = stats[1].querySelector('.value');
const dayCounterValue = stats[4].querySelector('.value');
const yesterdayClicksValue = stats[0].querySelector('.value');
const timeLeftValue = stats[3].querySelector('.value');  // ← ADD THIS

let totalSecondsLeft = 24*60*60;
let gameLost = false;
let timerRunning = true;
let lastPosition = null;

// === SKIP TIME (DEV) ===  ← MOVED UP
function skipTime(seconds) {
    totalSecondsLeft = Math.max(0, totalSecondsLeft - seconds);
    updateTimerDisplay();
    if (totalSecondsLeft <= 0) endDay();
}

// === DEV TOOLS ===
const devTools = document.getElementById('dev-tools');
if (devTools) {
    const skipHour = document.getElementById('skip-hour');
    const skipDay = document.getElementById('skip-day');
    const resetMe = document.getElementById('reset-me');
    if (skipHour) skipHour.addEventListener('click', () => skipTime(3600));
    if (skipDay) skipDay.addEventListener('click', () => skipTime(24*3600));
    if (resetMe) resetMe.addEventListener('click', () => {
        document.cookie = 'playerId=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        location.reload();
    });
}

// === REST OF CODE (unchanged) ===
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

function updateTimerDisplay() {
    const hours = Math.floor(totalSecondsLeft/3600);
    const minutes = Math.floor((totalSecondsLeft % 3600)/60);
    const seconds = totalSecondsLeft % 60;
    timeLeftValue.textContent = `${hours.toString().padStart(2,'0')}:${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
}

function startTimer() {
    if (!timerRunning || gameLost) return;
    totalSecondsLeft--;
    updateTimerDisplay();
    if (totalSecondsLeft <= 0) {
        endDay();
        return;
    }
    setTimeout(startTimer,1000);
}

mole.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (gameLost || !timerRunning) return;
    try {
        const res = await fetch('/api/click',{method:'POST'});
        const data = await res.json();
        if (res.ok) {
            moveMoleOnClick();
            await updateState();
        }
    } catch (err) { console.error('Click error:',err); }
});

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
    } catch (err) { console.error('State fetch error:',err); }
}
setInterval(updateState,1000);

async function endDay() {
    if (gameLost) return;
    timerRunning = false;
    try {
        const res = await fetch('/api/day-end',{method:'POST'});
        const data = await res.json();
        if (data.success) {
            try {
                const t = await fetch('/api/time');
                const timeData = await t.json();
                if (timeData.secondsLeft !== undefined) totalSecondsLeft = timeData.secondsLeft;
            } catch(e) { console.error('Time fetch error',e); }
            updateTimerDisplay();
            timerRunning = true;
            startTimer();
            await updateState();
        } else if (data.lost) {
            gameLost = true;
            alert('Game Over! Not enough clicks.');
        }
    } catch (err) { console.error('Day end error:',err); }
}

(async () => {
    try {
        const t = await fetch('/api/time');
        const timeData = await t.json();
        if (timeData.secondsLeft !== undefined) totalSecondsLeft = timeData.secondsLeft;
    } catch(e) { console.error('Initial time fetch error',e); }
    await updateState();
    updateTimerDisplay();
    startTimer();
    const initialPos = getRandomPosition();
    mole.style.left = `${initialPos.x}px`;
    mole.style.top = `${initialPos.y}px`;
})();
