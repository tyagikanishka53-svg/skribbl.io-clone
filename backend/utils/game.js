const { getRandomWords, checkGuess, formatHint } = require('./words');

class Game {
  constructor(room, io) {
    this.room = room;
    this.io = io;

    this.status = 'WAITING'; // WAITING | CHOOSING | DRAWING | ROUND_END | GAME_OVER
    this.currentRound = 0;
    this.maxRounds = room.settings.rounds || 3;
    this.drawTime = room.settings.drawTime || 60;
    this.wordCount = room.settings.wordCount || 3;
    this.hintsAllowed = room.settings.hints !== undefined ? room.settings.hints : 2;
    this.wordMode = room.settings.wordMode || 'normal';

    this.drawerOrder = [];
    this.currentDrawerIndex = 0;
    this.currentDrawerId = null;

    this.currentWord = '';
    this.wordOptions = [];
    this.revealedIndices = new Set();
    this.hintTimers = [];

    this.timeLeft = 0;
    this.timer = null;

    this.correctGuessCount = 0;
    this.strokes = []; // Stores complete drawing history for synchronization and undo
    this.currentStroke = null;
    this.lastRoundStrokes = []; // Stored for round replay feature
  }

  start() {
    // Non-spectators
    const activePlayers = Array.from(this.room.players.values()).filter(p => !p.isSpectator);
    if (activePlayers.length < 1) {
      return { success: false, message: 'Need at least 1 active non-spectator player to start' };
    }

    this.maxRounds = this.room.settings.rounds || 3;
    this.drawTime = this.room.settings.drawTime || 60;
    this.wordCount = this.room.settings.wordCount || 3;
    this.hintsAllowed = this.room.settings.hints !== undefined ? this.room.settings.hints : 2;
    this.wordMode = this.room.settings.wordMode || 'normal';

    // Reset scores for all players
    this.room.players.forEach(p => {
      p.score = 0;
      p.roundScore = 0;
      p.hasGuessed = false;
    });

    this.currentRound = 1;
    this.drawerOrder = activePlayers.map(p => p.id);
    this.currentDrawerIndex = 0;

    this.startDrawerTurn();
    return { success: true };
  }

  startDrawerTurn() {
    this.clearTurnTimers();
    this.strokes = [];
    this.currentStroke = null;
    this.correctGuessCount = 0;
    this.revealedIndices.clear();

    // Reset round states on players
    this.room.players.forEach(p => p.resetRound());

    // Update active drawer list (exclude spectators)
    const activePlayerIds = Array.from(this.room.players.values())
      .filter(p => !p.isSpectator)
      .map(p => p.id);

    // Keep drawerOrder in sync with connected active players
    this.drawerOrder = activePlayerIds;

    // Validate drawer index
    if (this.currentDrawerIndex >= this.drawerOrder.length) {
      this.currentRound++;
      this.currentDrawerIndex = 0;
    }

    if (this.currentRound > this.maxRounds || this.drawerOrder.length < 1) {
      this.endGame();
      return;
    }

    this.currentDrawerId = this.drawerOrder[this.currentDrawerIndex];
    const drawer = this.room.players.get(this.currentDrawerId);

    if (!drawer) {
      // If player disconnected, advance to next
      this.currentDrawerIndex++;
      this.startDrawerTurn();
      return;
    }

    this.status = 'CHOOSING';
    this.currentWord = '';

    // Generate word options according to room settings
    const category = this.room.settings.wordCategory || 'all';
    const customWords = this.room.settings.customWords || [];
    const language = this.room.settings.language || 'en';
    const wordMode = this.room.settings.wordMode || 'normal';

    this.wordOptions = getRandomWords(this.wordCount, category, customWords, language, wordMode);

    // Broadcast clear canvas
    this.room.broadcast('canvas_clear');

    // Notify all players that round turn started (PDF round_start event format)
    this.room.broadcast('round_start', {
      round: this.currentRound,
      maxRounds: this.maxRounds,
      drawerId: drawer.id,
      drawerName: drawer.username,
      drawTime: this.drawTime,
      status: `${drawer.username} is choosing a word...`
    });

    // Send word choices ONLY to the drawer
    this.io.to(drawer.id).emit('word_options', {
      words: this.wordOptions,
      timeLimit: 15
    });

    // Also support round_start with wordOptions for drawer per PDF spec
    this.io.to(drawer.id).emit('round_start', {
      round: this.currentRound,
      maxRounds: this.maxRounds,
      drawerId: drawer.id,
      drawerName: drawer.username,
      wordOptions: this.wordOptions,
      drawTime: this.drawTime,
      status: 'Choose a word to draw!'
    });

    // 15 seconds to choose a word, otherwise auto-pick first option
    let chooseTimeLeft = 15;
    this.timer = setInterval(() => {
      chooseTimeLeft--;
      this.io.to(drawer.id).emit('choose_time_update', chooseTimeLeft);

      if (chooseTimeLeft <= 0) {
        clearInterval(this.timer);
        this.timer = null;
        const autoWord = this.wordOptions[0] || 'cat';
        this.selectWord(drawer.id, autoWord);
      }
    }, 1000);
  }

