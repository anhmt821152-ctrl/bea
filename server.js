const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Questions (validated at startup so a bad data file fails loudly and early)
// ---------------------------------------------------------------------------
const isStr = (v) => typeof v === 'string';

// Limits for question sets (also enforced for sets a host builds in the editor)
const LIMITS = { maxText: 200, maxOption: 100, maxCustomQuestions: 50, maxName: 60 };

// Returns { questions } with trimmed copies, or { error } with a message for the host.
function cleanQuestions(list, max) {
  if (!Array.isArray(list) || list.length === 0) return { error: 'Bộ câu hỏi đang trống.' };
  if (list.length > max) return { error: `Tối đa ${max} câu hỏi.` };
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const n = i + 1;
    if (!q || typeof q !== 'object') return { error: `Câu ${n} không hợp lệ.` };
    const text = isStr(q.text) ? q.text.trim() : '';
    if (!text || text.length > LIMITS.maxText) return { error: `Câu ${n}: nội dung trống hoặc dài quá ${LIMITS.maxText} ký tự.` };
    if (!Array.isArray(q.options) || q.options.length !== 4) return { error: `Câu ${n}: cần đúng 4 đáp án.` };
    const options = q.options.map((o) => (isStr(o) ? o.trim() : ''));
    if (options.some((o) => !o || o.length > LIMITS.maxOption)) return { error: `Câu ${n}: đáp án trống hoặc dài quá ${LIMITS.maxOption} ký tự.` };
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) return { error: `Câu ${n}: chưa chọn đáp án đúng.` };
    out.push({ text, options, answer: q.answer });
  }
  return { questions: out };
}

const DEFAULT_SET_NAME = 'Bộ câu hỏi mặc định';
const defaultCheck = cleanQuestions(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/questions.json'), 'utf-8')), 1000);
if (defaultCheck.error) throw new Error('data/questions.json: ' + defaultCheck.error);
const questions = defaultCheck.questions;

// ---------------------------------------------------------------------------
// Game config
// ---------------------------------------------------------------------------
const CONFIG = {
  maxPlayersPerTeam: 30,
  maxQuestions: 15,
  timePerQuestion: Number(process.env.TIME_PER_QUESTION) || 20, // seconds
  resultDelay: Number(process.env.RESULT_DELAY_MS) || 6000, // ms between result and next question
  pointsCorrectBase: 100,
  pointsCorrectSpeedMax: 50,
  pointsCorrectStreak: 20,
  pointsIncorrect: -30,
  pushForceCorrectMax: 1.0, // 0.5 + 0.5 * 1
  pushForceCorrectMin: 0.5,
  pushForceIncorrect: -0.3,
  pushForceNoAnswer: 0,
  roomTimeout: 4 * 60 * 60 * 1000 // 4 hours
};

// In-memory data
const rooms = new Map();

// ---------------------------------------------------------------------------
// Utils
// ---------------------------------------------------------------------------
// No 0/O/1/I so codes are easy to read out loud. Always exactly 6 characters.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const generateCode = () => {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return code;
};
const generateToken = () => crypto.randomBytes(12).toString('hex');
const defaultQuestions = () => questions.slice(0, CONFIG.maxQuestions).map((q) => ({ ...q, options: [...q.options] }));

const getRoom = (code) => (isStr(code) ? rooms.get(code.toUpperCase()) : undefined);
const getHostRoom = (socket, code) => {
  const room = getRoom(code);
  return room && room.hostSocketId === socket.id ? room : null;
};

// Wrap every socket handler: payload is always an object and an exception can
// never crash the whole process.
function safe(handler) {
  return (payload) => {
    try {
      handler(payload && typeof payload === 'object' ? payload : {});
    } catch (err) {
      console.error('Socket handler error:', err);
    }
  };
}

function emitToHost(room, event, data) {
  if (room.hostSocketId) io.to(room.hostSocketId).emit(event, data);
}

function clearRoomTimers(room) {
  if (room.timer) { clearInterval(room.timer); room.timer = null; }
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }
}

// Clean inactive rooms periodically (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActive > CONFIG.roomTimeout) {
      clearRoomTimers(room);
      rooms.delete(code);
    }
  }
}, 60 * 60 * 1000).unref();

