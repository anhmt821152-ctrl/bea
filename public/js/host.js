const socket = io();

// Keys are namespaced so a tab used as host and as player never mixes them up.
const KEY_CODE = 'host.roomCode';
const KEY_HOST = 'host.key';

// State
let roomCode = null;
let players = [];
let stopCountdown = null;
let resultTimeouts = [];

const screens = {
  lobby: document.getElementById('screen-lobby'),
  quiz: document.getElementById('screen-quiz'),
  final: document.getElementById('screen-final')
};

let inLobby = true;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  if (name === 'quiz') fitTracks();
  inLobby = (name === 'lobby');
  // Coming back to the lobby always shows the player tab.
  if (inLobby && typeof showTab === 'function') showTab('players');
}

// The room code is shown like a number plate, one tile per character.
function renderCode(code) {
  document.getElementById('room-code-display').innerHTML =
    Array.from(code).map(c => `<span class="ch">${escapeHTML(c)}</span>`).join('');
}

// ---- Question set (made in the "Câu hỏi" tab, stored in this browser) ----
const setSelect = document.getElementById('set-select');
const setInfo = document.getElementById('set-info');

function setMessage(text, kind) {
  setInfo.textContent = text;
  setInfo.className = 'set-info' + (kind ? ' ' + kind : '');
}

function refreshSetSelect() {
  const store = loadSetStore();
  setSelect.innerHTML = '';
  const add = (value, label, disabled) => {
    const o = document.createElement('option');
    o.value = value; o.textContent = label; o.disabled = !!disabled;
    setSelect.appendChild(o);
  };
  add(DEFAULT_SET_ID, 'Bộ câu hỏi mặc định');
  store.sets.forEach(s => {
    const ready = setIsReady(s);
    add(s.id, `${s.name} (${s.questions.length} câu)${ready ? '' : ' - chưa hoàn chỉnh'}`, !ready);
  });
  const usable = store.selected === DEFAULT_SET_ID || store.sets.some(s => s.id === store.selected && setIsReady(s));
  setSelect.value = usable ? store.selected : DEFAULT_SET_ID;
  if (!usable) { store.selected = DEFAULT_SET_ID; saveSetStore(store); }
}

let setNote = ''; // shown once, in front of the next "Đang dùng" message

function applySelectedSet() {
  if (!roomCode || !inLobby) return;
  const store = loadSetStore();
  const set = store.sets.find(s => s.id === store.selected);
  if (set && !setIsReady(set)) {
    // A set that is still being written can't be played: fall back to the default one.
    setNote = `Bộ "${set.name || 'chưa đặt tên'}" chưa hoàn chỉnh nên tạm dùng bộ mặc định.`;
    store.selected = DEFAULT_SET_ID;
    saveSetStore(store);
    refreshSetSelect();
    return socket.emit('host:setQuestions', { code: roomCode, useDefault: true, time: store.defaultTime });
  }
  if (store.selected === DEFAULT_SET_ID || !set) {
    socket.emit('host:setQuestions', { code: roomCode, useDefault: true, time: store.defaultTime });
  } else {
    socket.emit('host:setQuestions', { code: roomCode, name: set.name, questions: set.questions, time: store.defaultTime });
  }
}

setSelect.addEventListener('change', () => {
  const store = loadSetStore();
  store.selected = setSelect.value;
  saveSetStore(store);
  applySelectedSet();
});
socket.on('host:questionsSet', ({ name, count, time }) => {
  showTimeChoice(time);
  setMessage(`${setNote ? setNote + ' ' : ''}Đang dùng: ${name} (${count} câu), ${time} giây mỗi câu`, setNote ? 'error' : 'ok');
  setNote = '';
});
socket.on('host:questionsError', (msg) => setMessage(msg, 'error'));
refreshSetSelect();

// ---- Default time per question (questions with their own time keep it) ----
const timeSelect = document.getElementById('time-select');

