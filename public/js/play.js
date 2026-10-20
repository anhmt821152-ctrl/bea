const socket = io();

const screens = {
  join: document.getElementById('screen-join'),
  wait: document.getElementById('screen-wait'),
  quiz: document.getElementById('screen-quiz'),
  result: document.getElementById('screen-result'),
  final: document.getElementById('screen-final')
};

let myData = { pid: null, code: null, name: '', team: '' };
let isAnswered = false;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  
  if (name === 'quiz' || name === 'result') {
    document.getElementById('mini-tracker').classList.remove('hidden');
  } else {
    document.getElementById('mini-tracker').classList.add('hidden');
  }
}

// Check reconnect
if (sessionStorage.getItem('pid') && sessionStorage.getItem('roomCode')) {
  socket.emit('player:reconnect', {
    code: sessionStorage.getItem('roomCode'),
    pid: sessionStorage.getItem('pid')
  });
}

// Live update for team capacity
document.getElementById('input-code').addEventListener('input', async (e) => {
  const code = e.target.value.toUpperCase();
  if (code.length === 6) {
    try {
      const res = await fetch(`/api/room/${code}`);
      if (res.ok) {
        const data = await res.json();
        document.getElementById('team-status').innerText = `Xanh: ${data.blue}/${data.max} - Đỏ: ${data.red}/${data.max}`;
      }
    } catch(e) {}
  } else {
    document.getElementById('team-status').innerText = '';
  }
});

document.getElementById('btn-join').addEventListener('click', () => {
  const code = document.getElementById('input-code').value;
  const name = document.getElementById('input-name').value;
  const teamSelection = document.getElementById('input-team').value;
  
  if(code.length !== 6 || name.trim() === '') {
    document.getElementById('join-error').innerText = 'Vui lòng điền đủ mã phòng và tên.';
    return;
  }
  socket.emit('player:join', { code, name, teamSelection });
});

socket.on('joinError', (msg) => {
  document.getElementById('join-error').innerText = msg;
  sessionStorage.removeItem('pid');
  showScreen('join');
});

socket.on('joinSuccess', (data) => {
  myData = data;
  sessionStorage.setItem('pid', data.pid);
  sessionStorage.setItem('roomCode', data.code);
  document.getElementById('my-team-name').innerText = data.team === 'blue' ? 'Đội Xanh' : 'Đội Đỏ';
  document.getElementById('my-team-name').style.color = data.team === 'blue' ? 'var(--blue-color)' : 'var(--red-color)';
  showScreen('wait');
});

socket.on('player:reconnectData', (data) => {
  myData.team = data.team;
  if (data.state === 'lobby') showScreen('wait');
  else if (data.state === 'question') {
    isAnswered = data.answered;
    renderQuestion(data.question);
    updateMiniTrack(data.posBlue, data.posRed);
    showScreen('quiz');
  } else if (data.state === 'result') {
    // Show waiting screen temporarily during result phase if reconnected
    document.getElementById('res-title').innerText = "Đang tải câu tiếp theo...";
    document.getElementById('res-points').innerText = "";
    updateMiniTrack(data.posBlue, data.posRed);
    showScreen('result');
  } else {
    showScreen('final');
  }
});

socket.on('server:question', (q) => {
  isAnswered = false;
  renderQuestion(q);
  showScreen('quiz');
});

function renderQuestion(q) {
  document.getElementById('q-counter').innerText = `Câu ${q.index + 1}/${q.total}`;
  document.getElementById('time-text').innerText = `${q.time}s`;
  document.getElementById('status-text').innerText = '';
  const btns = document.querySelectorAll('.play-btn');
  btns.forEach(btn => {
    btn.classList.remove('selected');
    btn.disabled = false;
  });

  // Local timer
  let t = q.time;
  const intv = setInterval(() => {
    t--;
    document.getElementById('time-text').innerText = `${Math.max(0, t)}s`;
    if(t <= 0) clearInterval(intv);
  }, 1000);
}

window.selectAnswer = function(idx) {
  if (isAnswered) return;
  isAnswered = true;
  const btns = document.querySelectorAll('.play-btn');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === idx) btn.classList.add('selected');
  });
  document.getElementById('status-text').innerText = 'Đã chọn, chờ kết quả...';
  socket.emit('player:answer', { code: sessionStorage.getItem('roomCode'), pid: sessionStorage.getItem('pid'), answerIndex: idx });
};

socket.on('answerAck', () => {
  document.getElementById('status-text').innerText = 'Ghi nhận đáp án!';
});

socket.on('server:playerResult', (res) => {
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
  showScreen('final');
  let myRankInfo = res.top10.find(p => p.name === myData.name);
  document.getElementById('final-rank').innerText = myRankInfo ? `Top ${myRankInfo.rank}` : 'Ngoài Top 10';
  
  // Find self score inside players map if passed, here we use local knowledge for simplicity.
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
  showScreen('wait');
});

function updateMiniTrack(posB, posR) {
  document.getElementById('mini-car-blue').style.left = `calc(${posB}% - 10px)`;
  document.getElementById('mini-car-red').style.left = `calc(${posR}% - 10px)`;
}