  selectWord(playerId, word) {
    if (this.status !== 'CHOOSING') {
      return false;
    }

    // Resolve drawer player instance safely
    let drawer = this.room.players.get(this.currentDrawerId);
    if (!drawer) {
      drawer = this.room.players.get(playerId);
      if (drawer) {
        this.currentDrawerId = drawer.id;
      }
    }

    // If still no drawer found (e.g. disconnected), advance to next turn
    if (!drawer) {
      console.log('[Game] Drawer disconnected during choosing. Advancing to next turn.');
      this.currentDrawerIndex++;
      this.startDrawerTurn();
      return false;
    }

    this.clearTurnTimers();
    this.status = 'DRAWING';
    this.currentWord = word.trim().toLowerCase();
    this.revealedIndices.clear();

    const maskedHint = formatHint(this.currentWord, this.revealedIndices, this.wordMode);

    // Notify drawer with the secret word
    this.io.to(drawer.id).emit('word_chosen', {
      word: this.currentWord,
      isDrawer: true
    });

    // Broadcast to everyone that drawing has started (PDF game_state format)
    this.room.broadcast('game_state', {
      phase: 'DRAWING',
      status: 'DRAWING',
      round: this.currentRound,
      maxRounds: this.maxRounds,
      drawerId: drawer.id,
      drawerName: drawer.username,
      wordHint: maskedHint,
      word: maskedHint,
      hints: 0,
      wordLength: this.currentWord.length,
      timeLeft: this.drawTime
    });

    // Schedule progressive hints
    this.scheduleHints();

    // Start drawing countdown timer
    this.timeLeft = this.drawTime;
    this.timer = setInterval(() => {
      this.timeLeft--;
      this.room.broadcast('timer_update', this.timeLeft);

      if (this.timeLeft <= 0) {
        this.endRound("Time's up!");
      }
    }, 1000);

    return true;
  }

