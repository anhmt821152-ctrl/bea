const socket = io();

// State
let roomCode = sessionStorage.getItem('hostKey') ? null : '';
let players = [];
let currentQuestionIndex = 0;
let totalQuestions = 15;

const screens = {
  lobby: document.getElementById('screen-lobby'),
  quiz: document.getElementById('screen-quiz'),
  final: document.getElementById('screen-final')
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// Inject SVGs
document.getElementById('group-blue').innerHTML += createCarSVG('#19C3E6');
document.getElementById('group-red').innerHTML += createCarSVG('#FF5C77');

// Connection logic
if (sessionStorage.getItem('hostKey')) {
  socket.emit('host:reconnect', {
    code: sessionStorage.getItem('roomCode'),
    hostKey: sessionStorage.getItem('hostKey')
  });
} else {
  socket.emit('host:create');
}

socket.on('roomCreated', ({ code, hostKey }) => {
  roomCode = code;
  sessionStorage.setItem('roomCode', code);
  sessionStorage.setItem('hostKey', hostKey);
  document.getElementById('room-code-display').innerText = code;
  showScreen('lobby');
});

socket.on('host:reconnectFailed', () => {
  sessionStorage.removeItem('hostKey');
  socket.emit('host:create');
});

socket.on('host:reconnectData', (data) => {
  roomCode = data.code;
  document.getElementById('room-code-display').innerText = roomCode;
  players = data.players;
  
  if (data.state === 'lobby') {
    updateLobbyUI();
    showScreen('lobby');
  } else if (data.state === 'question' || data.state === 'result') {
    if (data.question) {
      currentQuestionIndex = data.question.index;
      totalQuestions = data.question.total;
      renderQuestion(data.question);
    }
    updateTrack(data.posBlue, data.posRed, data.scoreBlue, data.scoreRed);
    updateChips();
    showScreen('quiz');
  } else if (data.state === 'final') {
    // Requires server to send final again, simplified here
    socket.emit('host:next', { code: roomCode }); 
  }
});

socket.on('host:playerJoined', (p) => {
  players.push({...p, score: 0});
  updateLobbyUI();
});

function updateLobbyUI() {
  const blue = players.filter(p => p.team === 'blue');
  const red = players.filter(p => p.team === 'red');
  
  document.getElementById('blue-count').innerText = blue.length;
  document.getElementById('red-count').innerText = red.length;
  document.getElementById('blue-list').innerHTML = blue.map(p => `<span style="background: rgba(25,195,230,0.2); padding: 5px 10px; border-radius: 15px;">${escapeHTML(p.name)}</span>`).join('');
  document.getElementById('red-list').innerHTML = red.map(p => `<span style="background: rgba(255,92,119,0.2); padding: 5px 10px; border-radius: 15px;">${escapeHTML(p.name)}</span>`).join('');
  
  document.getElementById('btn-start').disabled = (blue.length === 0 && red.length === 0);
}

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('host:start', { code: roomCode });
});

socket.on('server:question', (q) => {
  currentQuestionIndex = q.index;
  totalQuestions = q.total;
  renderQuestion(q);
  updateChips();
  showScreen('quiz');
});

function renderQuestion(q) {
  document.getElementById('q-counter').innerText = `Câu ${q.index + 1}/${q.total}`;
  document.getElementById('q-text').innerText = q.text;
  for (let i = 0; i < 4; i++) {
    const box = document.getElementById(`opt-${i}`);
    box.className = 'option-box';
    box.querySelector('.opt-text').innerText = q.options[i];
    const badge = box.querySelector('.count-badge');
    badge.innerText = '0';
    badge.style.opacity = '0';
  }
  
  document.getElementById('answer-counter').innerText = `0/${players.length} đã trả lời`;
  document.getElementById('time-text').innerText = `${q.time}s`;
  
  const fill = document.getElementById('timer-fill');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  setTimeout(() => {
    fill.style.transition = `width ${q.time}s linear`;
    fill.style.width = '0%';
  }, 50);

  // Stop wheels
  document.getElementById('group-blue').classList.remove('running');
  document.getElementById('group-red').classList.remove('running');
}

socket.on('host:answerCount', ({ answered, total }) => {
  document.getElementById('answer-counter').innerText = `${answered}/${total} đã trả lời`;
});

