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
let secondsLeft = 86400; // will sync with server

async function checkNickname() {
  const res = await fetch('/api/check-nickname');
  const data = await res.json();
  if (!data.hasNickname) {
    let nick;
    while (true) {
      nick = prompt("Choose your permanent Nickname!\nBe respectful or no eligibility to rewards.")?.trim();
      if (!nick || nick.length < 1 || nick.length > 30) continue;
      const r = await fetch('/api/set-nickname', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({nickname:nick})
      });
      const result = await r.json();
      if (result.success) break;
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

window.showPlayerInfo = (nickname, rank, todayClicks) => {
  let leaderboard = [];
  try { leaderboard = es.lastEventData ? JSON.parse(es.lastEventData).leaderboard || [] : []; } catch(e){}
  const player = leaderboard.find(p => p.nickname === nickname) || {total_clicks:0, streak:0, first_seen:new Date().toISOString(), days_played:1, last_click:null};
  const avg = player.days_played>0?Math.round(player.total_clicks/player.days_played):0;
  const online = player.last_click && (Date.now()-new Date(player.last_click))<60000;
  const status = online ? '<span style="color:#0f0">ONLINE</span>' : '<span style="color:#f55">OFFLINE</span>';
  const firstSeen = new Date(player.first_seen).toLocaleDateString();
  document.getElementById('playerInfoData').innerHTML = `
    <div style="font-family:'Courier New',monospace;color:#fff;line-height:1.75;font-size:17px">
      Player:     ${nickname}<br>
      Rank:       #${rank}<br>
      Today:      ${todayClicks.toLocaleString()} clicks<br>
      Lifetime:   ${player.total_clicks.toLocaleString()} clicks<br>
      Streak:     ${player.streak} day${player.streak===1?'':'s'}<br>
      First seen: ${firstSeen}<br>
      Avg/day:    ${avg.toLocaleString()} clicks<br><br>
      ${status}
    </div>
  `;
  playerInfoModal.classList.remove('hidden');
};

function randomPos() {
  const area = document.getElementById('gameArea');
  const maxX = area.clientWidth - 90;
  const maxY = area.clientHeight - 90;
  let x,y;
  do { x = Math.random()*maxX; y=Math.random()*maxY; } while(lastPos && Math.hypot(x-lastPos.x,y-lastPos.y)<150);
  lastPos={x,y};
  return {x,y};
}
function moveMoleForMe() { const pos=randomPos(); mole.style.left=pos.x+'px'; mole.style.top=pos.y+'px'; }
moveMoleForMe();

const es = new EventSource('/api/live');
es.onmessage = e=>{
  es.lastEventData=e.data;
  const d=JSON.parse(e.data);
  secondsLeft=d.secondsLeft;
  daySpan.textContent=d.day;
  yesterdaySpan.textContent=d.yesterdayClicks;
  todaySpan.textContent=d.todayClicks;
  remainingSpan.textContent=d.remaining;
  if(d.player){
    playerRank.textContent=d.player.rank==='-'?'#−':`#${d.player.rank}`;
    playerNick.textContent=d.player.nickname;
    playerClicks.textContent=`${d.player.clicks} Clicks Today`;
  }
  if(d.leaderboard){
    leaderboardList.innerHTML=d.leaderboard.map((p,i)=>{
      const online=p.last_click && (Date.now()-new Date(p.last_click))<60000;
      const color=online?'#0f0':'#f55';
      return `<div class="leaderboard-entry">
        <div class="leaderboard-entry-left" style="color:${color}">#${i+1} ${p.nickname}</div>
        <div class="leaderboard-entry-right">
          <span>${p.clicks}</span>
          <button class="info-btn" onclick="showPlayerInfo('${p.nickname}',${i+1},${p.clicks})">I</button>
        </div>
      </div>`;
    }).join('');
  }
  if(!gameLost && d.remaining>0 && d.secondsLeft<=0){
    gameLost=true;
    mole.style.display='none';
    document.querySelectorAll('.stat').forEach(el=>el.classList.add('game-over'));
  }
};

// Local countdown for smooth timer
setInterval(()=>{
  if(secondsLeft>0) secondsLeft--;
  const h=String(Math.floor(secondsLeft/3600)).padStart(2,'0');
  const m=String(Math.floor((secondsLeft%3600)/60)).padStart(2,'0');
  const s=String(secondsLeft%60).padStart(2,'0');
  timeSpan.textContent=`${h}:${m}:${s}`;
},1000);

mole.onclick=async()=>{
  if(!gameLost){
    moveMoleForMe();
    await fetch('/api/click',{method:'POST'});
  }
};

skipBtn.onclick=async()=>await fetch('/api/skip-day',{method:'POST'});
