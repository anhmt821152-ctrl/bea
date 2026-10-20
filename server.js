const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Load questions
const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/questions.json'), 'utf-8'));

// Game Config
const CONFIG = {
  maxPlayersPerTeam: 30,
  maxQuestions: 15,
  timePerQuestion: 20, // seconds
  pointsCorrectBase: 100,
  pointsCorrectSpeedMax: 50,
  pointsCorrectStreak: 20,
  pointsIncorrect: -30,
  pushForceCorrectMax: 1.0, // 0.5 + 0.5 * 1
  pushForceCorrectMin: 0.5,
  pushForceIncorrect: -0.3,
  pushForceNoAnswer: 0,
  maxStepPercent: 100 / (15 * 0.8), // ~8.333%
  roomTimeout: 4 * 60 * 60 * 1000 // 4 hours
};

// In-memory data
const rooms = new Map();

// Utils
const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();
const escapeHTML = (str) => str.replace(/[&<>'"]/g, tag => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[tag] || tag));

// Clean inactive rooms periodically (every 1 hour)
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.lastActive > CONFIG.roomTimeout) rooms.delete(code);
  }
}, 60 * 60 * 1000);

// API Endpoint for team count
app.get('/api/room/:code', (req, res) => {
  const room = rooms.get(req.params.code.toUpperCase());
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({
    blue: room.teamBlue.length,
    red: room.teamRed.length,
    max: CONFIG.maxPlayersPerTeam,
    state: room.state
  });
});

io.on('connection', (socket) => {
  
  // HOST EVENTS
  socket.on('host:create', () => {
    let code = generateCode();
    while (rooms.has(code)) code = generateCode();
    
    const hostKey = Math.random().toString(36).substring(2);
    const room = {
      code, hostSocketId: socket.id, hostKey,
      state: 'lobby', // lobby, question, result, final
      players: new Map(), // pid -> playerData
      teamBlue: [], teamRed: [],
      currentQuestionIndex: -1,
      questions: [...questions].slice(0, CONFIG.maxQuestions), // Take config amount
      timer: null, timeLeft: 0,
      posBlue: 0, posRed: 0,
      scoreBlue: 0, scoreRed: 0,
      lastActive: Date.now()
    };
    rooms.set(code, room);
    socket.join(code);
    socket.emit('roomCreated', { code, hostKey });
  });

  socket.on('host:reconnect', ({ code, hostKey }) => {
    const room = rooms.get(code);
    if (room && room.hostKey === hostKey) {
      room.hostSocketId = socket.id;
      room.lastActive = Date.now();
      socket.join(code);
      socket.emit('host:reconnectData', getRoomStateForHost(room));
    } else {
      socket.emit('host:reconnectFailed');
    }
  });

  socket.on('host:start', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.state !== 'lobby') return;
    
    room.state = 'question';
    room.currentQuestionIndex = 0;
    room.lastActive = Date.now();
    startQuestion(room);
  });

  socket.on('host:next', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    
    if (room.posBlue >= 100 || room.posRed >= 100 || room.currentQuestionIndex >= room.questions.length - 1) {
      room.state = 'final';
      io.to(code).emit('server:finalResult', getFinalResult(room));
    } else {
      room.state = 'question';
      room.currentQuestionIndex++;
      startQuestion(room);
    }
  });

  socket.on('host:playAgain', ({ code }) => {
    const room = rooms.get(code);
    if (!room || room.hostSocketId !== socket.id) return;
    room.state = 'lobby';
    room.currentQuestionIndex = -1;
    room.posBlue = 0; room.posRed = 0;
    room.scoreBlue = 0; room.scoreRed = 0;
    for (const p of room.players.values()) {
      p.score = 0; p.streak = 0; p.answers = [];
    }
    io.to(code).emit('server:backToLobby');
    socket.emit('host:reconnectData', getRoomStateForHost(room));
  });

  // PLAYER EVENTS
  socket.on('player:join', ({ code, name, teamSelection }) => {
    code = code.toUpperCase();
    const room = rooms.get(code);
    if (!room || room.state !== 'lobby') return socket.emit('joinError', 'Phòng không tồn tại hoặc đã bắt đầu.');
    
    const cleanName = escapeHTML(name.trim()).substring(0, 16);
    if (!cleanName) return socket.emit('joinError', 'Tên không hợp lệ.');
    
    // Check duplication
    for (const p of room.players.values()) {
      if (p.name === cleanName) return socket.emit('joinError', 'Tên đã tồn tại trong phòng.');
    }

    let team = 'blue';
    if (teamSelection === '1') team = 'blue';
    else if (teamSelection === '2') team = 'red';
    else {
      team = room.teamBlue.length <= room.teamRed.length ? 'blue' : 'red';
    }

    if (team === 'blue' && room.teamBlue.length >= CONFIG.maxPlayersPerTeam) return socket.emit('joinError', 'Đội Xanh đã đầy.');
    if (team === 'red' && room.teamRed.length >= CONFIG.maxPlayersPerTeam) return socket.emit('joinError', 'Đội Đỏ đã đầy.');

    const pid = Math.random().toString(36).substring(2, 10);
    const player = {
      pid, socketId: socket.id, name: cleanName, team,
      score: 0, streak: 0, answers: [], online: true
    };
    
    room.players.set(pid, player);
    if (team === 'blue') room.teamBlue.push(pid);
    else room.teamRed.push(pid);
    
    room.lastActive = Date.now();
    socket.join(code);
    socket.emit('joinSuccess', { pid, code, name: cleanName, team });
    
    // Notify host
    io.to(room.hostSocketId).emit('host:playerJoined', { pid, name: cleanName, team });
  });

  socket.on('player:reconnect', ({ code, pid }) => {
    const room = rooms.get(code);
    if (!room) return socket.emit('joinError', 'Phòng không tồn tại.');
    const player = room.players.get(pid);
    if (!player) return socket.emit('joinError', 'Không tìm thấy người chơi.');

    player.socketId = socket.id;
    player.online = true;
    socket.join(code);
    
    socket.emit('player:reconnectData', {
      team: player.team,
      score: player.score,
      state: room.state,
      qIndex: room.currentQuestionIndex,
      question: room.state === 'question' ? getQuestionDTO(room) : null,
      answered: room.state === 'question' && player.answers.some(a => a.qIndex === room.currentQuestionIndex),
      posBlue: room.posBlue, posRed: room.posRed
    });
  });

  socket.on('player:answer', ({ code, pid, answerIndex }) => {
    const room = rooms.get(code);
    if (!room || room.state !== 'question') return;
    const player = room.players.get(pid);
    if (!player || player.socketId !== socket.id) return;
    
    // Check if already answered
    if (player.answers.some(a => a.qIndex === room.currentQuestionIndex)) return;

    player.answers.push({
      qIndex: room.currentQuestionIndex,
      answer: answerIndex,
      timeRemaining: room.timeLeft
    });

    socket.emit('answerAck');
    
    // Count answers
    let answeredCount = 0;
    let onlineCount = 0;
    for (const p of room.players.values()) {
      if (p.online) onlineCount++;
      if (p.answers.some(a => a.qIndex === room.currentQuestionIndex)) answeredCount++;
    }
    
    io.to(room.hostSocketId).emit('host:answerCount', { answered: answeredCount, total: onlineCount });

    if (answeredCount >= onlineCount && onlineCount > 0) {
      endQuestion(room);
    }
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms.entries()) {
      if (room.hostSocketId === socket.id) {
        // Host disconnected
      } else {
        for (const p of room.players.values()) {
          if (p.socketId === socket.id) {
            p.online = false;
          }
        }
      }
    }
  });
});

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
  return {
    state: room.state,
    code: room.code,
    players: Array.from(room.players.values()).map(p => ({pid: p.pid, name: p.name, team: p.team, score: p.score, online: p.online})),
    qIndex: room.currentQuestionIndex,
    question: room.state === 'question' ? getQuestionDTO(room) : null,
    posBlue: room.posBlue, posRed: room.posRed,
    scoreBlue: room.scoreBlue, scoreRed: room.scoreRed
  };
}