socket.on('server:questionResult', (res) => {
  // 1. Reveal answer
  for (let i = 0; i < 4; i++) {
    const box = document.getElementById(`opt-${i}`);
    if (i === res.correctOption) {
      box.classList.add('correct');
    } else {
      box.classList.add('dimmed');
    }
    const badge = box.querySelector('.count-badge');
    badge.innerText = res.optionsCount[i];
    badge.style.opacity = '1';
  }
  
  document.getElementById('timer-fill').style.width = '0%';

  // Update internal player scores
  for (const pid in res.playerResults) {
    const pInfo = players.find(p => p.pid === pid);
    if (pInfo) {
      pInfo.score = res.playerResults[pid].totalScore;
      pInfo.lastResult = res.playerResults[pid];
    }
  }

  // 2. Animate chips (after 1s)
  setTimeout(() => {
    players.forEach(p => {
      const el = document.getElementById(`chip-${p.pid}`);
      if (!el || !p.lastResult) return;
      
      const badgeObj = getBadge(p.score);
      el.querySelector('.badge-dot').style.background = badgeObj.color;
      
      if (p.lastResult.isCorrect) {
        el.classList.add('bounce-forward');
        createFloatingText(el, `+${p.lastResult.points}`, 'text-green');
      } else if (p.lastResult.points < 0) {
        el.classList.add('fall-back');
        createFloatingText(el, `${p.lastResult.points}`, 'text-red');
      }
    });
  }, 1000);

  // 3. Move cars (after 2.5s)
  setTimeout(() => {
    document.getElementById('group-blue').classList.add('running');
    document.getElementById('group-red').classList.add('running');
    updateTrack(res.posBlue, res.posRed, res.scoreBlue, res.scoreRed);
  }, 2500);

  // 4. Auto next (after 6s total)
  setTimeout(() => {
    document.getElementById('group-blue').classList.remove('running');
    document.getElementById('group-red').classList.remove('running');
    socket.emit('host:next', { code: roomCode });
  }, 6000);
});

socket.on('server:finalResult', (res) => {
  showScreen('final');
  const winText = document.getElementById('winner-text');
  if (res.winner === 'blue') {
    winText.innerText = "ĐỘI XANH THẮNG!";
    winText.style.color = "var(--blue-color)";
  } else if (res.winner === 'red') {
    winText.innerText = "ĐỘI ĐỎ THẮNG!";
    winText.style.color = "var(--red-color)";
  } else {
    winText.innerText = "HÒA NHAU!";
    winText.style.color = "#fff";
  }

  const tbody = document.getElementById('leaderboard-body');
  tbody.innerHTML = res.top10.map(p => `
    <tr class="${p.rank === 1 ? 'rank-1' : ''}">
      <td>${p.rank}</td>
      <td>${escapeHTML(p.name)}</td>
      <td style="color: ${p.team==='blue'?'var(--blue-color)':'var(--red-color)'}">${p.team==='blue'?'Xanh':'Đỏ'}</td>
      <td>${p.score}</td>
    </tr>
  `).join('');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('host:playAgain', { code: roomCode });
});

socket.on('server:backToLobby', () => {
  showScreen('lobby');
  updateLobbyUI();
});

// Utils
function updateChips() {
  const containerBlue = document.getElementById('chips-blue');
  const containerRed = document.getElementById('chips-red');
  
  containerBlue.innerHTML = '';
  containerRed.innerHTML = '';

  players.forEach(p => {
    const badge = getBadge(p.score || 0);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.id = `chip-${p.pid}`;
    chip.innerHTML = `<div class="badge-dot" style="background: ${badge.color}"></div><span>${escapeHTML(p.name)}</span>`;
    
    if (p.team === 'blue') containerBlue.appendChild(chip);
    else containerRed.appendChild(chip);
  });
}

function updateTrack(posB, posR, scoreB, scoreR) {
  // Max transform is to leave space for the car so it doesn't overflow right
  document.getElementById('group-blue').style.left = `calc(${posB}% * 0.85)`;
  document.getElementById('group-red').style.left = `calc(${posR}% * 0.85)`;
  
  document.getElementById('score-blue').innerText = scoreB;
  document.getElementById('score-red').innerText = scoreR;
}

function createFloatingText(parent, text, colorClass) {
  const el = document.createElement('div');
  el.className = `floating-text ${colorClass}`;
  el.innerText = text;
  parent.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