// ---------------------------------------------------------------------------
// HTTP endpoints
// ---------------------------------------------------------------------------
// Health check (used by Render)
app.get('/healthz', (req, res) => res.type('text').send('ok'));

// The built-in questions (used by the editor to copy them into a custom set)
app.get('/api/default-questions', (req, res) => res.json({ name: DEFAULT_SET_NAME, questions }));

// Team count for the join screen
app.get('/api/room/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    blue: room.teamBlue.length,
    red: room.teamRed.length,
    max: CONFIG.maxPlayersPerTeam,
    state: room.state
  });
});

// ---------------------------------------------------------------------------
// Socket events
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {

  // HOST EVENTS
  socket.on('host:create', safe(() => {
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();

    const hostKey = generateToken();
    const room = {
      code, hostSocketId: socket.id, hostKey,
      state: 'lobby', // lobby, question, result, final
      players: new Map(), // pid -> playerData
      teamBlue: [], teamRed: [],
      currentQuestionIndex: -1,
      questions: defaultQuestions(), setName: DEFAULT_SET_NAME,
      timer: null, nextTimer: null, timeLeft: 0,
      posBlue: 0, posRed: 0,
      scoreBlue: 0, scoreRed: 0,
      lastActive: Date.now()
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, hostKey });
  }));

  socket.on('host:reconnect', safe(({ code, hostKey }) => {
    const room = getRoom(code);
    if (room && isStr(hostKey) && room.hostKey === hostKey) {
      room.hostSocketId = socket.id;
      room.lastActive = Date.now();
      socket.join(room.code);
      socket.emit('host:reconnectData', getRoomStateForHost(room));
      if (room.state === 'final') socket.emit('server:finalResult', getFinalResult(room));
      if (room.state === 'question') emitAnswerCount(room);
    } else {
      socket.emit('host:reconnectFailed');
    }
  }));

  socket.on('host:start', safe(({ code }) => {
    const room = getHostRoom(socket, code);
    if (!room || room.state !== 'lobby' || room.players.size === 0) return;

    room.currentQuestionIndex = 0;
    startQuestion(room);
  }));

  // Host may skip the result pause; otherwise the server advances by itself.
  socket.on('host:next', safe(({ code }) => {
    const room = getHostRoom(socket, code);
    if (!room) return;
    advance(room);
  }));

  socket.on('host:playAgain', safe(({ code }) => {
    const room = getHostRoom(socket, code);
    if (!room || room.state !== 'final') return;
    resetToLobby(room, socket);
  }));

  // Choose the question set for the next game (lobby only). The set comes from
  // the editor in the host's browser, so it is validated again here.
  socket.on('host:setQuestions', safe(({ code, useDefault, name, questions: list }) => {
    const room = getHostRoom(socket, code);
    if (!room) return;
    if (room.state !== 'lobby') return socket.emit('host:questionsError', 'Chỉ đổi được bộ câu hỏi khi đang ở sảnh chờ.');

    if (useDefault === true) {
      room.questions = defaultQuestions();
      room.setName = DEFAULT_SET_NAME;
    } else {
      const result = cleanQuestions(list, LIMITS.maxCustomQuestions);
      if (result.error) return socket.emit('host:questionsError', result.error);
      room.questions = result.questions;
      room.setName = (isStr(name) && name.trim().slice(0, LIMITS.maxName)) || 'Bộ câu hỏi tùy chỉnh';
    }
    room.lastActive = Date.now();
    socket.emit('host:questionsSet', { name: room.setName, count: room.questions.length });
  }));

  // Stop the current game and go back to the lobby, keeping the players.
  socket.on('host:endGame', safe(({ code }) => {
    const room = getHostRoom(socket, code);
    if (!room || (room.state !== 'question' && room.state !== 'result')) return;
    resetToLobby(room, socket);
  }));

  // Close the room for good: players are sent back to the join screen.
  socket.on('host:close', safe(({ code }) => {
    const room = getHostRoom(socket, code);
    if (!room) return;
    clearRoomTimers(room);
    io.to(room.code).emit('server:roomClosed');
    rooms.delete(room.code);
  }));

  // PLAYER EVENTS
  socket.on('player:join', safe(({ code, name, teamSelection }) => {
    const room = getRoom(code);
    if (!room || room.state !== 'lobby') return socket.emit('joinError', 'Phòng không tồn tại hoặc đã bắt đầu.');
    if (!isStr(name)) return socket.emit('joinError', 'Tên không hợp lệ.');

    // Names are stored raw; every client escapes them when rendering as HTML.
    const cleanName = name.trim().replace(/\s+/g, ' ').substring(0, 16).trim();
    if (!cleanName) return socket.emit('joinError', 'Tên không hợp lệ.');

    for (const p of room.players.values()) {
      if (p.name.toLowerCase() === cleanName.toLowerCase()) return socket.emit('joinError', 'Tên đã tồn tại trong phòng.');
      if (p.socketId === socket.id && p.online) return socket.emit('joinError', 'Bạn đã ở trong phòng này rồi.');
    }

    let team;
    if (teamSelection === '1') team = 'blue';
    else if (teamSelection === '2') team = 'red';
    else team = room.teamBlue.length <= room.teamRed.length ? 'blue' : 'red';

    if (team === 'blue' && room.teamBlue.length >= CONFIG.maxPlayersPerTeam) return socket.emit('joinError', 'Đội Xanh đã đầy.');
    if (team === 'red' && room.teamRed.length >= CONFIG.maxPlayersPerTeam) return socket.emit('joinError', 'Đội Đỏ đã đầy.');

    const pid = generateToken();
    const player = {
      pid, socketId: socket.id, name: cleanName, team,
      score: 0, streak: 0, answers: [], online: true
    };

    room.players.set(pid, player);
    if (team === 'blue') room.teamBlue.push(pid);
    else room.teamRed.push(pid);

    room.lastActive = Date.now();
    socket.join(room.code);
    socket.emit('joinSuccess', { pid, code: room.code, name: cleanName, team });

    emitToHost(room, 'host:playerJoined', { pid, name: cleanName, team });
  }));

  socket.on('player:reconnect', safe(({ code, pid }) => {
    const room = getRoom(code);
    if (!room) return socket.emit('joinError', 'Phòng không tồn tại.');
    const player = isStr(pid) ? room.players.get(pid) : null;
    if (!player) return socket.emit('joinError', 'Không tìm thấy người chơi.');

    player.socketId = socket.id;
    player.online = true;
    room.lastActive = Date.now();
    socket.join(room.code);

    const rec = player.answers.find((a) => a.qIndex === room.currentQuestionIndex);
    const inQuestion = room.state === 'question';
    socket.emit('player:reconnectData', {
      team: player.team,
      score: player.score,
      state: room.state,
      qIndex: room.currentQuestionIndex,
      question: inQuestion ? getQuestionDTO(room) : null,
      answered: inQuestion && !!rec,
      myAnswer: inQuestion && rec ? rec.answer : null,
      posBlue: room.posBlue, posRed: room.posRed
    });
    if (room.state === 'final') socket.emit('server:finalResult', getFinalResultFor(room, player));
    if (inQuestion) emitAnswerCount(room);
  }));

  socket.on('player:answer', safe(({ code, pid, answerIndex }) => {
    const room = getRoom(code);
    if (!room || room.state !== 'question') return;
    const player = isStr(pid) ? room.players.get(pid) : null;
    if (!player || player.socketId !== socket.id) return;

    const q = room.questions[room.currentQuestionIndex];
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= q.options.length) return;

    // Already answered?
    if (player.answers.some((a) => a.qIndex === room.currentQuestionIndex)) return;

    player.answers.push({
      qIndex: room.currentQuestionIndex,
      answer: answerIndex,
      timeRemaining: room.timeLeft
    });
    room.lastActive = Date.now();

    socket.emit('answerAck');
    checkAllAnswered(room);
  }));

  socket.on('disconnect', safe(() => {
    for (const room of rooms.values()) {
      for (const p of room.players.values()) {
        if (p.socketId === socket.id && p.online) {
          p.online = false;
          // The last unanswered player may have just left.
          if (room.state === 'question') checkAllAnswered(room);
        }
      }
    }
  }));
});

