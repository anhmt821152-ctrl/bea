const socket = io();

// Keys are namespaced so a tab used as host and as player never mixes them up.
const KEY_PID = 'play.pid';
const KEY_CODE = 'play.roomCode';

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  quiz: document.getElementById('screen-quiz'),
  result: document.getElementById('screen-result'),
  final: document.getElementById('screen-final')
};

let myData = { pid: null, code: null, name: '', team: '' };
let isAnswered = false;
let stopCountdown = null;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');

  if (name === 'quiz' || name === 'result') {
    document.getElementById('mini-tracker').classList.remove('hidden');
  } else {
    document.getElementById('mini-tracker').classList.add('hidden');
  }
}

function stopTimer() {
  if (stopCountdown) { stopCountdown(); stopCountdown = null; }
}

function setTeamLabel(team) {
  const el = document.getElementById('my-team-name');
  el.innerText = team === 'blue' ? 'Đội Xanh' : 'Đội Đỏ';
  el.style.color = team === 'blue' ? 'var(--blue-color)' : 'var(--red-color)';
}

// 'connect' fires on first load AND after every automatic reconnect (phone
// switches Wi-Fi/4G, screen sleeps...). The server needs the new socket id,
// otherwise it would silently ignore this player's answers.
socket.on('connect', () => {
  const pid = sessionStorage.getItem(KEY_PID);
  const code = sessionStorage.getItem(KEY_CODE);
  if (pid && code) socket.emit('player:reconnect', { code, pid });
});

// Live update for team capacity
document.getElementById('input-code').addEventListener('input', async (e) => {
  const code = e.target.value.trim().toUpperCase();
  if (code.length === 6) {
    try {
      const res = await fetch(`/api/room/${encodeURIComponent(code)}`);
      if (res.ok) {
        const data = await res.json();
        document.getElementById('team-status').innerText = `Xanh: ${data.blue}/${data.max} - Đỏ: ${data.red}/${data.max}`;
      } else {
        document.getElementById('team-status').innerText = '';
      }
    } catch (err) {}
  } else {
    document.getElementById('team-status').innerText = '';
  }
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('input-code').value.trim().toUpperCase();
  const name = document.getElementById('input-name').value;
  const teamSelection = document.getElementById('input-team').value;

  if (code.length !== 6 || name.trim() === '') {
    document.getElementById('join-error').innerText = 'Vui lòng điền đủ mã phòng và tên.';
    return;
  }
  document.getElementById('join-error').innerText = '';
  socket.emit('player:join', { code, name, teamSelection });
});

socket.on('joinError', (msg) => {
  document.getElementById('join-error').innerText = msg;
  sessionStorage.removeItem(KEY_PID);
  sessionStorage.removeItem(KEY_CODE);
  stopTimer();
  showScreen('join');
});

socket.on('joinSuccess', (data) => {
  myData = data;
  sessionStorage.setItem(KEY_PID, data.pid);
  sessionStorage.setItem(KEY_CODE, data.code);
  setTeamLabel(data.team);
  showScreen('wait');
});

socket.on('player:reconnectData', (data) => {
  myData.team = data.team;
  setTeamLabel(data.team);

  if (data.state === 'lobby') {
    showScreen('wait');
  } else if (data.state === 'question') {
    isAnswered = data.answered;
    renderQuestion(data.question);
    if (data.answered) lockButtons(data.myAnswer);
    updateMiniTrack(data.posBlue, data.posRed);
    showScreen('quiz');
  } else if (data.state === 'result') {
    // Show waiting screen temporarily during result phase if reconnected
    stopTimer();
    document.getElementById('res-title').innerText = "Đang tải câu tiếp theo...";
    document.getElementById('res-title').style.color = '';
    document.getElementById('res-points').innerText = "";
    document.getElementById('res-total').innerText = data.score;
    updateMiniTrack(data.posBlue, data.posRed);
    showScreen('result');
  } else {
    // 'final': the server sends 'server:finalResult' right after this event.
    stopTimer();
    showScreen('final');
  }
});

socket.on('server:question', (q) => {
  isAnswered = false;
  renderQuestion(q);
  showScreen('quiz');
});

function renderQuestion(q) {
  stopTimer();
  document.getElementById('q-counter').innerText = `Câu ${q.index + 1}/${q.total}`;
  document.getElementById('status-text').innerText = '';
  const btns = document.querySelectorAll('.play-btn');
  btns.forEach(btn => {
    btn.classList.remove('selected');
    btn.disabled = false;
  });

  // Local timer: one at a time, based on the real remaining time
  stopCountdown = startCountdown(document.getElementById('time-text'), Math.max(0, q.timeLeft));
}

function lockButtons(selectedIdx) {
  const btns = document.querySelectorAll('.play-btn');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === selectedIdx) btn.classList.add('selected');
  });
  document.getElementById('status-text').innerText = 'Đã chọn, chờ kết quả...';
}

window.selectAnswer = function(idx) {
  if (isAnswered) return;
  isAnswered = true;
  lockButtons(idx);
  socket.emit('player:answer', { code: sessionStorage.getItem(KEY_CODE), pid: sessionStorage.getItem(KEY_PID), answerIndex: idx });
};

socket.on('answerAck', () => {
  document.getElementById('status-text').innerText = 'Ghi nhận đáp án!';
});

socket.on('server:playerResult', (res) => {
  stopTimer();
  document.getElementById('res-title').innerText = res.isCorrect ? 'Tuyệt vời!' : (res.points === 0 ? 'Hết giờ!' : 'Sai rồi!');
  document.getElementById('res-title').style.color = res.isCorrect ? 'var(--success)' : (res.points === 0 ? '#aaa' : 'var(--danger)');

  const sign = res.points > 0 ? '+' : '';
  document.getElementById('res-points').innerText = `${sign}${res.points}`;
  document.getElementById('res-points').style.color = document.getElementById('res-title').style.color;

  document.getElementById('res-total').innerText = res.totalScore;
  document.getElementById('res-streak').innerText = res.streak;

  const badge = getBadge(res.totalScore);
  document.getElementById('res-rank-dot').style.background = badge.color;
  document.getElementById('res-rank-name').innerText = badge.name;

  updateMiniTrack(res.posBlue, res.posRed);
  showScreen('result');
});

socket.on('server:finalResult', (res) => {
  stopTimer();
  showScreen('final');

  // 'me' comes from the server: own rank among everyone, and own total score.
  if (res.me) {
    document.getElementById('final-rank').innerText = `${res.me.rank}/${res.me.total}`;
    document.getElementById('final-score').innerText = res.me.score;
  }

  const winEl = document.getElementById('final-win-text');
  if (res.winner === myData.team) {
    winEl.innerText = "ĐỘI BẠN ĐÃ THẮNG!";
    winEl.style.color = "var(--success)";
  } else if (res.winner === 'Hòa') {
    winEl.innerText = "HAI ĐỘI HÒA NHAU!";
    winEl.style.color = "var(--yellow-color)";
  } else {
    winEl.innerText = "ĐỘI BẠN ĐÃ THUA!";
    winEl.style.color = "var(--danger)";
  }
});

socket.on('server:backToLobby', () => {
  isAnswered = false;
  stopTimer();
  showScreen('wait');
});

function updateMiniTrack(posB, posR) {
  document.getElementById('mini-car-blue').style.left = `calc(${posB}% - 10px)`;
  document.getElementById('mini-car-red').style.left = `calc(${posR}% - 10px)`;
}
