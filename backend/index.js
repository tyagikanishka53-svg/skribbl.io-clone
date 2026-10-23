const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');

const Room = require('./utils/Room');
const Player = require('./utils/Player');

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

  // 1. Create Room
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

    const player = new Player({
      id: socket.id,
      username: hostName || 'Host',
      avatar,
      isHost: true
    });

    room.addPlayer(player);
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

    room.broadcast('player_joined', {
      player: player.toJSON(),
      players: playersList
    });
    room.broadcast('update_players', playersList);

    console.log(`[Room Created] Room: ${targetRoomId} by ${player.username}`);
  });

  // 2. Join Room
  socket.on('join_room', ({ roomId, username, playerName, avatar = null }) => {
    const finalName = username || playerName || 'Player';
    const targetRoomId = (roomId || '').trim().toUpperCase();

    let room = rooms.get(targetRoomId);

    // If room does not exist, auto-create room with this code for convenience
    if (!room) {
      room = new Room({ id: targetRoomId, isPrivate: false, settings: {}, io });
      rooms.set(targetRoomId, room);
      console.log(`[Auto-created Room] ${targetRoomId}`);
    }

    const existingPlayer = room.players.get(socket.id);
    if (existingPlayer) {
      existingPlayer.username = finalName;
      if (avatar) existingPlayer.avatar = avatar;
    } else {
      const isFirst = room.players.size === 0;
      const newPlayer = new Player({
        id: socket.id,
        username: finalName,
        avatar,
        isHost: isFirst
      });

      const addResult = room.addPlayer(newPlayer);
      if (!addResult.success) {
        socket.emit('error_message', { message: addResult.reason || 'Could not join room' });
        return;
      }
    }

    socket.join(targetRoomId);
    socketRoomMap.set(socket.id, targetRoomId);

    const currentPlayer = room.players.get(socket.id);
    const playersList = room.getPlayersList();

    // Confirm to joining client
    socket.emit('join_success', {
      roomId: targetRoomId,
      player: currentPlayer.toJSON(),
      players: playersList,
      settings: room.settings,
      isHost: currentPlayer.isHost
    });

    // Broadcast new player to all room members
    room.broadcast('player_joined', {
      player: currentPlayer.toJSON(),
      players: playersList
    });

    // Backward compatibility
    room.broadcast('update_players', playersList);

    // If game in progress, sync current state and canvas
    if (room.game.status !== 'WAITING') {
      const isDrawer = room.game.currentDrawerId === socket.id;
      socket.emit('game_state', {
        status: room.game.status,
        round: room.game.currentRound,
        maxRounds: room.game.maxRounds,
        drawerId: room.game.currentDrawerId,
        drawerName: room.players.get(room.game.currentDrawerId)?.username || '',
        wordHint: isDrawer ? room.game.currentWord : formatHint(room.game.currentWord, room.game.revealedIndices, room.game.wordMode),
        timeLeft: room.game.timeLeft
      });

      // Send complete canvas strokes history
      socket.emit('canvas_sync', {
        strokes: room.game.strokes
      });
    }

    console.log(`[Player Joined] ${finalName} -> Room ${targetRoomId}`);
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

  // 5. Start Game (Host Only)
  socket.on('start_game', ({ roomId }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;

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

  // 6. Word Selection
  socket.on('select_word', ({ roomId, word }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;

    room.game.selectWord(socket.id, word);
  });

  // 7. Drawing Events (Restricted to Drawer Only)
  socket.on('draw_start', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id || room.game.status !== 'DRAWING') return;

    room.game.startStroke(data);
    room.broadcastExcept(socket.id, 'draw_start', data);
  });

  socket.on('draw_move', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id || room.game.status !== 'DRAWING') return;

    room.game.addPoint(data);
    room.broadcastExcept(socket.id, 'draw_move', data);
  });

  socket.on('draw_end', () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.endStroke();
    room.broadcastExcept(socket.id, 'draw_end');
  });

  // Backward compatibility: draw_data
  socket.on('draw_data', (data) => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    if (data.isStarting) {
      room.game.startStroke({
        x: data.offsetX,
        y: data.offsetY,
        color: data.strokeColor,
        size: data.strokeSize
      });
    } else {
      room.game.addPoint({ x: data.offsetX, y: data.offsetY });
    }

    room.broadcastExcept(socket.id, 'draw_data', data);
  });

  // Undo Last Stroke
  socket.on('draw_undo', () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    const undone = room.game.undoStroke();
    if (undone) {
      room.broadcast('canvas_sync', { strokes: room.game.strokes });
    }
  });

  // Clear Canvas
  socket.on('clear_canvas', () => {
    const room = getPlayerRoom();
    if (!room || room.game.currentDrawerId !== socket.id) return;

    room.game.clearCanvas();
    room.broadcast('clear_canvas');
  });

  // 8. Chat & Guess Handling
  socket.on('send_message', ({ roomId, author, message, text }) => {
    const targetRoomId = roomId || socketRoomMap.get(socket.id);
    const room = rooms.get(targetRoomId);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (!player) return;

    const chatText = (text || message || '').trim();
    if (!chatText) return;

    const playerName = player.username || author || 'Player';

    // Process guess during DRAWING phase
    if (room.game.status === 'DRAWING') {
      // If player already guessed, their messages only go to players who also already guessed (no spoilers!)
      if (player.hasGuessed) {
        // Send to all players who guessed + drawer
        room.players.forEach(p => {
          if (p.hasGuessed || p.id === room.game.currentDrawerId) {
            io.to(p.id).emit('receive_message', {
              author: playerName,
              message: chatText,
              alreadyGuessed: true
            });
          }
        });
        return;
      }

      const guessRes = room.game.handleGuess(player, chatText);

      if (guessRes.isCorrect) {
        // Broadcast success notification
        room.broadcast('receive_message', {
          author: 'System',
          message: `🎉 ${playerName} guessed the word! (+${guessRes.points} pts)`,
          isSystem: true,
          isCorrectGuess: true
        });

        // Emit guess_result
        room.broadcast('guess_result', {
          correct: true,
          playerId: player.id,
          playerName: player.username,
          points: guessRes.points
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
        return;
      }
    }

    // Normal message broadcast
    room.broadcast('receive_message', {
      author: playerName,
      message: chatText,
      isSystem: false
    });
  });

  // 9. Moderation: Kick & VoteKick
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

  // 10. Play Again (after Game Over)
  socket.on('play_again', () => {
    const room = getPlayerRoom();
    if (!room || room.hostId !== socket.id) return;

    room.game.status = 'WAITING';
    room.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
    });

    room.broadcast('game_reset', {
      players: room.getPlayersList(),
      settings: room.settings
    });
  });

  // 11. Disconnect
  socket.on('disconnect', () => {
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
    const roomId = socketRoomMap.get(socket.id);
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
      const removed = room.removePlayer(socket.id);
      socketRoomMap.delete(socket.id);

      if (removed) {
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

const { formatHint } = require('./utils/words');

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Skribbl server running on http://localhost:${PORT}`);
});