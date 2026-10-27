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
      // Allow requests with no origin (like mobile apps/Postman) or allowed domains
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

// Word lists categorized by type
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

// In-memory room and socket lookup storage
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
      phase: 'WAITING', // WAITING | CHOOSING | DRAWING | ROUND_END | GAME_OVER
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

    console.log(`[Room Created] ID: ${targetRoomId} by ${hostPlayer.username}`);
  });

  // 2. Join Room Handler
  socket.on('join_room', ({ roomId, username, playerName, avatar = null, isSpectator = false }) => {
    const finalName = username || playerName || 'Player';
    const targetRoomId = (roomId || '248').toString().trim().toUpperCase();

    let room = rooms.get(targetRoomId);

    // Auto-create room if it does not exist
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
      console.log(`[Auto-created Room] ${targetRoomId}`);
    }

    // Check ban list
    if (room.bannedList.has(socket.id)) {
      socket.emit('error_message', { message: 'You have been banned from this room.' });
      return;
    }

    // Check capacity
    if (room.players.length >= room.settings.maxPlayers) {
      socket.emit('error_message', { message: 'Room is full.' });
      return;
    }

    socket.join(targetRoomId);
    socketRoomMap.set(socket.id, targetRoomId);

    let player = room.players.find((p) => p.id === socket.id);
    if (!player) {
      player = {
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
      room.players.push(player);
    } else {
      player.username = finalName;
      player.avatar = avatar || player.avatar;
      player.isSpectator = isSpectator;
    }

    if (player.isHost) {
      room.hostId = socket.id;
    }

    console.log(`[Player Joined] ${finalName} -> Room ${targetRoomId} (Total: ${room.players.length})`);

    socket.emit('join_success', {
      players: room.players,
      settings: room.settings,
      isHost: player.isHost
    });

    io.to(targetRoomId).emit('player_joined', {
      player,
      players: room.players
    });

    io.to(targetRoomId).emit('update_players', room.players);

    // Sync state if round is already in progress
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

  // 3. Lobby Controls: Ready Up & Spectator Mode
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

  // 4. Start Game Handler
  socket.on('start_game', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);

    if (!room) {
      socket.emit('error_message', { message: 'Room not found.' });
      return;
    }

    if (room.hostId && room.hostId !== socket.id) {
      socket.emit('error_message', { message: 'Only the room host can start the game!' });
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

  // 5. Word Selection Handler
  socket.on('select_word', ({ roomId, word }) => {
    handleWordSelection(socket, roomId, word);
  });

  socket.on('word_chosen', ({ roomId, word }) => {
    handleWordSelection(socket, roomId, word);
  });

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

    io.to(targetRoomId).emit('round_started', {
      drawerId,
      drawerName,
      wordHint: blankWord
    });

    socketInstance.emit('your_word', word);

    // Timer setup
    clearInterval(room.timer);
    room.timeLeft = room.settings.drawTime;

    room.timer = setInterval(() => {
      room.timeLeft -= 1;
      io.to(targetRoomId).emit('timer_update', room.timeLeft);

      // Periodically reveal hints if enabled
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

  // 6. Messaging & Word Guessing Handlers
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
          isSystem: true,
          isCorrectGuess: true
        });

        io.to(targetRoomId).emit('receive_message', {
          author: 'System',
          message: `🎉 ${author} guessed the word! (+${pointsEarned} pts)`,
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

    // Normal chat message relay
    io.to(targetRoomId).emit('chat_message', {
      playerId: socketInstance.id,
      playerName: author,
      text,
      alreadyGuessed: player?.hasGuessed
    });

    io.to(targetRoomId).emit('receive_message', { author, message: text });
  };

  socket.on('guess', ({ roomId, text }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    handleChatAndGuessing(socket, targetRoomId, text);
  });

  socket.on('chat', ({ roomId, text }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    handleChatAndGuessing(socket, targetRoomId, text);
  });

  socket.on('send_message', ({ roomId, author, message, text }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    handleChatAndGuessing(socket, targetRoomId, message || text, author);
  });

  // 7. Real-time Drawing Events with Stroke History & Undo Support
  socket.on('draw_start', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      const stroke = {
        type: 'stroke',
        color: data.color,
        size: data.size,
        isEraser: data.isEraser,
        points: [{ x: data.x, y: data.y }]
      };
      room.strokesHistory.push(stroke);
      socket.to(targetRoomId).emit('draw_start', data);
      socket.to(targetRoomId).emit('draw_data', { type: 'start', ...data });
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
      socket.to(targetRoomId).emit('draw_data', { type: 'move', ...data });
    }
  });

  socket.on('draw_end', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    socket.to(targetRoomId).emit('draw_end');
  });

  socket.on('draw_fill', (data) => {
    const targetRoomId = data?.roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory.push({
        type: 'fill',
        x: data.x,
        y: data.y,
        color: data.color
      });
      socket.to(targetRoomId).emit('draw_fill', data);
      socket.to(targetRoomId).emit('draw_data', { type: 'fill', ...data });
    }
  });

  socket.on('draw_undo', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room && room.strokesHistory.length > 0) {
      room.strokesHistory.pop();
      io.to(targetRoomId).emit('draw_undo', { strokesHistory: room.strokesHistory });
      io.to(targetRoomId).emit('canvas_sync', { strokes: room.strokesHistory });
    }
  });

  socket.on('clear_canvas', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory = [];
      io.to(targetRoomId).emit('clear_canvas');
      io.to(targetRoomId).emit('canvas_clear');
    }
  });

  socket.on('canvas_clear', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (room) {
      room.strokesHistory = [];
      io.to(targetRoomId).emit('canvas_clear');
      io.to(targetRoomId).emit('clear_canvas');
    }
  });

  socket.on('get_round_replay', () => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (room) {
      socket.emit('round_replay', { strokes: room.lastRoundStrokes });
    }
  });

  // 8. Room Moderation: Kick, Ban, VoteKick, Report
  socket.on('kick_player', ({ targetId }) => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error_message', { message: 'Only host can kick players.' });
      return;
    }

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('kicked_from_room', { reason: 'You were kicked by the room host.' });
      targetSocket.leave(roomId);
    }

    room.players = room.players.filter(p => p.id !== targetId);
    io.to(roomId).emit('update_players', room.players);
    io.to(roomId).emit('chat_message', { author: 'System', text: 'A player was kicked from the room.', isSystem: true });
  });

  socket.on('ban_player', ({ targetId }) => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;

    if (room.hostId !== socket.id) {
      socket.emit('error_message', { message: 'Only host can ban players.' });
      return;
    }

    room.bannedList.add(targetId);

    const targetSocket = io.sockets.sockets.get(targetId);
    if (targetSocket) {
      targetSocket.emit('kicked_from_room', { reason: 'You were banned from this room.' });
      targetSocket.leave(roomId);
    }

    room.players = room.players.filter(p => p.id !== targetId);
    io.to(roomId).emit('update_players', room.players);
    io.to(roomId).emit('chat_message', { author: 'System', text: 'A player was banned from the room.', isSystem: true });
  });

  socket.on('vote_kick', ({ targetId }) => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room) return;

    if (!room.votekicks.has(targetId)) {
      room.votekicks.set(targetId, new Set());
    }

    const votes = room.votekicks.get(targetId);
    votes.add(socket.id);

    const activePlayersCount = room.players.length;
    const requiredVotes = Math.ceil(activePlayersCount / 2);

    io.to(roomId).emit('chat_message', {
      author: 'System',
      text: `Vote kick in progress (${votes.size}/${requiredVotes} votes)`,
      isSystem: true
    });

    if (votes.size >= requiredVotes) {
      const targetSocket = io.sockets.sockets.get(targetId);
      if (targetSocket) {
        targetSocket.emit('kicked_from_room', { reason: 'You were kicked by vote.' });
        targetSocket.leave(roomId);
      }
      room.players = room.players.filter(p => p.id !== targetId);
      room.votekicks.delete(targetId);
      io.to(roomId).emit('update_players', room.players);
    }
  });

  socket.on('report_player', ({ targetId, reason }) => {
    console.log(`[Player Reported] Target: ${targetId} | Reason: ${reason}`);
    socket.emit('chat_message', { author: 'System', text: 'Report submitted successfully.', isSystem: true });
  });

  socket.on('play_again', () => {
    const roomId = socketRoomMap.get(socket.id);
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    room.phase = 'WAITING';
    room.currentRound = 1;
    room.currentDrawerIndex = 0;
    room.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
    });

    io.to(roomId).emit('game_reset', {
      players: room.players,
      settings: room.settings
    });
  });

  // 9. Disconnect Handler
  socket.on('disconnect', () => {
    const targetRoomId = socketRoomMap.get(socket.id);
    socketRoomMap.delete(socket.id);

    if (targetRoomId && rooms.has(targetRoomId)) {
      const room = rooms.get(targetRoomId);
      const leavingPlayer = room.players.find(p => p.id === socket.id);
      const playerName = leavingPlayer ? leavingPlayer.username : 'Player';

      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length === 0) {
        clearInterval(room.timer);
        rooms.delete(targetRoomId);
      } else {
        if (room.hostId === socket.id) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
          io.to(targetRoomId).emit('host_changed', {
            hostId: room.hostId,
            hostName: room.players[0].username
          });
        }

        io.to(targetRoomId).emit('player_left', {
          playerName,
          playerId: socket.id,
          players: room.players
        });

        io.to(targetRoomId).emit('update_players', room.players);
      }
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

  // Game completion check
  if (room.currentRound > room.settings.rounds) {
    endGame(roomId);
    return;
  }

  const drawer = active[room.currentDrawerIndex];
  if (!drawer) return;

  room.phase = 'CHOOSING';
  room.players.forEach((p) => {
    p.hasGuessed = false;
    p.roundScore = 0;
  });

  const wordChoices = getRandomWords(room.settings.wordCount, room.settings.wordCategory);

  io.to(roomId).emit('clear_canvas');
  io.to(roomId).emit('canvas_clear');

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
  io.to(drawer.id).emit('word_options', { words: wordChoices, timeLimit: 15 });
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

  io.to(roomId).emit('round_ended', {
    reason,
    word: room.currentWord,
    nextDrawer: nextDrawer ? nextDrawer.username : ''
  });

  io.to(roomId).emit('round_end', {
    reason,
    word: room.currentWord,
    nextDrawer: nextDrawer ? nextDrawer.username : '',
    players: room.players,
    hasReplay: room.lastRoundStrokes.length > 0
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