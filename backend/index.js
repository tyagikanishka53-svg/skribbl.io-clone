const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket'], 
});

const wordCategories = {
  animals: ['elephant', 'giraffe', 'kangaroo', 'penguin', 'dolphin', 'cheetah', 'octopus', 'lion', 'tiger', 'zebra'],
  objects: ['computer', 'umbrella', 'telescope', 'headphone', 'backpack', 'guitar', 'camera', 'scissors', 'clock'],
  actions: ['swimming', 'dancing', 'cooking', 'sleeping', 'painting', 'running', 'climbing', 'reading', 'singing'],
  all: [
    'apple', 'banana', 'car', 'dog', 'house', 'sun', 'tree', 'computer',
    'guitar', 'cat', 'airplane', 'pizza', 'star', 'boat', 'cloud', 'pencil',
    'phone', 'flower', 'key', 'clock', 'elephant', 'umbrella', 'swimming'
  ]
};

function getRandomWords(count = 3, category = 'all') {
  const pool = wordCategories[category] || wordCategories.all;
  const shuffled = [...pool].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, pool.length));
}

function generateHint(word, revealedIndexes = []) {
  return word
    .split('')
    .map((char, index) => {
      if (char === ' ') return ' ';
      if (revealedIndexes.includes(index)) return char;
      return '_';
    })
    .join(' ');
}

