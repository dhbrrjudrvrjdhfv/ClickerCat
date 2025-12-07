const mole = document.getElementById('mole');
const skipBtn = document.getElementById('skipBtn');
const todaySpan = document.getElementById('today');
const remainingSpan = document.getElementById('remaining');
const yesterdaySpan = document.getElementById('yesterday');
const timeSpan = document.getElementById('time');
const daySpan = document.getElementById('day');
const leaderboardList = document.getElementById('leaderboardList');
const playerRank = document.getElementById('playerRank');
const playerNick = document.getElementById('playerNick');
const playerClicks = document.getElementById('playerClicks');
let gameLost = false;
let lastPos = null;
async function checkNickname() {
  const res = await fetch('/api/check-nickname');
  const data = await res.json();
  if (!data.hasNickname) {
    let nick;
    while (true) {
      nick = prompt("Choose your permanent Nickname!\nBe respectful or no eligibility to rewards.")?.trim();
      if (!nick || nick.length < 1 || nick.length > 30) continue;
      const r = await fetch('/api/set-nickname', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nickname:nick})});
      const result = await r.json();
      if (result.success) { break; }
      else alert(result.error || "Try another name");
    }
  }
}
checkNickname();
const playerInfoModal = document.createElement('div');
playerInfoModal.id = 'playerInfoModal';
playerInfoModal.className = 'hidden';
playerInfoModal.innerHTML = `<div id="playerInfoContent"><button id="closePlayerInfo">X</button><div id="playerInfoData"></div></div>`;
document.body.appendChild(playerInfoModal);
document.getElementById('closePlayerInfo').addEventListener('click', () => playerInfoModal.classList.add('hidden'));
window.showPlayerInfo = (nickname, rank, clicks) => {
  document.getElementById('playerInfoData').textContent = `Player: ${nickname}\nRank: #${rank}\nClicks today: ${clicks}`;
  playerInfoModal.classList.remove('hidden');
};
function randomPos() {
  const area = document.getElementById('gameArea');
  const maxX = area.clientWidth - 90;
  const maxY = area.clientHeight - 90;
  let x, y;
  do { x = Math.random() * maxX; y = Math.random() * maxY; }
  while (lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 150);
  lastPos = {x, y};
  return {x, y};
}
function moveMoleForMe() {
  const pos = randomPos();
  mole.style.left = pos.x + 'px';
  mole.style.top = pos.y + 'px';
}
moveMoleForMe();
const es = new EventSource('/api/live');
es.onmessage = e => {
  const d = JSON.parse(e.data);
  if (!gameLost && d.remaining > 0 && d.secondsLeft <= 0) {
    gameLost = true;
    mole.style.display = 'none';
    document.querySelectorAll('.stat').forEach(el => el.classList.add('game-over'));
  }
  daySpan.textContent = d.day;
  yesterdaySpan.textContent = d.yesterdayClicks;
  todaySpan.textContent = d.todayClicks;
  remainingSpan.textContent = d.remaining;
  timeSpan.textContent = d.secondsLeft <= 0 ? "00:00:00" :
    `${String(Math.floor(d.secondsLeft/3600)).padStart(2,'0')}:${String(Math.floor((d.secondsLeft%3600)/60)).padStart(2,'0')}:${String(d.secondsLeft%60).padStart(2,'0')}`;
  if (d.player) {
    playerRank.textContent = d.player.rank === '-' ? '#−' : `#${d.player.rank}`;
    playerNick.textContent = d.player.nickname;
    playerClicks.textContent = `${d.player.clicks} Clicks Today`;
  }
  if (d.leaderboard) {
    leaderboardList.innerHTML = d.leaderboard.map((p, i) => `
      <div class="leaderboard-entry">
        <div class="leaderboard-entry-left">#${i+1} ${p.nickname}</div>
        <div class="leaderboard-entry-right">
          <span>${p.clicks}</span>
          <button class="info-btn" onclick="showPlayerInfo('${p.nickname}',${i+1},${p.clicks})">I</button>
        </div>
      </div>
    `).join('');
  }
};
mole.onclick = async () => {
  if (!gameLost) {
    moveMoleForMe();
    await fetch('/api/click', {method:'POST'});
  }
};
skipBtn.onclick = async () => await fetch('/api/skip-day', {method:'POST'});
