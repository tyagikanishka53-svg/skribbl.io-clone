import React, { useState, useEffect } from 'react';
import Avatar from './Avatar';

function Leaderboard({ players = [], currentDrawerId, isHost, currentUserId, socket }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  // Close moderation menu when clicking anywhere outside
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.player-card')) {
        setSelectedPlayer(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  // Sort descending by score
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  const handleKick = (targetId) => {
    if (window.confirm('Are you sure you want to kick this player?')) {
      socket?.emit('kick_player', { targetId });
      setSelectedPlayer(null);
    }
  };

  const handleBan = (targetId) => {
    if (window.confirm('Are you sure you want to BAN this player from this room?')) {
      socket?.emit('ban_player', { targetId });
      setSelectedPlayer(null);
    }
  };

  const handleVoteKick = (targetId) => {
    socket?.emit('vote_kick', { targetId });
    setSelectedPlayer(null);
  };

  const handleReport = (targetId) => {
    const reason = prompt('Reason for reporting this player:', 'Inappropriate behavior');
    if (reason) {
      socket?.emit('report_player', { targetId, reason });
      setSelectedPlayer(null);
    }
  };

  return (
    <div className="leaderboard-container">
      <div className="leaderboard-header">
        <h3>Players ({players.length})</h3>
      </div>

      <ul className="player-list">
        {sortedPlayers.map((player, index) => {
          const isDrawer = player.id === currentDrawerId;
          const isMe = player.id === currentUserId;
          const isMenuOpen = selectedPlayer === player.id;

          let rankBadge = `#${index + 1}`;
          if (index === 0) rankBadge = '🥇';
          else if (index === 1) rankBadge = '🥈';
          else if (index === 2) rankBadge = '🥉';

          return (
            <li
              key={player.id}
              className={`player-card ${isDrawer ? 'is-drawer' : ''} ${player.hasGuessed ? 'has-guessed' : ''} ${isMe ? 'is-self' : ''} ${player.isSpectator ? 'is-spectator' : ''}`}
              onClick={() => !isMe && setSelectedPlayer(isMenuOpen ? null : player.id)}
            >
              <div className="rank-col">{rankBadge}</div>

              <div className="avatar-col">
                <Avatar avatar={player.avatar} size={36} />
              </div>

              <div className="player-info-col">
                <div className="player-name-row">
                  <span className="player-username" title={player.username}>
                    {player.username} {isMe ? '(You)' : ''}
                  </span>
                  {player.isHost && <span className="host-icon" title="Host">👑</span>}
                  {player.isSpectator && <span className="spectator-icon" title="Spectator">👁️</span>}
                </div>
                <div className="player-score-row">
                  <span className="score-text">{player.score} pts</span>
                  {player.roundScore > 0 && (
                    <span className="round-score-pill">+{player.roundScore}</span>
                  )}
                  {player.isReady && !player.isHost && (
                    <span className="ready-pill" title="Ready to play">✓ Ready</span>
                  )}
                </div>
              </div>

              <div className="player-status-col">
                {isDrawer && <span className="status-badge drawer-badge" title="Drawing now">✏️</span>}
                {player.hasGuessed && !isDrawer && (
                  <span className="status-badge guessed-badge" title="Guessed the word!">✅</span>
                )}
              </div>

              {/* Moderation Dropdown Menu (Kick, Ban, VoteKick, Report) */}
              {isMenuOpen && !isMe && (
                <div className="player-mod-menu" onClick={(e) => e.stopPropagation()}>
                  {isHost ? (
                    <>
                      <button 
                        type="button" 
                        className="mod-btn kick-btn"
                        onClick={() => handleKick(player.id)}
                      >
                        👢 Kick Player
                      </button>
                      <button 
                        type="button" 
                        className="mod-btn ban-btn"
                        onClick={() => handleBan(player.id)}
                      >
                        🚫 Ban Player
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        type="button" 
                        className="mod-btn votekick-btn"
                        onClick={() => handleVoteKick(player.id)}
                      >
                        ⚠️ Vote to Kick
                      </button>
                      <button 
                        type="button" 
                        className="mod-btn report-btn"
                        onClick={() => handleReport(player.id)}
                      >
                        🚩 Report Player
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default Leaderboard;