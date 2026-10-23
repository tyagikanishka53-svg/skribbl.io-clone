const Game = require('./game');

class Room {
  constructor({ id, isPrivate = false, settings = {}, io }) {
    this.id = id;
    this.isPrivate = !!isPrivate;
    this.io = io;
    this.createdAt = Date.now();

    // Default settings per assignment spec
    this.settings = {
      maxPlayers: Math.min(20, Math.max(2, parseInt(settings.maxPlayers, 10) || 8)),
      rounds: Math.min(10, Math.max(2, parseInt(settings.rounds, 10) || 3)),
      drawTime: Math.min(240, Math.max(15, parseInt(settings.drawTime, 10) || 60)),
      wordCount: Math.min(5, Math.max(1, parseInt(settings.wordCount, 10) || 3)),
      hints: settings.hints !== undefined ? Math.min(5, Math.max(0, parseInt(settings.hints, 10))) : 2,
      wordCategory: settings.wordCategory || 'all',
      wordMode: settings.wordMode || 'normal', // 'normal' | 'hidden' | 'combination'
      language: settings.language || 'en', // 'en' | 'es' | 'de' | 'fr'
      customWords: Array.isArray(settings.customWords) 
        ? settings.customWords 
        : (typeof settings.customWords === 'string' && settings.customWords.trim()
            ? settings.customWords.split(',').map(w => w.trim()).filter(Boolean)
            : [])
    };

    this.players = new Map();
    this.hostId = null;
    this.game = new Game(this, io);
    this.votekicks = new Map(); // targetId -> Set(voterIds)
    this.bannedPlayers = new Set(); // Set of banned usernames (lowercase)
    this.reports = new Map(); // targetId -> Array of reports
  }

  addPlayer(player) {
    if (this.bannedPlayers.has(player.username.toLowerCase()) || this.bannedPlayers.has(player.id)) {
      return { success: false, reason: 'You have been banned from this room.' };
    }

    if (this.players.size >= this.settings.maxPlayers) {
      return { success: false, reason: 'Room is full' };
    }

    if (this.players.size === 0) {
      player.isHost = true;
      player.isReady = true;
      this.hostId = player.id;
    }

    this.players.set(player.id, player);
    return { success: true };
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    this.players.delete(socketId);

    // Clean up votekicks
    this.votekicks.delete(socketId);
    this.votekicks.forEach(voters => voters.delete(socketId));

    // Notify game engine
    this.game.onPlayerLeave(socketId);

    // If host left, elect a new host
    if (this.hostId === socketId && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      nextHost.isHost = true;
      nextHost.isReady = true;
      this.hostId = nextHost.id;
      this.broadcast('host_changed', { hostId: this.hostId, hostName: nextHost.username });
    }

    return player;
  }

  banPlayer(targetId) {
    const player = this.players.get(targetId);
    if (!player) return null;

    this.bannedPlayers.add(player.username.toLowerCase());
    this.bannedPlayers.add(targetId);
    return this.removePlayer(targetId);
  }

  toggleReady(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    player.isReady = !player.isReady;
    return player.isReady;
  }

  toggleSpectator(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;
    player.isSpectator = !player.isSpectator;
    return player.isSpectator;
  }

  reportPlayer(reporterId, targetId, reason = 'Inappropriate behavior') {
    const target = this.players.get(targetId);
    const reporter = this.players.get(reporterId);
    if (!target || !reporter) return false;

    if (!this.reports.has(targetId)) {
      this.reports.set(targetId, []);
    }
    this.reports.get(targetId).push({
      reporterName: reporter.username,
      reason,
      time: Date.now()
    });

    return true;
  }

  updateSettings(newSettings) {
    if (this.game.status !== 'WAITING') {
      return { success: false, reason: 'Cannot change settings once game is in progress' };
    }

    if (newSettings.maxPlayers !== undefined) {
      this.settings.maxPlayers = Math.min(20, Math.max(2, parseInt(newSettings.maxPlayers, 10) || 8));
    }
    if (newSettings.rounds !== undefined) {
      this.settings.rounds = Math.min(10, Math.max(2, parseInt(newSettings.rounds, 10) || 3));
    }
    if (newSettings.drawTime !== undefined) {
      this.settings.drawTime = Math.min(240, Math.max(15, parseInt(newSettings.drawTime, 10) || 60));
    }
    if (newSettings.wordCount !== undefined) {
      this.settings.wordCount = Math.min(5, Math.max(1, parseInt(newSettings.wordCount, 10) || 3));
    }
    if (newSettings.hints !== undefined) {
      this.settings.hints = Math.min(5, Math.max(0, parseInt(newSettings.hints, 10)));
    }
    if (newSettings.wordCategory !== undefined) {
      this.settings.wordCategory = newSettings.wordCategory;
    }
    if (newSettings.wordMode !== undefined) {
      this.settings.wordMode = newSettings.wordMode;
    }
    if (newSettings.language !== undefined) {
      this.settings.language = newSettings.language;
    }
    if (newSettings.customWords !== undefined) {
      this.settings.customWords = Array.isArray(newSettings.customWords)
        ? newSettings.customWords
        : newSettings.customWords.split(',').map(w => w.trim()).filter(Boolean);
    }

    return { success: true, settings: this.settings };
  }

  voteKick(voterId, targetId) {
    if (!this.players.has(targetId) || voterId === targetId) {
      return { kicked: false };
    }

    if (!this.votekicks.has(targetId)) {
      this.votekicks.set(targetId, new Set());
    }

    const votes = this.votekicks.get(targetId);
    votes.add(voterId);

    const requiredVotes = Math.ceil(this.players.size / 2);
    if (votes.size >= requiredVotes) {
      this.votekicks.delete(targetId);
      return { kicked: true, targetId, votes: votes.size, required: requiredVotes };
    }

    return { kicked: false, targetId, votes: votes.size, required: requiredVotes };
  }

  broadcast(event, data) {
    this.io.to(this.id).emit(event, data);
  }

  broadcastExcept(socketId, event, data) {
    this.io.to(this.id).except(socketId).emit(event, data);
  }

  getPlayersList() {
    return Array.from(this.players.values()).map(p => p.toJSON());
  }

  getPublicDetails() {
    return {
      roomId: this.id,
      playerCount: this.players.size,
      maxPlayers: this.settings.maxPlayers,
      rounds: this.settings.rounds,
      status: this.game.status,
      isPrivate: this.isPrivate,
      category: this.settings.wordCategory,
      language: this.settings.language || 'en',
      wordMode: this.settings.wordMode || 'normal'
    };
  }
}

module.exports = Room;