function showTimeChoice(seconds) {
  const values = TIME_CHOICES.slice();
  if (validTime(seconds) && !values.includes(seconds)) { values.push(seconds); values.sort((a, b) => a - b); }
  timeSelect.innerHTML = values.map(t => `<option value="${t}">${t} giây</option>`).join('');
  if (validTime(seconds)) timeSelect.value = String(seconds);
}
showTimeChoice(loadSetStore().defaultTime || 20);

timeSelect.addEventListener('change', () => {
  const store = loadSetStore();
  store.defaultTime = Number(timeSelect.value);
  saveSetStore(store);
  applySelectedSet();
});

// ---- Lobby tabs: "Người chơi" and "Câu hỏi" (the editor) ----
function showTab(name) {
  const questions = name === 'questions';
  document.getElementById('panel-players').classList.toggle('hidden', questions);
  document.getElementById('panel-questions').classList.toggle('hidden', !questions);
  document.querySelectorAll('.tabs .tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  if (questions) {
    if (window.questionEditor) window.questionEditor.reload();
  } else {
    // Back to the lobby: send the chosen set (possibly just edited) to the server.
    applySelectedSet(); // first: it may need to explain a fallback to the default set
    refreshSetSelect();
  }
}
document.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));
document.getElementById('btn-open-editor').addEventListener('click', () => showTab('questions'));
// "Dùng cho phòng của host" in the editor
window.addEventListener('qb:selection', () => { applySelectedSet(); refreshSetSelect(); });

function clearResultTimeouts() {
  resultTimeouts.forEach(clearTimeout);
  resultTimeouts = [];
}

// Inject SVGs
document.getElementById('group-blue').innerHTML += createCarSVG('#22c7e8');
document.getElementById('group-red').innerHTML += createCarSVG('#ff5a76');

// Connection logic. 'connect' also fires after an automatic reconnect (Wi-Fi
// drop, server restart), so the host always re-claims the room.
socket.on('connect', () => {
  const hostKey = sessionStorage.getItem(KEY_HOST);
  const savedCode = sessionStorage.getItem(KEY_CODE);
  if (hostKey && savedCode) {
    socket.emit('host:reconnect', { code: savedCode, hostKey });
  } else {
    socket.emit('host:create');
  }
});

// The server rejects every host command from a browser that isn't logged in
// (never logged in, or the 7-day login expired).
socket.on('host:unauthorized', () => {
  window.location.href = 'login.html';
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (err) {}
  window.location.href = 'login.html';
});

socket.on('roomCreated', ({ code, hostKey }) => {
  roomCode = code;
  players = [];
  sessionStorage.setItem(KEY_CODE, code);
  sessionStorage.setItem(KEY_HOST, hostKey);
  renderCode(code);
  updateLobbyUI();
  showScreen('lobby');
  applySelectedSet();
});

socket.on('host:reconnectFailed', () => {
  sessionStorage.removeItem(KEY_HOST);
  sessionStorage.removeItem(KEY_CODE);
  socket.emit('host:create');
});

socket.on('host:reconnectData', (data) => {
  roomCode = data.code;
  renderCode(roomCode);
  players = data.players;

  if (data.state === 'lobby') {
    updateLobbyUI();
    showScreen('lobby');
    if (data.setName) {
      showTimeChoice(data.defaultTime);
      setMessage(`Đang dùng: ${data.setName} (${data.questionCount} câu), ${data.defaultTime} giây mỗi câu`, 'ok');
    }
  } else if (data.state === 'question' || data.state === 'result') {
    if (data.question) {
      renderQuestion(data.question, data.state === 'result');
    }
    updateTrack(data.posBlue, data.posRed, data.scoreBlue, data.scoreRed);
    updateChips();
    showScreen('quiz');
  } else if (data.state === 'final') {
    // The server sends 'server:finalResult' right after this event.
    showScreen('final');
  }
});

socket.on('host:playerJoined', (p) => {
  if (!players.some(x => x.pid === p.pid)) players.push({ ...p, score: 0 });
  updateLobbyUI();
});

