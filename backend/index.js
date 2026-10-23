const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const Room = require('./utils/Room');
const Player = require('./utils/Player');
const { formatHint } = require('./utils/words');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allows localhost:3000, preview hosts, Render, Vercel, etc.
    methods: ["GET", "POST"],
  },
});

// In-memory room storage: roomId -> Room instance
const rooms = new Map();
// Socket ID -> roomId lookup
const socketRoomMap = new Map();

function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// REST endpoints for health and public rooms
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: new Date() });
});

app.get('/api/rooms', (req, res) => {
  const publicRooms = [];
  rooms.forEach(room => {
    if (!room.isPrivate) {
      publicRooms.push(room.getPublicDetails());
    }
  });
  res.json(publicRooms);
});

// Serve frontend build if present (for single-service deployment on Render / Railway)
const buildPath = path.join(__dirname, '../frontend/build');
app.use(express.static(buildPath));
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next();
  }
  res.sendFile(path.join(buildPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('Skribbl.io Server Running. Frontend static build not served.');
    }
  });
});

// Socket.IO Real-time Game Engine
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Helper to get player's current room
  const getPlayerRoom = () => {
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return null;
    return rooms.get(roomId) || null;
  };

  // 1. Create Room (PDF: create_room { hostName, settings })
  socket.on('create_room', ({ roomId, hostName, settings = {}, avatar = null, isPrivate = false }) => {
    let targetRoomId = (roomId || '').trim().toUpperCase();
    if (!targetRoomId) {
      targetRoomId = generateRoomId();
      while (rooms.has(targetRoomId)) {
        targetRoomId = generateRoomId();
      }
    }

    let room = rooms.get(targetRoomId);
    if (!room) {
      room = new Room({ id: targetRoomId, isPrivate, settings, io });
      rooms.set(targetRoomId, room);
    } else {
      room.updateSettings(settings);
    }

    let player = room.players.get(socket.id);
    if (!player) {
      player = new Player({
        id: socket.id,
        username: (hostName || 'Host').trim(),
        avatar,
        isHost: true
      });
      room.addPlayer(player);
    } else {
      player.username = (hostName || player.username).trim();
      if (avatar) player.avatar = avatar;
      player.isHost = true;
      room.hostId = socket.id;
    }

    socket.join(targetRoomId);
    socketRoomMap.set(socket.id, targetRoomId);

    const playersList = room.getPlayersList();

    socket.emit('room_created', {
      roomId: targetRoomId,
      player: player.toJSON(),
      players: playersList,
      settings: room.settings,
      isHost: true
    });

    socket.emit('join_success', {
      roomId: targetRoomId,
      player: player.toJSON(),
      players: playersList,
      settings: room.settings,
      isHost: true
    });

    // Broadcast new player to all room members
    room.broadcast('player_joined', {
      player: player.toJSON(),
      players: playersList
    });
    room.broadcast('update_players', playersList);

    console.log(`[Room Created] Room: ${targetRoomId} by ${player.username} (${socket.id})`);
  });

  // 2. Join Room (PDF: join_room { roomId, playerName })
  socket.on('join_room', ({ roomId, username, playerName, avatar = null, isSpectator = false }) => {
    let rawName = (username || playerName || 'Player').trim();
    const targetRoomId = (roomId || '').trim().toUpperCase();

    let room = rooms.get(targetRoomId);
    if (!room) {
      room = new Room({ id: targetRoomId, isPrivate: false, settings: {}, io });
      rooms.set(targetRoomId, room);
      console.log(`[Auto-created Room] ${targetRoomId}`);
    }

    let player = room.players.get(socket.id);

    if (player) {
      // Same socket is re-joining or updating details
      player.username = rawName;
      if (avatar) player.avatar = avatar;
      if (isSpectator !== undefined) player.isSpectator = isSpectator;
    } else {
      // New socket joining the room!
      // If another player in the room already has this username, append a counter (e.g. kannu (2))
      const existingNames = new Set();
      room.players.forEach(p => {
        if (p.id !== socket.id) {
          existingNames.add(p.username.toLowerCase());
        }
      });

      let finalName = rawName;
      if (existingNames.has(finalName.toLowerCase())) {
        let count = 2;
        while (existingNames.has(`${finalName} (${count})`.toLowerCase())) {
          count++;
        }
        finalName = `${finalName} (${count})`;
      }

      const isFirst = room.players.size === 0;
      player = new Player({
        id: socket.id,
        username: finalName,
        avatar,
        isHost: isFirst
      });
      if (isSpectator) player.isSpectator = true;

      const addResult = room.addPlayer(player);
      if (!addResult.success) {
        socket.emit('error_message', { message: addResult.reason || 'Could not join room' });
        return;
      }

      console.log(`[Player Joined] ${finalName} (${socket.id}) -> Room ${targetRoomId} (Total: ${room.players.size})`);
    }

    socket.join(targetRoomId);
    socketRoomMap.set(socket.id, targetRoomId);

    const playersList = room.getPlayersList();

    // Confirm to joining client
    socket.emit('join_success', {
      roomId: targetRoomId,
      player: player.toJSON(),
      players: playersList,
      settings: room.settings,
      isHost: player.isHost
    });

    // Broadcast new player and updated player list to EVERYONE in the room
    room.broadcast('player_joined', {
      player: player.toJSON(),
      players: playersList
    });
    room.broadcast('update_players', playersList);

    // If game in progress, sync current state and canvas
    if (room.game.status !== 'WAITING') {
      const isDrawer = room.game.currentDrawerId === socket.id;
      socket.emit('game_state', {
        phase: room.game.status,
        status: room.game.status,
        round: room.game.currentRound,
        maxRounds: room.game.maxRounds,
        drawerId: room.game.currentDrawerId,
        drawerName: room.players.get(room.game.currentDrawerId)?.username || '',
        wordHint: isDrawer ? room.game.currentWord : formatHint(room.game.currentWord, room.game.revealedIndices, room.game.wordMode),
        word: isDrawer ? room.game.currentWord : formatHint(room.game.currentWord, room.game.revealedIndices, room.game.wordMode),
        hints: room.game.revealedIndices.size,
        timeLeft: room.game.timeLeft
      });

      socket.emit('canvas_sync', {
        strokes: room.game.strokes
      });
    }

    // If game in progress, sync current state and canvas
    if (room.game.status !== 'WAITING') {
      const isDrawer = room.game.currentDrawerId === socket.id;
      socket.emit('game_state', {
        phase: room.game.status,
        status: room.game.status,
        round: room.game.currentRound,
        maxRounds: room.game.maxRounds,
        drawerId: room.game.currentDrawerId,
        drawerName: room.players.get(room.game.currentDrawerId)?.username || '',
        wordHint: isDrawer ? room.game.currentWord : formatHint(room.game.currentWord, room.game.revealedIndices, room.game.wordMode),
        word: isDrawer ? room.game.currentWord : formatHint(room.game.currentWord, room.game.revealedIndices, room.game.wordMode),
        hints: room.game.revealedIndices.size,
        timeLeft: room.game.timeLeft
      });

      // Send complete canvas strokes history
      socket.emit('canvas_sync', {
        strokes: room.game.strokes
      });
    }

    console.log(`[Player Joined] ${finalName} -> Room ${targetRoomId}`);
  });

  // Ready-up toggle in lobby (PDF Page 1: "Lobby: Show players, ready-up, host starts game")
  socket.on('toggle_ready', () => {
    const room = getPlayerRoom();
    if (!room) return;

    room.toggleReady(socket.id);
    const playersList = room.getPlayersList();
    room.broadcast('update_players', playersList);
  });

  // Spectator mode toggle (PDF Page 7: "Spectator mode – Watch without playing")
  socket.on('toggle_spectator', () => {
    const room = getPlayerRoom();
    if (!room) return;

    room.toggleSpectator(socket.id);
    const playersList = room.getPlayersList();
    room.broadcast('update_players', playersList);
  });

  // 3. Get Public Rooms
  socket.on('get_public_rooms', () => {
    const list = [];
    rooms.forEach(room => {
      if (!room.isPrivate) {
        list.push(room.getPublicDetails());
      }
    });
    socket.emit('public_rooms_list', list);
  });

  // 4. Update Settings (Host Only)
  socket.on('update_room_settings', ({ roomId, settings }) => {
    const room = rooms.get(roomId);
    if (!room || room.hostId !== socket.id) return;

    const res = room.updateSettings(settings);
    if (res.success) {
      room.broadcast('settings_updated', room.settings);
    }
  });

  // 5. Start Game (PDF: start_game {} - Host Only)
  socket.on('start_game', ({ roomId } = {}) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) {
      socket.emit('error_message', { message: 'Room not found. Please rejoin.' });
      return;
    }

    // Auto-elect host if hostId is unset, disconnected, or if single player in room
    if (!room.hostId || !room.players.has(room.hostId) || room.players.size === 1) {
      room.hostId = socket.id;
      const p = room.players.get(socket.id);
      if (p) p.isHost = true;
    }

    if (room.hostId !== socket.id) {
      socket.emit('error_message', { message: 'Only the room host can start the game.' });
      return;
    }

    const startResult = room.game.start();
    if (!startResult.success) {
      socket.emit('error_message', { message: startResult.message });
      return;
    }

    room.broadcast('game_started', {
      round: room.game.currentRound,
      maxRounds: room.game.maxRounds
    });
    console.log(`[Game Started] Room ${targetRoomId}`);
  });

  // 6. Word Selection (PDF: word_chosen { word }, alias: select_word)
  const handleWordSelection = ({ roomId, word }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;

    room.game.selectWord(socket.id, word);
  };
  socket.on('word_chosen', handleWordSelection);
  socket.on('select_word', handleWordSelection);

  // 7. Drawing Events (Restricted to Drawer Only)
  socket.on('draw_start', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id || room.game.status !== 'DRAWING') return;

    const stroke = room.game.startStroke(data);
    room.broadcastExcept(socket.id, 'draw_start', data);

    // Broadcast draw_data per PDF page 4
    if (stroke) {
      room.broadcast('draw_data', { type: 'start', strokeId: stroke.id, ...data });
    }
  });

  socket.on('draw_move', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id || room.game.status !== 'DRAWING') return;

    room.game.addPoint(data);
    room.broadcastExcept(socket.id, 'draw_move', data);
    room.broadcast('draw_data', { type: 'move', ...data });
  });

  socket.on('draw_end', () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.endStroke();
    room.broadcastExcept(socket.id, 'draw_end');
    room.broadcast('draw_data', { type: 'end' });
  });

  // Flood fill / Bucket Tool
  socket.on('draw_fill', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id || room.game.status !== 'DRAWING') return;

    const fillAction = room.game.addFill(data);
    room.broadcast('draw_fill', data);
    if (fillAction) {
      room.broadcast('draw_data', { type: 'fill', ...data });
    }
  });

  // draw_data fallback
  socket.on('draw_data', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    if (data.isStarting || data.type === 'start') {
      room.game.startStroke({
        x: data.x || data.offsetX,
        y: data.y || data.offsetY,
        color: data.color || data.strokeColor,
        size: data.size || data.strokeSize
      });
    } else if (data.type === 'move') {
      room.game.addPoint({ x: data.x || data.offsetX, y: data.y || data.offsetY });
    }

    room.broadcastExcept(socket.id, 'draw_data', data);
  });

  // Undo Last Stroke (PDF: draw_undo {})
  socket.on('draw_undo', () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    const undone = room.game.undoStroke();
    if (undone) {
      room.broadcast('canvas_sync', { strokes: room.game.strokes });
      room.broadcast('draw_undo');
    }
  });

  // Clear Canvas (PDF: canvas_clear {}, alias: clear_canvas)
  const handleClearCanvas = () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.clearCanvas();
    room.broadcast('canvas_clear');
    room.broadcast('clear_canvas');
  };
  socket.on('canvas_clear', handleClearCanvas);
  socket.on('clear_canvas', handleClearCanvas);

  // Request Round Replay (PDF Page 7: Replay - Replay last round's drawing)
  socket.on('get_round_replay', () => {
    const room = getPlayerRoom();
    if (!room) return;
    socket.emit('round_replay', { strokes: room.game.lastRoundStrokes });
  });

  // 8. Chat & Guess Handling
  // Common guess processor
  const processGuessOrMessage = (room, player, text, author) => {
    const chatText = (text || '').trim();
    if (!chatText) return;

    const playerName = player.username || author || 'Player';

    // Process guess during DRAWING phase
    if (room.game.status === 'DRAWING') {
      // If player already guessed, their messages only go to players who also already guessed (anti-spoiler)
      if (player.hasGuessed) {
        room.players.forEach(p => {
          if (p.hasGuessed || p.id === room.game.currentDrawerId) {
            io.to(p.id).emit('receive_message', {
              author: playerName,
              message: chatText,
              alreadyGuessed: true
            });
            io.to(p.id).emit('chat_message', {
              playerId: player.id,
              playerName,
              text: chatText,
              alreadyGuessed: true
            });
          }
        });
        return;
      }

      const guessRes = room.game.handleGuess(player, chatText);

      if (guessRes.isCorrect) {
        // PDF spec event: guess_result { correct, playerId, playerName, points }
        room.broadcast('guess_result', {
          correct: true,
          playerId: player.id,
          playerName: player.username,
          points: guessRes.points
        });

        // Broadcast success notification in chat
        room.broadcast('receive_message', {
          author: 'System',
          message: `🎉 ${playerName} guessed the word! (+${guessRes.points} pts)`,
          isSystem: true,
          isCorrectGuess: true
        });

        room.broadcast('chat_message', {
          playerId: 'system',
          playerName: 'System',
          text: `🎉 ${playerName} guessed the word! (+${guessRes.points} pts)`
        });

        // Update player scoreboards
        room.broadcast('update_players', room.getPlayersList());
        return;
      }

      if (guessRes.isClose) {
        // Send private notification only to the guesser!
        socket.emit('receive_message', {
          author: 'System',
          message: `💡 '${chatText}' is very close!`,
          isSystem: true,
          isClose: true
        });
        socket.emit('guess_result', {
          correct: false,
          isClose: true,
          playerId: player.id,
          playerName: player.username,
          points: 0
        });
        return;
      }
    }

    // Normal message broadcast (PDF: chat_message { playerId, playerName, text })
    room.broadcast('chat_message', {
      playerId: player.id,
      playerName,
      text: chatText
    });

    room.broadcast('receive_message', {
      author: playerName,
      message: chatText,
      isSystem: false
    });
  };

  // PDF Page 5 Event: guess { text }
  socket.on('guess', ({ text } = {}) => {
    const room = getPlayerRoom();
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    processGuessOrMessage(room, player, text, player.username);
  });

  // PDF Page 5 Event: chat { text }
  socket.on('chat', ({ text } = {}) => {
    const room = getPlayerRoom();
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    processGuessOrMessage(room, player, text, player.username);
  });

  // Existing alias: send_message
  socket.on('send_message', ({ roomId, author, message, text }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;
    const player = room.players.get(socket.id);
    if (!player) return;
    processGuessOrMessage(room, player, text || message, author);
  });

  // 9. Moderation: Kick, Ban, VoteKick, Report
  // Host Kick (PDF Page 5 & 6)
  socket.on('kick_player', ({ targetId }) => {
    const room = getPlayerRoom();
    if (!room || room.hostId !== socket.id) return;

    const kickedPlayer = room.players.get(targetId);
    if (kickedPlayer) {
      io.to(targetId).emit('kicked_from_room', { reason: 'You were kicked by the host.' });
      room.removePlayer(targetId);
      socketRoomMap.delete(targetId);

      room.broadcast('receive_message', {
        author: 'System',
        message: `👢 ${kickedPlayer.username} was kicked by the host.`,
        isSystem: true
      });
      room.broadcast('update_players', room.getPlayersList());
    }
  });

  // Host Ban (PDF Page 5 & 7: "Kick/ban (host moderation)")
  socket.on('ban_player', ({ targetId }) => {
    const room = getPlayerRoom();
    if (!room || room.hostId !== socket.id) return;

    const bannedPlayer = room.players.get(targetId);
    if (bannedPlayer) {
      io.to(targetId).emit('kicked_from_room', { reason: 'You were banned from this room by the host.' });
      room.banPlayer(targetId);
      socketRoomMap.delete(targetId);

      room.broadcast('receive_message', {
        author: 'System',
        message: `🚫 ${bannedPlayer.username} was banned by the host.`,
        isSystem: true
      });
      room.broadcast('update_players', room.getPlayersList());
    }
  });

  // Votekick (PDF Page 5 & 7)
  socket.on('vote_kick', ({ targetId }) => {
    const room = getPlayerRoom();
    if (!room) return;

    const res = room.voteKick(socket.id, targetId);
    const targetPlayer = room.players.get(targetId);
    if (!targetPlayer) return;

    if (res.kicked) {
      io.to(targetId).emit('kicked_from_room', { reason: 'You were votekicked by the players.' });
      room.removePlayer(targetId);
      socketRoomMap.delete(targetId);

      room.broadcast('receive_message', {
        author: 'System',
        message: `👢 ${targetPlayer.username} was votekicked (${res.votes}/${res.required} votes).`,
        isSystem: true
      });
      room.broadcast('update_players', room.getPlayersList());
    } else {
      room.broadcast('receive_message', {
        author: 'System',
        message: `⚠️ Vote to kick ${targetPlayer.username}: ${res.votes}/${res.required} votes needed.`,
        isSystem: true
      });
    }
  });

  // Report Player (PDF Page 7: "Moderation - Kick, ban, votekick, report")
  socket.on('report_player', ({ targetId, reason }) => {
    const room = getPlayerRoom();
    if (!room) return;

    const success = room.reportPlayer(socket.id, targetId, reason);
    if (success) {
      socket.emit('receive_message', {
        author: 'System',
        message: '🚩 Thank you for your report. Moderation has been notified.',
        isSystem: true
      });
    }
  });

  // 10. Play Again (after Game Over)
  socket.on('play_again', () => {
    const room = getPlayerRoom();
    if (!room || room.hostId !== socket.id) return;

    room.game.status = 'WAITING';
    room.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
      p.isReady = p.isHost;
    });

    room.broadcast('game_reset', {
      players: room.getPlayersList(),
      settings: room.settings
    });
  });

  // 11. Disconnect (PDF: player_left { playerId, players })
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      const removed = room.removePlayer(socket.id);
      socketRoomMap.delete(socket.id);

      if (removed) {
        // PDF spec event: player_left { playerId, players }
        room.broadcast('player_left', {
          playerId: socket.id,
          playerName: removed.username,
          players: room.getPlayersList()
        });
        room.broadcast('update_players', room.getPlayersList());

        room.broadcast('receive_message', {
          author: 'System',
          message: `${removed.username} left the room.`,
          isSystem: true
        });
      }

      // If room is empty, clean it up
      if (room.players.size === 0) {
        room.game.clearTurnTimers();
        rooms.delete(roomId);
        console.log(`[Room Deleted] Room ${roomId} is now empty.`);
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Skribbl server running on http://localhost:${PORT}`);
});