  scheduleHints() {
    if (this.hintsAllowed <= 0 || this.wordMode === 'hidden') return;

    // Filter index of valid letters (exclude spaces and symbols)
    const validIndices = [];
    for (let i = 0; i < this.currentWord.length; i++) {
      if (/[a-zA-Z0-9]/.test(this.currentWord[i])) {
        validIndices.push(i);
      }
    }

    if (validIndices.length <= 1) return;

    // Max reveals: up to hintsAllowed, but never reveal more than ~50% of the word
    const maxReveals = Math.min(
      this.hintsAllowed,
      Math.max(1, Math.floor(validIndices.length * 0.5))
    );

    // Spread reveals evenly through turn time
    const intervalSec = this.drawTime / (maxReveals + 1);

    for (let h = 1; h <= maxReveals; h++) {
      const revealAfterSeconds = intervalSec * h;
      const timeoutId = setTimeout(() => {
        if (this.status !== 'DRAWING') return;

        // Pick a random unrevealed index
        const unrevealed = validIndices.filter(idx => !this.revealedIndices.has(idx));
        if (unrevealed.length > 0) {
          const randomIdx = unrevealed[Math.floor(Math.random() * unrevealed.length)];
          this.revealedIndices.add(randomIdx);

          const updatedHint = formatHint(this.currentWord, this.revealedIndices, this.wordMode);
          // Broadcast hint update to everyone
          this.room.broadcast('hint_update', {
            wordHint: updatedHint
          });

          // Also broadcast updated game_state for clients expecting game_state with hints
          this.room.broadcast('game_state', {
            phase: 'DRAWING',
            status: 'DRAWING',
            round: this.currentRound,
            maxRounds: this.maxRounds,
            drawerId: this.currentDrawerId,
            drawerName: this.room.players.get(this.currentDrawerId)?.username || '',
            wordHint: updatedHint,
            word: updatedHint,
            hints: this.revealedIndices.size,
            timeLeft: this.timeLeft
          });
        }
      }, revealAfterSeconds * 1000);

      this.hintTimers.push(timeoutId);
    }
  }

  handleGuess(player, text) {
    if (this.status !== 'DRAWING') {
      return { handled: false };
    }

    // Drawer cannot guess when other players are present
    if (player.id === this.currentDrawerId && this.room.players.size > 1) {
      return { handled: false, isDrawer: true };
    }

    // Spectator cannot gain points or end rounds
    if (player.isSpectator) {
      return { handled: false, isSpectator: true };
    }

    // Already guessed
    if (player.hasGuessed) {
      return { handled: true, alreadyGuessed: true };
    }

    const { isCorrect, isClose } = checkGuess(text, this.currentWord);

    if (isCorrect) {
      player.hasGuessed = true;
      this.correctGuessCount++;
      player.guessRank = this.correctGuessCount;

      // Scoring formula:
      // Base: 200 pts, plus time bonus up to 300 pts, rank 1 bonus +50, rank 2 bonus +25
      const timeBonus = Math.floor((this.timeLeft / this.drawTime) * 300);
      const rankBonus = player.guessRank === 1 ? 50 : (player.guessRank === 2 ? 25 : 0);
      const earned = Math.max(50, 200 + timeBonus + rankBonus);

      player.addScore(earned);

      // Drawer also earns points when someone guesses!
      const drawer = this.room.players.get(this.currentDrawerId);
      if (drawer && drawer.id !== player.id) {
        const drawerBonus = Math.floor(earned * 0.35);
        drawer.addScore(drawerBonus);
      }

      // Check if all active guessers have guessed
      const guessers = Array.from(this.room.players.values()).filter(
        p => p.id !== this.currentDrawerId && !p.isSpectator
      );
      const allGuessed = guessers.length === 0 || guessers.every(p => p.hasGuessed);

      if (allGuessed) {
        this.endRound(guessers.length === 0 ? "Correct! Secret word guessed!" : "Everyone guessed the word!");
      }

      return {
        handled: true,
        isCorrect: true,
        points: earned,
        allGuessed
      };
    }

    if (isClose) {
      return {
        handled: true,
        isClose: true
      };
    }

    return { handled: false };
  }