function startQuestion(room) {
  if (room.timer) clearInterval(room.timer);
  room.timeLeft = CONFIG.timePerQuestion;
  room.state = 'question';
  
  const qDTO = getQuestionDTO(room);
  io.to(room.code).emit('server:question', qDTO);

  room.timer = setInterval(() => {
    room.timeLeft--;
    if (room.timeLeft <= 0) {
      endQuestion(room);
    }
  }, 1000);
}

function endQuestion(room) {
  if (room.timer) clearInterval(room.timer);
  room.state = 'result';
  room.lastActive = Date.now();

  const qIndex = room.currentQuestionIndex;
  const q = room.questions[qIndex];
  const correctOption = q.answer;

  let forceBlue = 0, forceRed = 0;
  const playerResults = {};

  // Calculate scores and forces
  for (const [pid, p] of room.players.entries()) {
    const ansRec = p.answers.find(a => a.qIndex === qIndex);
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

  // Update positions
  const bCount = room.teamBlue.length;
  const rCount = room.teamRed.length;
  const bMove = bCount > 0 ? (forceBlue / bCount) * CONFIG.maxStepPercent : 0;
  const rMove = rCount > 0 ? (forceRed / rCount) * CONFIG.maxStepPercent : 0;

  room.posBlue = Math.max(0, Math.min(100, room.posBlue + bMove));
  room.posRed = Math.max(0, Math.min(100, room.posRed + rMove));

  // Option counts
  const optionsCount = [0,0,0,0];
  for (const p of room.players.values()) {
    const ans = p.answers.find(a => a.qIndex === qIndex);
    if (ans && ans.answer >= 0 && ans.answer <= 3) {
      optionsCount[ans.answer]++;
    }
  }

  const resultData = {
    correctOption,
    optionsCount,
    posBlue: room.posBlue,
    posRed: room.posRed,
    scoreBlue: room.scoreBlue,
    scoreRed: room.scoreRed,
    playerResults // sending to host
  };

  // Send to host
  io.to(room.hostSocketId).emit('server:questionResult', resultData);

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
}

function getFinalResult(room) {
  let winner = 'Hòa';
  if (room.posBlue > room.posRed) winner = 'blue';
  else if (room.posRed > room.posBlue) winner = 'red';
  else {
    if (room.scoreBlue > room.scoreRed) winner = 'blue';
    else if (room.scoreRed > room.scoreBlue) winner = 'red';
  }

  const playersArr = Array.from(room.players.values()).sort((a,b) => b.score - a.score);
  const top10 = playersArr.slice(0, 10).map((p, idx) => ({
    rank: idx + 1,
    name: p.name,
    team: p.team,
    score: p.score
  }));

  return { winner, top10, posBlue: room.posBlue, posRed: room.posRed, scoreBlue: room.scoreBlue, scoreRed: room.scoreRed };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