// ---------------------------------------------------------------------------
// Game logic
// ---------------------------------------------------------------------------
function getQuestionDTO(room) {
  const q = room.questions[room.currentQuestionIndex];
  return {
    index: room.currentQuestionIndex,
    total: room.questions.length,
    text: q.text,
    options: q.options,
    time: CONFIG.timePerQuestion,
    timeLeft: room.timeLeft
  };
}

function getRoomStateForHost(room) {
  const showQuestion = room.state === 'question' || room.state === 'result';
  return {
    state: room.state,
    code: room.code,
    players: Array.from(room.players.values()).map((p) => ({ pid: p.pid, name: p.name, team: p.team, score: p.score, online: p.online })),
    qIndex: room.currentQuestionIndex,
    question: showQuestion && room.currentQuestionIndex >= 0 ? getQuestionDTO(room) : null,
    setName: room.setName, questionCount: room.questions.length,
    posBlue: room.posBlue, posRed: room.posRed,
    scoreBlue: room.scoreBlue, scoreRed: room.scoreRed
  };
}

function resetToLobby(room, hostSocket) {
  clearRoomTimers(room);
  room.state = 'lobby';
  room.currentQuestionIndex = -1;
  room.posBlue = 0; room.posRed = 0;
  room.scoreBlue = 0; room.scoreRed = 0;
  room.lastActive = Date.now();
  for (const p of room.players.values()) {
    p.score = 0; p.streak = 0; p.answers = [];
  }
  io.to(room.code).emit('server:backToLobby');
  hostSocket.emit('host:reconnectData', getRoomStateForHost(room));
}