  // Drawing stroke handlers
  startStroke(data) {
    if (this.status !== 'DRAWING') return null;
    const stroke = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type: 'stroke',
      color: data.color || '#000000',
      size: data.size || 5,
      isEraser: !!data.isEraser,
      points: [{ x: data.x, y: data.y }]
    };
    this.currentStroke = stroke;
    this.strokes.push(stroke);
    return stroke;
  }

  addPoint(point) {
    if (this.currentStroke && this.currentStroke.points) {
      this.currentStroke.points.push({ x: point.x, y: point.y });
    }
  }

  endStroke() {
    this.currentStroke = null;
  }

  // Flood fill action for bucket tool
  addFill(data) {
    if (this.status !== 'DRAWING') return null;
    const fillAction = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      type: 'fill',
      x: data.x,
      y: data.y,
      color: data.color || '#000000'
    };
    this.strokes.push(fillAction);
    return fillAction;
  }

  undoStroke() {
    if (this.strokes.length > 0) {
      this.strokes.pop();
      return true;
    }
    return false;
  }

  clearCanvas() {
    this.strokes = [];
    this.currentStroke = null;
  }

  endRound(reason) {
    this.clearTurnTimers();
    this.status = 'ROUND_END';

    const drawer = this.room.players.get(this.currentDrawerId);

    // Save strokes for round replay
    this.lastRoundStrokes = [...this.strokes];

    // Determine next drawer
    const nextIndex = (this.currentDrawerIndex + 1);
    const nextDrawerId = this.drawerOrder[nextIndex % (this.drawerOrder.length || 1)];
    const nextDrawer = this.room.players.get(nextDrawerId);

    // Prepare scores map and player list
    const scoresMap = {};
    this.room.players.forEach(p => {
      scoresMap[p.username] = p.score;
    });

    const playersList = Array.from(this.room.players.values()).map(p => p.toJSON());

    // Emit round_end per PDF specification { word, scores, nextDrawer }
    this.room.broadcast('round_end', {
      word: this.currentWord,
      scores: scoresMap,
      nextDrawer: nextDrawer ? nextDrawer.username : 'None',
      reason,
      drawerName: drawer ? drawer.username : 'Unknown',
      players: playersList,
      hasReplay: this.lastRoundStrokes.length > 0
    });

    // Move to next drawer
    this.currentDrawerIndex++;

    // 4.5 seconds transition to next round or game over
    this.timer = setTimeout(() => {
      this.startDrawerTurn();
    }, 4500);
  }

  endGame() {
    this.clearTurnTimers();
    this.status = 'GAME_OVER';

    // Sort players descending by score
    const leaderboard = Array.from(this.room.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => p.toJSON());

    const winner = leaderboard[0] || null;

    // Emit game_over per PDF spec { winner, leaderboard }
    this.room.broadcast('game_over', {
      winner,
      leaderboard
    });
  }

  clearTurnTimers() {
    if (this.timer) {
      clearInterval(this.timer);
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.hintTimers.forEach(id => clearTimeout(id));
    this.hintTimers = [];
  }

  onPlayerLeave(playerId) {
    // If the active drawer left, end round immediately and proceed
    if (this.currentDrawerId === playerId) {
      if (this.status === 'DRAWING' || this.status === 'CHOOSING') {
        this.endRound("The drawer left the game!");
      }
    }

    // Remove from drawer order
    const orderIndex = this.drawerOrder.indexOf(playerId);
    if (orderIndex !== -1) {
      this.drawerOrder.splice(orderIndex, 1);
      if (orderIndex < this.currentDrawerIndex) {
        this.currentDrawerIndex--;
      }
    }

    // If no players remain during active game, reset to waiting
    if (this.room.players.size < 1 && (this.status === 'DRAWING' || this.status === 'CHOOSING')) {
      this.clearTurnTimers();
      this.status = 'WAITING';
      this.room.broadcast('status_message', 'Waiting for more players to join...');
      this.room.broadcast('game_state', {
        phase: 'WAITING',
        status: 'WAITING',
        round: 0,
        maxRounds: this.maxRounds,
        drawerId: null,
        drawerName: '',
        wordHint: '',
        word: '',
        hints: 0,
        timeLeft: 0
      });
    }
  }
}

module.exports = Game;
