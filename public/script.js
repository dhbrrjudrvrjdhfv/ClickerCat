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

let lastPos = null;
let myClicksToday = 0;

// NICKNAME → native browser prompt
async function checkNickname() {
  const res = await fetch('/api/check-nickname');
  const data = await res.json();
  if (!data.hasNickname) {
    let nick;
    while (true) {
      nick = prompt("Choose your permanent Nickname!\nBe respectful or no eligibility to rewards.")?.trim();
      if (!nick || nick.length < 1) continue;
      const r = await fetch('/api/set-nickname', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({nickname: nick})
      });
      const result = await r.json();
      if (result.success) { alert("Nickname set: " + nick); break; }
      else alert(result.error || "Try another name");
    }
  }
}
checkNickname();

// PLAYER INFO MODAL (created dynamically)
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

// MOLE – moves only for the player who clicked
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

// LIVE DATA
const es = new EventSource('/api/live');
es.onmessage = e => {
  const d = JSON.parse(e.data);
  daySpan.textContent = d.day;
  yesterdaySpan.textContent = d.yesterdayClicks;
  todaySpan.textContent = d.todayClicks;
  remainingSpan.textContent = d.remaining;
  const s = d.secondsLeft;
  timeSpan.textContent = `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  if (d.player) {
    playerRank.textContent = d.player.rank === '-' ? '#−' : `#${d.player.rank}`;
    playerNick.textContent = d.player.nickname;
    playerClicks.textContent = `${d.player.clicks} Clicks Today`;
    if (d.player.clicks > myClicksToday) moveMoleForMe();
    myClicksToday = d.player.clicks;
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

// CLICK & SKIP
mole.onclick = async () => { moveMoleForMe(); await fetch('/api/click', {method:'POST'}); };
skipBtn.onclick = async () => await fetch('/api/skip-day', {method:'POST'});