function updateLobbyUI() {
  const blue = players.filter(p => p.team === 'blue');
  const red = players.filter(p => p.team === 'red');

  document.getElementById('blue-count').innerText = blue.length;
  document.getElementById('red-count').innerText = red.length;
  const chips = (list) => list.length
    ? list.map(p => `<span class="player-chip">${escapeHTML(p.name)}</span>`).join('')
    : '<span class="empty-note">Chưa có ai</span>';
  document.getElementById('blue-list').innerHTML = chips(blue);
  document.getElementById('red-list').innerHTML = chips(red);

  document.getElementById('btn-start').disabled = (blue.length === 0 && red.length === 0);
}

document.getElementById('btn-start').addEventListener('click', () => {
  socket.emit('host:start', { code: roomCode });
});

socket.on('server:question', (q) => {
  renderQuestion(q, false);
  updateChips();
  showScreen('quiz');
});

function renderQuestion(q, isResultPhase) {
  clearResultTimeouts();
  if (stopCountdown) { stopCountdown(); stopCountdown = null; }

  document.getElementById('q-counter').innerText = `Câu ${q.index + 1}/${q.total}`;
  document.getElementById('q-text').innerText = q.text;
  for (let i = 0; i < 4; i++) {
    const box = document.getElementById(`opt-${i}`);
    box.classList.remove('correct', 'dimmed'); // keep the colour class (opt-a..d)
    box.querySelector('.opt-text').innerText = q.options[i];
    const badge = box.querySelector('.count-badge');
    badge.innerText = '0';
    badge.style.opacity = '0';
  }

  // Real remaining time (matters when the host reloads mid-question)
  const left = isResultPhase ? 0 : Math.max(0, q.timeLeft);
  const timeText = document.getElementById('time-text');
  const fill = document.getElementById('timer-fill');

  // This runs while the quiz screen may still be hidden (no layout yet), so the
  // bar is shrunk a moment later, once the screen is visible.
  fill.style.transition = 'none';
  fill.style.width = `${(left / q.time) * 100}%`;
  if (isResultPhase) {
    timeText.innerText = '0s';
  } else {
    stopCountdown = startCountdown(timeText, left);
    resultTimeouts.push(setTimeout(() => {
      fill.style.transition = `width ${left}s linear`;
      fill.style.width = '0%';
    }, 60));
  }

  // Stop wheels
  document.getElementById('group-blue').classList.remove('running');
  document.getElementById('group-red').classList.remove('running');
}

socket.on('host:answerCount', ({ answered, total }) => {
  document.getElementById('answer-counter').innerText = `${answered}/${total} đã trả lời`;
});

socket.on('server:questionResult', (res) => {
  if (stopCountdown) { stopCountdown(); stopCountdown = null; }
  clearResultTimeouts();

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
  resultTimeouts.push(setTimeout(() => {
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
  }, 1000));

  // 3. Move cars (after 2.5s)
  resultTimeouts.push(setTimeout(() => {
    document.getElementById('group-blue').classList.add('running');
    document.getElementById('group-red').classList.add('running');
    updateTrack(res.posBlue, res.posRed, res.scoreBlue, res.scoreRed);
  }, 2500));

  // 4. Stop the wheels. The server starts the next question by itself.
  resultTimeouts.push(setTimeout(() => {
    document.getElementById('group-blue').classList.remove('running');
    document.getElementById('group-red').classList.remove('running');
  }, 5000));
});