const rooms = new Map();
const socketRoomMap = new Map();

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', activeRooms: rooms.size });
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // 1. Create Room Handler
  socket.on('create_room', ({ roomId, hostName, settings = {}, avatar = null, isPrivate = false }) => {
    const targetRoomId = (roomId || Math.random().toString(36).substring(2, 8)).toUpperCase();

    if (rooms.has(targetRoomId)) {
      socket.emit('error_message', { message: 'Room code already exists.' });
      return;
    }

    const room = {
      id: targetRoomId,
      hostId: socket.id,
      isPrivate,
      players: [],
      currentDrawerIndex: 0,
      currentRound: 1,
      currentWord: '',
      revealedIndexes: [],
      strokesHistory: [],
      lastRoundStrokes: [],
      votekicks: new Map(),
      bannedList: new Set(),
      timer: null,
      timeLeft: 60,
      phase: 'WAITING',
      settings: {
        maxPlayers: settings.maxPlayers || 8,
        rounds: settings.rounds || 3,
        drawTime: settings.drawTime || 60,
        wordCount: settings.wordCount || 3,
        hints: settings.hints || 2,
        wordCategory: settings.wordCategory || 'all',
        wordMode: settings.wordMode || 'normal',
        language: settings.language || 'en'
      }
    };

    const hostPlayer = {
      id: socket.id,
      username: hostName || 'Host',
      avatar,
      score: 0,
      roundScore: 0,
      hasGuessed: false,
      isHost: true,
      isReady: true,
      isSpectator: false
    };

    room.players.push(hostPlayer);
    rooms.set(targetRoomId, room);
    socketRoomMap.set(socket.id, targetRoomId);
    socket.join(targetRoomId);

    socket.emit('room_created', {
      roomId: targetRoomId,
      players: room.players,
      settings: room.settings,
      isHost: true
    });
  });

  // 2. Join Room Handler (Fixed Duplicate Player Issue)
  socket.on('join_room', ({ roomId, username, playerName, avatar = null, isSpectator = false }) => {
    const finalName = username || playerName || 'Player';
    const targetRoomId = (roomId || '248').toString().trim().toUpperCase();

    let room = rooms.get(targetRoomId);

    if (!room) {
      room = {
        id: targetRoomId,
        hostId: socket.id,
        isPrivate: false,
        players: [],
        currentDrawerIndex: 0,
        currentRound: 1,
        currentWord: '',
        revealedIndexes: [],
        strokesHistory: [],
        lastRoundStrokes: [],
        votekicks: new Map(),
        bannedList: new Set(),
        timer: null,
        timeLeft: 60,
        phase: 'WAITING',
        settings: {
          maxPlayers: 8,
          rounds: 3,
          drawTime: 60,
          wordCount: 3,
          hints: 2,
          wordCategory: 'all',
          wordMode: 'normal',
          language: 'en'
        }
      };
      rooms.set(targetRoomId, room);
    }

    if (room.bannedList.has(socket.id)) {
      socket.emit('error_message', { message: 'You have been banned from this room.' });
      return;
    }

    socket.join(targetRoomId);
    socketRoomMap.set(socket.id, targetRoomId);

    // 💡 Fix: Username ya existing socket.id se match karein (duplicate add nahi hoga)
    let existingPlayer = room.players.find(
      (p) => p.username.toLowerCase() === finalName.toLowerCase() || p.id === socket.id
    );

    if (existingPlayer) {
      // Same user reconnects -> sirf socket ID aur avatar update karein
      existingPlayer.id = socket.id;
      existingPlayer.avatar = avatar || existingPlayer.avatar;
      existingPlayer.isSpectator = isSpectator;
    } else {
      // Check capacity only for new players
      if (room.players.length >= room.settings.maxPlayers) {
        socket.emit('error_message', { message: 'Room is full.' });
        return;
      }

      const newPlayer = {
        id: socket.id,
        username: finalName,
        avatar,
        score: 0,
        roundScore: 0,
        hasGuessed: false,
        isHost: room.players.length === 0 || room.hostId === socket.id,
        isReady: false,
        isSpectator
      };
      room.players.push(newPlayer);
    }

    socket.emit('join_success', {
      players: room.players,
      settings: room.settings,
      isHost: room.hostId === socket.id
    });

    io.to(targetRoomId).emit('update_players', room.players);

    if (room.phase !== 'WAITING') {
      const active = room.players.filter(p => !p.isSpectator);
      const currentDrawer = active[room.currentDrawerIndex];

      socket.emit('game_state', {
        phase: room.phase,
        round: room.currentRound,
        maxRounds: room.settings.rounds,
        drawerId: currentDrawer ? currentDrawer.id : '',
        drawerName: currentDrawer ? currentDrawer.username : '',
        wordHint: generateHint(room.currentWord, room.revealedIndexes),
        timeLeft: room.timeLeft
      });

      socket.emit('canvas_sync', { strokes: room.strokesHistory });
    }
  });

  // Re-join Event
  socket.on('rejoin_room', ({ roomId, playerName }) => {
    const targetRoomId = (roomId || socketRoomMap.get(socket.id) || '').toString().trim().toUpperCase();
    const room = rooms.get(targetRoomId);

    if (room) {
      socket.join(targetRoomId);
      socketRoomMap.set(socket.id, targetRoomId);

      let player = room.players.find(p => p.username.toLowerCase() === (playerName || '').toLowerCase() || p.id === socket.id);
      if (player) {
        player.id = socket.id;
      }

      const active = room.players.filter(p => !p.isSpectator);
      const currentDrawer = active[room.currentDrawerIndex];

      socket.emit('room_state', {
        phase: room.phase,
        round: room.currentRound,
        maxRounds: room.settings.rounds,
        drawerId: currentDrawer ? currentDrawer.id : '',
        drawerName: currentDrawer ? currentDrawer.username : '',
        wordHint: generateHint(room.currentWord || '', room.revealedIndexes || []),
        timeLeft: room.timeLeft,
        players: room.players,
        settings: room.settings
      });

      socket.emit('canvas_sync', { strokes: room.strokesHistory });
    }
  });

  socket.on('request_canvas_sync', ({ roomId }) => {
    const targetRoomId = (roomId || socketRoomMap.get(socket.id) || '').toString().trim().toUpperCase();
    const room = rooms.get(targetRoomId);
    if (room && room.strokesHistory) {
      socket.emit('canvas_sync', { strokes: room.strokesHistory });
    }
  });

  // 3. Lobby Controls
  socket.on('toggle_ready', () => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.isReady = !player.isReady;
      io.to(roomId).emit('update_players', room.players);
    }
  });

  socket.on('toggle_spectator', () => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.isSpectator = !player.isSpectator;
      io.to(roomId).emit('update_players', room.players);
    }
  });

  // 4. Start Game
  socket.on('start_game', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', { message: 'Only host can start game.' });
      return;
    }

    room.currentRound = 1;
    room.currentDrawerIndex = 0;
    room.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
    });

    startNewRound(targetRoomId);
    io.to(targetRoomId).emit('game_started');
  });

  // 5. Word Selection
  socket.on('select_word', ({ roomId, word }) => handleWordSelection(socket, roomId, word));
  socket.on('word_chosen', ({ roomId, word }) => handleWordSelection(socket, roomId, word));

  function handleWordSelection(socketInstance, roomId, word) {
    const targetRoomId = roomId || socketRoomMap.get(socketInstance.id);
    const room = rooms.get(targetRoomId);
    if (!room || !word) return;

    room.currentWord = word.toLowerCase();
    room.phase = 'DRAWING';
    room.revealedIndexes = [];
    room.strokesHistory = [];

    const blankWord = generateHint(room.currentWord, room.revealedIndexes);
    const active = room.players.filter(p => !p.isSpectator);
    const currentDrawer = active[room.currentDrawerIndex];
    const drawerId = currentDrawer ? currentDrawer.id : '';
    const drawerName = currentDrawer ? currentDrawer.username : 'Drawer';

    io.to(targetRoomId).emit('round_start', {
      round: room.currentRound,
      maxRounds: room.settings.rounds,
      drawerId,
      drawerName,
      drawTime: room.settings.drawTime,
      wordHint: blankWord,
      status: `${drawerName} is drawing!`
    });

    socketInstance.emit('your_word', word);

    clearInterval(room.timer);
    room.timeLeft = room.settings.drawTime;

    room.timer = setInterval(() => {
      room.timeLeft -= 1;
      io.to(targetRoomId).emit('timer_update', room.timeLeft);

      if (room.settings.hints > 0 && room.timeLeft > 10 && room.timeLeft % 15 === 0) {
        const unrevealed = [];
        for (let i = 0; i < room.currentWord.length; i++) {
          if (room.currentWord[i] !== ' ' && !room.revealedIndexes.includes(i)) {
            unrevealed.push(i);
          }
        }
        if (unrevealed.length > 1) {
          const randIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          room.revealedIndexes.push(randIndex);
          const updatedHint = generateHint(room.currentWord, room.revealedIndexes);
          io.to(targetRoomId).emit('hint_update', { wordHint: updatedHint });
        }
      }

      if (room.timeLeft <= 0) {
        clearInterval(room.timer);
        endRound(targetRoomId, "Time's up!");
      }
    }, 1000);
  }

  // 6. Messaging & Guessing
  const handleChatAndGuessing = (socketInstance, targetRoomId, text, authorName) => {
    const room = rooms.get(targetRoomId);
    if (!room || !text) return;

    const active = room.players.filter(p => !p.isSpectator);
    const currentDrawer = active[room.currentDrawerIndex];
    const player = room.players.find((p) => p.id === socketInstance.id);
    const author = authorName || player?.username || 'Player';

    if (
      room.phase === 'DRAWING' &&
      room.currentWord &&
      text.trim().toLowerCase() === room.currentWord &&
      socketInstance.id !== currentDrawer?.id
    ) {
      if (player && !player.hasGuessed) {
        player.hasGuessed = true;
        const pointsEarned = Math.max(10, room.timeLeft * 10);
        player.score += pointsEarned;
        player.roundScore = pointsEarned;

        io.to(targetRoomId).emit('guess_result', {
          correct: true,
          playerId: socketInstance.id,
          playerName: author,
          points: pointsEarned
        });

        io.to(targetRoomId).emit('chat_message', {
          playerId: 'system',
          playerName: 'System',
          text: `🎉 ${author} guessed the word! (+${pointsEarned} pts)`,
          isSystem: true
        });

        io.to(targetRoomId).emit('update_players', room.players);

        const guessers = active.filter((p) => p.id !== currentDrawer?.id);
        const allGuessed = guessers.length > 0 && guessers.every((p) => p.hasGuessed);

        if (allGuessed) {
          clearInterval(room.timer);
          endRound(targetRoomId, 'Everyone guessed the word!');
        }
        return;
      }
    }

    io.to(targetRoomId).emit('chat_message', {
      playerId: socketInstance.id,
      playerName: author,
      text
    });
  };

  socket.on('guess', ({ roomId, text }) => handleChatAndGuessing(socket, roomId || socketRoomMap.get(socket.id), text));
  socket.on('chat', ({ roomId, text }) => handleChatAndGuessing(socket, roomId || socketRoomMap.get(socket.id), text));
  socket.on('send_message', ({ roomId, author, message, text }) => handleChatAndGuessing(socket, roomId || socketRoomMap.get(socket.id), message || text, author));

  // 7. Drawing Events
  socket.on('draw_start', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory.push({
        type: 'stroke',
        color: data.color,
        size: data.size,
        isEraser: data.isEraser,
        points: [{ x: data.x, y: data.y }]
      });
      socket.to(targetRoomId).emit('draw_start', data);
    }
  });

  socket.on('draw_move', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room && room.strokesHistory.length > 0) {
      const currentStroke = room.strokesHistory[room.strokesHistory.length - 1];
      if (currentStroke && currentStroke.points) {
        currentStroke.points.push({ x: data.x, y: data.y });
      }
      socket.to(targetRoomId).emit('draw_move', data);
    }
  });

  socket.on('draw_end', (data) => {
    socket.to(data?.roomId || socketRoomMap.get(socket.id)).emit('draw_end');
  });

  socket.on('draw_fill', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory.push({ type: 'fill', x: data.x, y: data.y, color: data.color });
      socket.to(targetRoomId).emit('draw_fill', data);
    }
  });

  socket.on('clear_canvas', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory = [];
      io.to(targetRoomId).emit('clear_canvas');
    }
  });

  // 8. Disconnect
  socket.on('disconnect', () => {
    const targetRoomId = socketRoomMap.get(socket.id);
    socketRoomMap.delete(socket.id);

    if (targetRoomId && rooms.has(targetRoomId)) {
      const room = rooms.get(targetRoomId);
      const leavingPlayer = room.players.find(p => p.id === socket.id);
      
      // Delay removal slightly to allow rejoin without flickers
      setTimeout(() => {
        if (room && !room.players.some(p => p.id === socket.id)) {
          if (room.players.length === 0) {
            clearInterval(room.timer);
            rooms.delete(targetRoomId);
          } else {
            io.to(targetRoomId).emit('update_players', room.players);
          }
        }
      }, 3000);
    }
  });
});

function startNewRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.players.length === 0) return;

  const active = room.players.filter(p => !p.isSpectator);
  if (active.length === 0) return;

  if (room.currentDrawerIndex >= active.length) {
    room.currentDrawerIndex = 0;
    room.currentRound += 1;
  }

  if (room.currentRound > room.settings.rounds) {
    endGame(roomId);
    return;
  }

  const drawer = active[room.currentDrawerIndex];
  if (!drawer) return;

  room.phase = 'CHOOSING';
  room.players.forEach(p => { p.hasGuessed = false; p.roundScore = 0; });

  const wordChoices = getRandomWords(room.settings.wordCount, room.settings.wordCategory);

  io.to(roomId).emit('clear_canvas');
  io.to(roomId).emit('round_start', {
    round: room.currentRound,
    maxRounds: room.settings.rounds,
    drawerId: drawer.id,
    drawerName: drawer.username,
    drawTime: room.settings.drawTime,
    status: `${drawer.username} is choosing a word...`,
    wordOptions: wordChoices
  });

  io.to(drawer.id).emit('choose_word', wordChoices);
}

function endRound(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearInterval(room.timer);
  room.phase = 'ROUND_END';
  room.lastRoundStrokes = [...room.strokesHistory];

  const active = room.players.filter(p => !p.isSpectator);
  const nextDrawerIndex = (room.currentDrawerIndex + 1) % (active.length || 1);
  const nextDrawer = active[nextDrawerIndex];

  io.to(roomId).emit('round_end', {
    reason,
    word: room.currentWord,
    nextDrawer: nextDrawer ? nextDrawer.username : '',
    players: room.players
  });

  room.currentDrawerIndex += 1;

  setTimeout(() => {
    if (rooms.has(roomId)) {
      startNewRound(roomId);
    }
  }, 4000);
}

function endGame(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  clearInterval(room.timer);
  room.phase = 'GAME_OVER';

  const sortedLeaderboard = [...room.players].sort((a, b) => b.score - a.score);

  io.to(roomId).emit('game_over', {
    winner: sortedLeaderboard[0] || null,
    leaderboard: sortedLeaderboard
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Skribbl server running on port ${PORT}`);
});