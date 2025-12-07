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
      nick = prompt("Choose your nickname (1–30 characters)").trim();
      if (!nick) continue;
      if (nick.length < 1 || nick.length > 30) {
        alert("Nickname must be 1–30 characters");
        continue;
      }
      const r = await fetch('/api/set-nickname', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nick })
      });
      const result = await r.json();
      if (result.success) {
        // No extra popup – leaderboard updates automatically
        break;
      } else {
        alert(result.error || "Try another name");
      }
    }
  }
}
checkNickname();

// rest of your original script.js unchanged below...
// (modal, randomPos, moveMoleForMe, EventSource, etc.)
