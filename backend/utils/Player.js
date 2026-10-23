class Player {
  constructor({ id, username, avatar = null, isHost = false }) {
    this.id = id;
    this.username = (username || 'Player').slice(0, 16);
    this.avatar = avatar || {
      color: '#3498db',
      eyes: 0,
      mouth: 0
    };
    this.score = 0;
    this.roundScore = 0;
    this.hasGuessed = false;
    this.guessRank = 0;
    this.isHost = isHost;
    this.isReady = isHost ? true : false;
    this.isSpectator = false;
    this.votedToKick = new Set();
  }

  resetRound() {
    this.hasGuessed = false;
    this.roundScore = 0;
    this.guessRank = 0;
  }

  addScore(points) {
    this.roundScore += points;
    this.score += points;
  }

  toJSON() {
    return {
      id: this.id,
      username: this.username,
      avatar: this.avatar,
      score: this.score,
      roundScore: this.roundScore,
      hasGuessed: this.hasGuessed,
      isHost: this.isHost,
      isReady: this.isReady,
      isSpectator: this.isSpectator
    };
  }
}

module.exports = Player;