socket.on('server:finalResult', (res) => {
  clearResultTimeouts();
  if (stopCountdown) { stopCountdown(); stopCountdown = null; }
  showScreen('final');
  const winText = document.getElementById('winner-text');
  if (res.winner === 'blue') {
    winText.innerText = "Đội Xanh thắng!";
    winText.style.color = "var(--blue-color)";
  } else if (res.winner === 'red') {
    winText.innerText = "Đội Đỏ thắng!";
    winText.style.color = "var(--red-color)";
  } else {
    winText.innerText = "Hòa nhau!";
    winText.style.color = "#fff";
  }

  // Podium for the first three: 2nd on the left, 1st in the middle, 3rd on the right.
  const top3 = res.top10.slice(0, 3);
  const slots = [1, 0, 2].filter(i => top3[i]);
  document.getElementById('podium').innerHTML = slots.map(i => {
    const p = top3[i];
    return `<div class="step p${Math.min(p.rank, 3)}"><div class="rk">${p.rank}</div><div class="nm">${escapeHTML(p.name)}</div><div class="sc">${p.score} điểm</div></div>`;
  }).join('');

  const winColor = res.winner === 'blue' ? '#22c7e8' : res.winner === 'red' ? '#ff5a76' : '#ffd23f';
  launchConfetti(document.getElementById('confetti'), [winColor, '#ffd23f', '#f4f6ff']);

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

// Back buttons
document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.action === 'endgame') {
      if (!confirm('Dừng ván đang chơi và quay về sảnh? Điểm của ván này sẽ bị đặt lại.')) return;
      socket.emit('host:endGame', { code: roomCode });
    } else {
      if (!confirm('Đóng phòng và về trang chủ? Tất cả người chơi sẽ bị đưa ra ngoài.')) return;
      socket.emit('host:close', { code: roomCode });
      sessionStorage.removeItem(KEY_HOST);
      sessionStorage.removeItem(KEY_CODE);
      // Give the close message a moment to leave the browser before navigating.
      setTimeout(() => { window.location.href = 'index.html'; }, 250);
    }
  });
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('host:playAgain', { code: roomCode });
});

socket.on('server:backToLobby', () => {
  clearResultTimeouts();
  showScreen('lobby');
  updateLobbyUI();
});

// Utils
function updateChips() {
  const containerBlue = document.getElementById('chips-blue');
  const containerRed = document.getElementById('chips-red');

  containerBlue.innerHTML = '';
  containerRed.innerHTML = '';

  // Both lanes use the same chip size (from the bigger team) so the race looks fair.
  const biggest = Math.max(players.filter(p => p.team === 'blue').length, players.filter(p => p.team === 'red').length);
  const density = biggest > 16 ? ' packed' : biggest > 8 ? ' dense' : '';
  containerBlue.className = `chips-container${density}`;
  containerRed.className = `chips-container${density}`;

  players.forEach(p => {
    const badge = getBadge(p.score || 0);
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.id = `chip-${p.pid}`;
    chip.title = p.name; // full name on hover, since long names are shortened when crowded
    chip.innerHTML = `<div class="badge-dot" style="background: ${badge.color}"></div><span>${escapeHTML(chipLabel(p.name, density))}</span>`;

    if (p.team === 'blue') containerBlue.appendChild(chip);
    else containerRed.appendChild(chip);
  });
  fitTracks();
}

// Crowded rooms show only the given name (the last words of a Vietnamese name),
// which is what people recognise; the full name stays in the tooltip.
function chipLabel(name, density) {
  const words = String(name).trim().split(/\s+/);
  if (density === ' packed') return words.slice(-1).join(' ');
  if (density === ' dense') return words.slice(-2).join(' ');
  return name;
}

// The chips stack upward from the bottom of each lane. Make both lanes as tall as
// the tallest stack needs, so a crowded room grows the lanes downward instead of
// spilling up over the answer boxes.
const TRACK_MIN_HEIGHT = 138;
const TRACK_EXTRA = 12 + 34 + 20; // car gap under the stack + team label + road borders
function fitTracks() {
  const groups = ['group-blue', 'group-red'].map(id => document.getElementById(id));
  const tracks = groups.map(g => g.parentElement);
  const tallest = Math.max(...groups.map(g => g.offsetHeight));
  if (!tallest) return; // quiz screen is hidden: measured again when it is shown
  const height = Math.max(TRACK_MIN_HEIGHT, tallest + TRACK_EXTRA);
  tracks.forEach(t => { t.style.height = `${height}px`; });
}
window.addEventListener('resize', fitTracks);

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
