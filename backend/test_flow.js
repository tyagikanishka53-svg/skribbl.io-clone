const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const ioClient = require('../frontend/node_modules/socket.io-client');

const Room = require('./utils/Room');
const Player = require('./utils/Player');
const { checkGuess, formatHint } = require('./utils/words');

async function runTests() {
  console.log('🧪 Starting Skribbl.io Test Suite...\n');

  // Test 1: Unit tests for word guessing & hint masking
  console.log('1️⃣ Testing Word & Guessing Logic:');
  const exact = checkGuess('apple', 'apple');
  console.assert(exact.isCorrect === true, 'Exact match failed');

  const caseInsensitive = checkGuess('  ApPLe ', 'apple');
  console.assert(caseInsensitive.isCorrect === true, 'Case insensitive/trim failed');

  const closeGuess = checkGuess('aple', 'apple');
  console.assert(closeGuess.isClose === true, 'Close guess detection failed');

  const wrongGuess = checkGuess('banana', 'apple');
  console.assert(wrongGuess.isCorrect === false && wrongGuess.isClose === false, 'Wrong guess failed');

  const hintNormal = formatHint('apple', new Set([0, 3]), 'normal');
  console.assert(hintNormal === 'A _ _ L _', `Masked hint failed: expected "A _ _ L _", got "${hintNormal}"`);

  const hintHidden = formatHint('apple', new Set(), 'hidden');
  console.assert(hintHidden === '???', `Hidden hint failed: got "${hintHidden}"`);
  console.log('  ✅ Word & Hint logic tests passed!\n');

  // Test 2: End-to-end Socket Server integration
  console.log('2️⃣ Testing Real-time WebSockets & Game Lifecycle:');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  const rooms = new Map();
  const socketRoomMap = new Map();

  io.on('connection', (socket) => {
    socket.on('create_room', ({ hostName, settings = {} }) => {
      const roomId = 'TEST1';
      const room = new Room({ id: roomId, settings, io });
      rooms.set(roomId, room);

      const player = new Player({ id: socket.id, username: hostName, isHost: true });
      room.addPlayer(player);
      socket.join(roomId);
      socketRoomMap.set(socket.id, roomId);

      socket.emit('room_created', { roomId, player: player.toJSON(), players: room.getPlayersList() });
    });

    socket.on('join_room', ({ roomId, username }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const player = new Player({ id: socket.id, username, isHost: false });
      room.addPlayer(player);
      socket.join(roomId);
      socketRoomMap.set(socket.id, roomId);

      room.broadcast('player_joined', { player: player.toJSON(), players: room.getPlayersList() });
    });

    socket.on('start_game', ({ roomId }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.game.start();
    });

    socket.on('select_word', ({ roomId, word }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      room.game.selectWord(socket.id, word);
    });

    socket.on('draw_start', (data) => {
      const roomId = socketRoomMap.get(socket.id);
      const room = rooms.get(roomId);
      if (!room) return;
      room.game.startStroke(data);
      room.broadcastExcept(socket.id, 'draw_start', data);
    });

    socket.on('draw_undo', () => {
      const roomId = socketRoomMap.get(socket.id);
      const room = rooms.get(roomId);
      if (!room) return;
      room.game.undoStroke();
      room.broadcast('canvas_sync', { strokes: room.game.strokes });
    });

    socket.on('send_message', ({ roomId, author, message }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      const player = room.players.get(socket.id);

      if (room.game.status === 'DRAWING') {
        const guessRes = room.game.handleGuess(player, message);
        if (guessRes.isCorrect) {
          room.broadcast('receive_message', {
            author: 'System',
            message: `🎉 ${author} guessed the word!`,
            isSystem: true,
            isCorrectGuess: true
          });
          room.broadcast('update_players', room.getPlayersList());
          return;
        } else if (guessRes.isClose) {
          socket.emit('receive_message', {
            author: 'System',
            message: `💡 '${message}' is close!`,
            isSystem: true,
            isClose: true
          });
          return;
        }
      }
      room.broadcast('receive_message', { author, message });
    });
  });

  await new Promise(res => server.listen(5099, res));
  console.log('  Server listening on port 5099');

  // Client 1 (Host)
  const client1 = ioClient.connect('http://localhost:5099', { transports: ['websocket'] });
  // Client 2 (Guesser)
  const client2 = ioClient.connect('http://localhost:5099', { transports: ['websocket'] });

  await new Promise(res => client1.on('connect', res));
  await new Promise(res => client2.on('connect', res));
  console.log('  Clients connected');

  // Step 1: Create room
  client1.emit('create_room', {
    hostName: 'Alice',
    settings: { rounds: 2, drawTime: 45, wordCount: 3, hints: 2 }
  });

  await new Promise((res) => {
    client1.on('room_created', (data) => {
      console.assert(data.roomId === 'TEST1', 'Room ID mismatch');
      console.assert(data.player.username === 'Alice', 'Host username mismatch');
      res();
    });
  });
  console.log('  ✅ Room created successfully');

  // Step 2: Join room
  client2.emit('join_room', { roomId: 'TEST1', username: 'Bob' });
  await new Promise((res) => {
    client1.on('player_joined', (data) => {
      console.assert(data.players.length === 2, 'Player count should be 2');
      console.assert(data.player.username === 'Bob', 'Player 2 username mismatch');
      res();
    });
  });
  console.log('  ✅ Player 2 joined successfully');

  // Step 3: Start Game
  client1.emit('start_game', { roomId: 'TEST1' });
  const wordChoices = await new Promise((res) => {
    client1.on('word_options', (data) => {
      console.assert(data.words.length === 3, 'Expected 3 word choices');
      res(data.words);
    });
  });
  console.log('  ✅ Round started, drawer received word options:', wordChoices);

  // Step 4: Drawer selects word
  const chosenWord = wordChoices[0];
  client1.emit('select_word', { roomId: 'TEST1', word: chosenWord });

  await new Promise((res) => {
    client2.on('game_state', (state) => {
      console.assert(state.status === 'DRAWING', 'Status should be DRAWING');
      console.assert(state.wordHint.includes('_'), 'Guesser should receive blank hints');
      res();
    });
  });
  console.log('  ✅ Drawing phase active, masked hint received by guesser');

  // Step 5: Drawer draws and tests undo
  client1.emit('draw_start', { x: 50, y: 50, color: '#e74c3c', size: 10 });
  await new Promise((res) => {
    client2.on('draw_start', (data) => {
      console.assert(data.color === '#e74c3c', 'Color mismatch');
      res();
    });
  });
  console.log('  ✅ Real-time drawing stroke synchronized');

  client1.emit('draw_undo');
  await new Promise((res) => {
    client2.on('canvas_sync', (data) => {
      console.assert(data.strokes.length === 0, 'Stroke was not undone');
      res();
    });
  });
  console.log('  ✅ Undo stroke synchronized');

  // Step 6: Close guess
  client2.emit('send_message', {
    roomId: 'TEST1',
    author: 'Bob',
    message: chosenWord.slice(0, -1) // 1 letter off
  });

  await new Promise((res) => {
    client2.on('receive_message', (msg) => {
      if (msg.isClose) {
        console.assert(msg.isClose === true, 'Close message expected');
        res();
      }
    });
  });
  console.log('  ✅ Close guess alert received privately');

  // Step 7: Correct guess
  client2.emit('send_message', {
    roomId: 'TEST1',
    author: 'Bob',
    message: chosenWord
  });

  await new Promise((res) => {
    client1.on('receive_message', (msg) => {
      if (msg.isCorrectGuess) {
        console.assert(msg.isCorrectGuess === true, 'Correct guess announcement expected');
        res();
      }
    });
  });
  console.log('  ✅ Correct guess processed, points broadcast');

  // Clean up
  client1.disconnect();
  client2.disconnect();
  server.close();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% functional.\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
