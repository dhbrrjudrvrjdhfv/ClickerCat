const mole = document.getElementById('mole');
const todaySpan = document.getElementById('today');
const remainingSpan = document.getElementById('remaining');
const yesterdaySpan = document.getElementById('yesterday');
const timeSpan = document.getElementById('time');
const daySpan = document.getElementById('day');
const modal = document.getElementById('nicknameModal');
const nicknameInput = document.getElementById('nicknameInput');
const submitBtn = document.getElementById('submitNickname');
const leaderboardList = document.getElementById('leaderboardList');
const playerRank = document.getElementById('playerRank');
const playerNick = document.getElementById('playerNick');
const playerClicks = document.getElementById('playerClicks');

let lastPos = null;
let lastClickCount = 0;
let hasNickname = localStorage.getItem('hasNickname') === 'true';

if (!hasNickname) {
  modal.classList.remove('hidden');
}

submitBtn.onclick = async () => {
  const nick = nicknameInput.value.trim();
  if (nick.length < 2) {
    alert('Nickname must be at least 2 characters');
    return;
  }
  try {
    const res = await fetch('/api/set-nickname', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({nickname: nick})
    });
    if (res.ok) {
      localStorage.setItem('hasNickname', 'true');
      modal.classList.add('hidden');
    }
  } catch(e) {
    alert('Error setting nickname');
  }
};

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

async function updateLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    
    leaderboardList.innerHTML = data.leaderboard.map((p, i) => 
      `<div class="leaderboard-entry"><span>#${i+1} ${p.nickname}</span><span>${p.clicks}</span></div>`
    ).join('');

    if (data.player) {
      playerRank.textContent = `#${data.player.rank}`;
      playerNick.textContent = data.player.nickname;
      playerClicks.textContent = `${data.player.clicks} Clicks Today`;
    }
  } catch(e) {}
}

setInterval(updateLeaderboard, 2000);
updateLeaderboard();

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