function countAnswers(room) {
  let answered = 0;
  let online = 0;
  for (const p of room.players.values()) {
    if (p.online) online++;
    if (p.answers.some((a) => a.qIndex === room.currentQuestionIndex)) answered++;
  }
  return { answered, online };
}

function emitAnswerCount(room) {
  const { answered, online } = countAnswers(room);
  emitToHost(room, 'host:answerCount', { answered, total: online });
}

function checkAllAnswered(room) {
  const { answered, online } = countAnswers(room);
  emitToHost(room, 'host:answerCount', { answered, total: online });
  if (online > 0 && answered >= online) endQuestion(room);
}

function startQuestion(room) {
  clearRoomTimers(room);
  room.timeLeft = CONFIG.timePerQuestion;
  room.state = 'question';
  room.lastActive = Date.now();

  io.to(room.code).emit('server:question', getQuestionDTO(room));
  emitAnswerCount(room);

  room.timer = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) endQuestion(room);
  }, 1000);
}

function endQuestion(room) {
  if (room.state !== 'question') return; // already ended (timer and last answer in the same tick)
  clearRoomTimers(room);
  room.state = 'result';
  room.lastActive = Date.now();

  const qIndex = room.currentQuestionIndex;
  const q = room.questions[qIndex];
  const correctOption = q.answer;

  let forceBlue = 0, forceRed = 0;
  const playerResults = {};

  // Team score is recomputed from the players' current totals every question.
  room.scoreBlue = 0;
  room.scoreRed = 0;

  for (const [pid, p] of room.players.entries()) {
    const ansRec = p.answers.find((a) => a.qIndex === qIndex);
    let points = 0;
    let force = 0;
    let isCorrect = false;

    if (ansRec) {
      isCorrect = (ansRec.answer === correctOption);
      if (isCorrect) {
        p.streak++;
        points = CONFIG.pointsCorrectBase + Math.floor(CONFIG.pointsCorrectSpeedMax * (ansRec.timeRemaining / CONFIG.timePerQuestion));
        if (p.streak >= 3) points += CONFIG.pointsCorrectStreak;
        force = CONFIG.pushForceCorrectMin + (CONFIG.pushForceCorrectMax - CONFIG.pushForceCorrectMin) * (ansRec.timeRemaining / CONFIG.timePerQuestion);
      } else {
        p.streak = 0;
        points = CONFIG.pointsIncorrect;
        force = CONFIG.pushForceIncorrect;
      }
      ansRec.isCorrect = isCorrect;
      ansRec.pointsEarned = points;
    } else {
      p.streak = 0;
      force = CONFIG.pushForceNoAnswer;
      // create dummy record
      p.answers.push({ qIndex, answer: -1, timeRemaining: 0, isCorrect: false, pointsEarned: 0 });
    }

    p.score = Math.max(0, p.score + points);
    if (p.team === 'blue') { room.scoreBlue += p.score; forceBlue += force; }
    else { room.scoreRed += p.score; forceRed += force; }

    playerResults[pid] = {
      isCorrect,
      points,
      totalScore: p.score,
      streak: p.streak
    };
  }

  // Update positions. A full-force team finishes after ~80% of the questions.
  const maxStepPercent = 100 / (room.questions.length * 0.8);
  const bCount = room.teamBlue.length;
  const rCount = room.teamRed.length;
  const bMove = bCount > 0 ? (forceBlue / bCount) * maxStepPercent : 0;
  const rMove = rCount > 0 ? (forceRed / rCount) * maxStepPercent : 0;

  room.posBlue = Math.max(0, Math.min(100, room.posBlue + bMove));
  room.posRed = Math.max(0, Math.min(100, room.posRed + rMove));

  // Option counts
  const optionsCount = [0, 0, 0, 0];
  for (const p of room.players.values()) {
    const ans = p.answers.find((a) => a.qIndex === qIndex);
    if (ans && ans.answer >= 0 && ans.answer <= 3) {
      optionsCount[ans.answer]++;
    }
  }

  // Send to host
  emitToHost(room, 'server:questionResult', {
    correctOption,
    optionsCount,
    posBlue: room.posBlue,
    posRed: room.posRed,
    scoreBlue: room.scoreBlue,
    scoreRed: room.scoreRed,
    playerResults // sending to host
  });

  // Send individually to players
  for (const [pid, p] of room.players.entries()) {
    if (p.online) {
      io.to(p.socketId).emit('server:playerResult', {
        ...playerResults[pid],
        posBlue: room.posBlue,
        posRed: room.posRed
      });
    }
  }

  // The server moves on by itself, so a host reload can't stall the game.
  room.nextTimer = setTimeout(() => advance(room), CONFIG.resultDelay);
}

