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
  }

  start() {
    if (this.room.players.size < 1) {
      return { success: false, message: 'Need at least 1 player to start the game' };
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
    this.drawerOrder = Array.from(this.room.players.keys());
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

    // Validate drawer index
    if (this.currentDrawerIndex >= this.drawerOrder.length) {
      this.currentRound++;
      this.currentDrawerIndex = 0;
      // Re-evaluate drawer order in case players left/joined
      this.drawerOrder = Array.from(this.room.players.keys());
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

    // Generate word options
    const category = this.room.settings.wordCategory || 'all';
    const customWords = this.room.settings.customWords || [];
    this.wordOptions = getRandomWords(this.wordCount, category, customWords);

    // Broadcast clear canvas
    this.room.broadcast('canvas_clear');

    // Notify all players that round turn started
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
    if (this.status !== 'CHOOSING' || playerId !== this.currentDrawerId) {
      return false;
    }

    this.clearTurnTimers();
    this.status = 'DRAWING';
    this.currentWord = word.trim().toLowerCase();
    this.revealedIndices.clear();

    const drawer = this.room.players.get(this.currentDrawerId);
    const maskedHint = formatHint(this.currentWord, this.revealedIndices, this.wordMode);

    // Notify drawer with the secret word
    this.io.to(drawer.id).emit('word_chosen', {
      word: this.currentWord,
      isDrawer: true
    });

    // Broadcast to everyone that drawing has started
    this.room.broadcast('game_state', {
      status: 'DRAWING',
      round: this.currentRound,
      maxRounds: this.maxRounds,
      drawerId: drawer.id,
      drawerName: drawer.username,
      wordHint: maskedHint,
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
    // E.g. If drawTime = 60s and 2 hints: reveal at 40s (after 20s) and 20s (after 40s)
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
      // Base: 200 pts, plus time bonus up to 300 pts, rank 1 bonus +50
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

      // Check if all guessers have guessed
      const guessers = Array.from(this.room.players.values()).filter(
        p => p.id !== this.currentDrawerId
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
    if (this.status !== 'DRAWING') return;
    const stroke = {
      id: Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      color: data.color || '#000000',
      size: data.size || 5,
      isEraser: !!data.isEraser,
      points: [{ x: data.x, y: data.y }]
    };
    this.currentStroke = stroke;
    this.strokes.push(stroke);
  }

  addPoint(point) {
    if (this.currentStroke) {
      this.currentStroke.points.push({ x: point.x, y: point.y });
    }
  }

  endStroke() {
    this.currentStroke = null;
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

    // Prepare scores overview
    const playersList = Array.from(this.room.players.values()).map(p => p.toJSON());

    this.room.broadcast('round_end', {
      reason,
      word: this.currentWord,
      drawerName: drawer ? drawer.username : 'Unknown',
      players: playersList
    });

    // Move to next drawer
    this.currentDrawerIndex++;

    // 4 seconds transition to next round or game over
    this.timer = setTimeout(() => {
      this.startDrawerTurn();
    }, 4000);
  }

  endGame() {
    this.clearTurnTimers();
    this.status = 'GAME_OVER';

    // Sort players descending by score
    const leaderboard = Array.from(this.room.players.values())
      .sort((a, b) => b.score - a.score)
      .map(p => p.toJSON());

    const winner = leaderboard[0] || null;

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
        status: 'WAITING',
        round: 0,
        maxRounds: this.maxRounds,
        drawerId: null,
        drawerName: '',
        wordHint: '',
        timeLeft: 0
      });
    }
  }
}

module.exports = Game;
