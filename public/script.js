const mole = document.getElementById('mole');
const skipBtn = document.getElementById('skipBtn');
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
const playerInfoModal = document.getElementById('playerInfoModal');
const closePlayerInfo = document.getElementById('closePlayerInfo');
const playerInfoData = document.getElementById('playerInfoData');

let lastPos = null;
let lastClickCount = 0;

async function checkNickname() {
  try {
    const res = await fetch('/api/check-nickname');
    const data = await res.json();
    if (!data.hasNickname) modal.classList.remove('hidden');
  } catch(e) {
    modal.classList.remove('hidden');
  }
}
checkNickname();

submitBtn.onclick = async () => {
  const nick = nicknameInput.value.trim();
  if (nick.length < 2) return alert('Min 2 characters');
  const res = await fetch('/api/set-nickname', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({nickname: nick})
  });
  const data = await res.json();
  if (data.success) modal.classList.add('hidden');
  else alert(data.error || 'Failed');
};

closePlayerInfo.onclick = () => playerInfoModal.classList.add('hidden');

window.showPlayerInfo = (nickname, rank, clicks) => {
  playerInfoData.textContent = `Player: ${nickname}\nRank: #${rank}\nClicks today: ${clicks}`;
  playerInfoModal.classList.remove('hidden');
};

skipBtn.onclick = async () => {
  await fetch('/api/skip-day', {method: 'POST'});
};

function randomPos() {
  const area = document.getElementById('gameArea');
  const maxX = area.clientWidth - 90;
  const maxY = area.clientHeight - 90;
  let x, y;
  do {
    x = Math.floor(Math.random() * maxX);
    y = Math.floor(Math.random() * maxY);
  } while (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 150);
  lastPos = {x, y};
  return {x, y};
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

  if (d.player) {
    playerRank.textContent = d.player.rank === '-' ? '#−' : `#${d.player.rank}`;
    playerNick.textContent = d.player.nickname;
    playerClicks.textContent = `${d.player.clicks} Clicks Today`;
  }

  if (d.leaderboard) {
    leaderboardList.innerHTML = d.leaderboard.map((p, i) => `
      <div class="leaderboard-entry">
        <div class="leaderboard-entry-left">
          #${i+1} ${p.nickname}
        </div>
        <div class="leaderboard-entry-right">
          <span>${p.clicks}</span>
          <button class="info-btn" onclick="showPlayerInfo('${p.nickname}', ${i+1}, ${p.clicks})">I</button>
        </div>
      </div>
    `).join('');
  }

  if (d.todayClicks > lastClickCount) {
    moveMole();
    lastClickCount = d.todayClicks;
  }
};

mole.onclick = async () => {
  moveMole();
  lastClickCount++;
  await fetch('/api/click', {method: 'POST'});
};