function advance(room) {
  if (room.state !== 'result') return;
  if (room.nextTimer) { clearTimeout(room.nextTimer); room.nextTimer = null; }

  if (room.posBlue >= 100 || room.posRed >= 100 || room.currentQuestionIndex >= room.questions.length - 1) {
    room.state = 'final';
    room.lastActive = Date.now();
    emitFinal(room);
  } else {
    room.currentQuestionIndex++;
    startQuestion(room);
  }
}

// Standard competition ranking: players with equal score share a rank.
function getRanking(room) {
  const sorted = Array.from(room.players.values()).sort((a, b) => b.score - a.score);
  return sorted.map((p) => ({ p, rank: 1 + sorted.filter((o) => o.score > p.score).length }));
}

function getFinalResult(room) {
  let winner = 'Hòa';
  if (room.posBlue > room.posRed) winner = 'blue';
  else if (room.posRed > room.posBlue) winner = 'red';
  else {
    if (room.scoreBlue > room.scoreRed) winner = 'blue';
    else if (room.scoreRed > room.scoreBlue) winner = 'red';
  }

  const top10 = getRanking(room).slice(0, 10).map(({ p, rank }) => ({
    rank,
    name: p.name,
    team: p.team,
    score: p.score
  }));

  return { winner, top10, posBlue: room.posBlue, posRed: room.posRed, scoreBlue: room.scoreBlue, scoreRed: room.scoreRed };
}

// Final result plus this player's own rank and score.
function getFinalResultFor(room, player) {
  const ranking = getRanking(room);
  const mine = ranking.find((r) => r.p === player);
  return {
    ...getFinalResult(room),
    me: { rank: mine ? mine.rank : ranking.length, score: player.score, total: ranking.length }
  };
}

function emitFinal(room) {
  emitToHost(room, 'server:finalResult', getFinalResult(room));
  for (const p of room.players.values()) {
    if (p.online) io.to(p.socketId).emit('server:finalResult', getFinalResultFor(room, p));
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Render sends SIGTERM on every deploy/restart: close cleanly.
process.on('SIGTERM', () => {
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
