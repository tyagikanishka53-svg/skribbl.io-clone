import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import Canvas from '../components/Canvas';
import Chat from '../components/Chat';
import Leaderboard from '../components/Leaderboard';
import Avatar from '../components/Avatar';

function Game({ socket }) {
  const { roomId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryName = searchParams.get('name');

  // Retrieve user credentials from navigation state, query param, or defaults
  const [username] = useState(
    queryName ||
    location.state?.username || 
    localStorage.getItem('skribbl_username') || 
    `Player${Math.floor(1000 + Math.random() * 9000)}`
  );

  const [avatar] = useState(
    location.state?.avatar || {
      color: ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#3498db'][Math.floor(Math.random() * 7)],
      eyes: Math.floor(Math.random() * 4),
      mouth: Math.floor(Math.random() * 4)
    }
  );

  const initialSettings = location.state?.initialSettings || null;
  const isCreator = location.state?.isCreator || false;
  const initialSpectator = location.state?.isSpectator || false;

  // Game & Room state
  const [players, setPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [roomSettings, setRoomSettings] = useState({
    rounds: 3,
    drawTime: 60,
    maxPlayers: 8,
    hints: 2,
    wordCategory: 'all',
    wordMode: 'normal',
    language: 'en'
  });

  const [gamePhase, setGamePhase] = useState('WAITING'); // WAITING | CHOOSING | DRAWING | ROUND_END | GAME_OVER
  const [currentRound, setCurrentRound] = useState(1);
  const [maxRounds, setMaxRounds] = useState(3);
  const [timeLeft, setTimeLeft] = useState(60);

  // Turn data
  const [drawerId, setDrawerId] = useState('');
  const [drawerName, setDrawerName] = useState('');
  const [wordChoices, setWordChoices] = useState([]);
  const [chooseTime, setChooseTime] = useState(15);
  const [secretWord, setSecretWord] = useState('');
  const [wordHint, setWordHint] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Round End & Game Over modals
  const [roundEndData, setRoundEndData] = useState(null);
  const [gameOverData, setGameOverData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const [isConnected, setIsConnected] = useState(socket.connected);

  const currentUserId = socket.id;
  const myPlayer = players.find(p => p.id === socket.id);

  // Checks socket ID, username, drawerName, or single-player test mode
  const isMyTurn =
    (socket.id && drawerId && socket.id === drawerId) ||
    (username && drawerName && username === drawerName) ||
    (myPlayer && drawerId && myPlayer.id === drawerId) ||
    (myPlayer && drawerName && myPlayer.username === drawerName) ||
    players.length === 1;

  const hasGuessed = !!myPlayer?.hasGuessed;
  const isMyReady = !!myPlayer?.isReady;
  const isMySpectator = !!myPlayer?.isSpectator;

  // Formats hint underscores with spaces for clean UI display (e.g. "b_n_n_" -> "B _ N _ N _")
  const formatHintDisplay = (hint) => {
    if (!hint) return '';
    return hint.split('').map(char => (char === '_' ? '_' : char.toUpperCase())).join(' ');
  };

  // Fallback so the user always sees their own profile even before initial socket roundtrip
  const displayPlayers = players.length > 0 ? players : [
    {
      id: socket.id || 'me',
      username,
      avatar,
      score: 0,
      roundScore: 0,
      hasGuessed: false,
      isHost: isHost || isCreator || true,
      isReady: true,
      isSpectator: initialSpectator
    }
  ];

  useEffect(() => {
    // Helper function to emit room join or creation
    const sendJoin = () => {
      if (!socket) return;
      if (isCreator && initialSettings) {
        socket.emit('create_room', {
          roomId,
          hostName: username,
          settings: initialSettings,
          avatar,
          isPrivate: initialSettings.isPrivate
        });
      } else {
        socket.emit('join_room', {
          roomId,
          playerName: username,
          username,
          avatar,
          isSpectator: initialSpectator
        });
      }
    };

    // Connection Handlers
    const handleConnect = () => {
      setIsConnected(true);
      sendJoin(); // Guarantees room registration when connection completes
    };

    const handleDisconnect = () => setIsConnected(false);

    // Register Socket Event Listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    const handleJoinSuccess = ({ players: incomingPlayers, settings, isHost: hostStatus }) => {
      setPlayers(incomingPlayers || []);
      setIsConnected(true);
      const me = (incomingPlayers || []).find(p => p.id === socket.id);
      setIsHost(hostStatus !== undefined ? hostStatus : (me?.isHost || incomingPlayers?.length === 1));
      if (settings) setRoomSettings(settings);
    };

    socket.on('join_success', handleJoinSuccess);
    socket.on('room_created', handleJoinSuccess);

    socket.on('player_joined', ({ player, players: incomingPlayers }) => {
      setPlayers(incomingPlayers || []);
      const me = (incomingPlayers || []).find(p => p.id === socket.id);
      if (me?.isHost) setIsHost(true);
      setStatusMessage(`${player.username} joined the room!`);
      setTimeout(() => setStatusMessage(''), 3000);
    });

    socket.on('player_left', ({ playerName, players: incomingPlayers }) => {
      setPlayers(incomingPlayers || []);
      const me = (incomingPlayers || []).find(p => p.id === socket.id);
      if (me?.isHost) setIsHost(true);
      setStatusMessage(`${playerName} left the room.`);
      setTimeout(() => setStatusMessage(''), 3000);
    });

    socket.on('update_players', (playerList) => {
      setPlayers(playerList || []);
      const me = (playerList || []).find(p => p.id === socket.id);
      if (me?.isHost || playerList?.length === 1) setIsHost(true);
    });

    socket.on('host_changed', ({ hostId, hostName }) => {
      setIsHost(socket.id === hostId);
      setStatusMessage(`👑 ${hostName} is now the host!`);
      setTimeout(() => setStatusMessage(''), 4000);
    });

    socket.on('settings_updated', (updatedSettings) => {
      setRoomSettings(updatedSettings);
    });

    socket.on('round_start', ({ round, maxRounds, drawerId, drawerName, drawTime, status, wordOptions }) => {
      setGamePhase('CHOOSING');
      if (round) setCurrentRound(round);
      if (maxRounds) setMaxRounds(maxRounds);
      setDrawerId(drawerId);
      setDrawerName(drawerName);
      if (drawTime) setTimeLeft(drawTime);
      setSecretWord('');
      setWordHint('');
      setRoundEndData(null);
      setStatusMessage(status || `${drawerName} is choosing a word...`);

      if (wordOptions && drawerId === socket.id) {
        setWordChoices(wordOptions);
        setChooseTime(15);
      }
    });

    socket.on('word_options', ({ words, timeLimit }) => {
      setWordChoices(words);
      setChooseTime(timeLimit || 15);
    });

    socket.on('choose_time_update', (time) => {
      setChooseTime(time);
    });

    socket.on('word_chosen', ({ word, wordHint }) => {
      if (word) setSecretWord(word);
      if (wordHint) setWordHint(wordHint);
      setWordChoices([]);
      setGamePhase('DRAWING');
    });

    socket.on('game_state', ({ status, phase, round, maxRounds, drawerId, drawerName, wordHint, secretWord: stateWord, timeLeft }) => {
      const validPhases = ['WAITING', 'CHOOSING', 'DRAWING', 'ROUND_END', 'GAME_OVER'];
      if (validPhases.includes(phase)) setGamePhase(phase);
      else if (validPhases.includes(status)) setGamePhase(status);

      if (round) setCurrentRound(round);
      if (maxRounds) setMaxRounds(maxRounds);
      if (drawerId) setDrawerId(drawerId);
      if (drawerName) setDrawerName(drawerName);
      if (stateWord) setSecretWord(stateWord);
      if (wordHint !== undefined) setWordHint(wordHint);
      if (timeLeft !== undefined) setTimeLeft(timeLeft);
    });

    socket.on('hint_update', ({ wordHint }) => {
      setWordHint(wordHint);
    });

    socket.on('timer_update', (time) => {
      setTimeLeft(time);
    });

    socket.on('round_end', (data) => {
      setGamePhase('ROUND_END');
      setRoundEndData(data);
      setWordChoices([]);
      if (data.players) setPlayers(data.players);
    });

    socket.on('game_over', (data) => {
      setGamePhase('GAME_OVER');
      setGameOverData(data);
      setRoundEndData(null);
    });

    socket.on('game_reset', ({ players, settings }) => {
      setGamePhase('WAITING');
      setPlayers(players || []);
      setGameOverData(null);
      setRoundEndData(null);
      setWordChoices([]);
      setSecretWord('');
      setWordHint('');
      if (settings) setRoomSettings(settings);
    });

    socket.on('kicked_from_room', ({ reason }) => {
      alert(reason || 'You have been removed from the room.');
      navigate('/');
    });

    socket.on('error_message', ({ message }) => {
      setErrorMessage(message);
      setTimeout(() => setErrorMessage(''), 4000);
    });

    if (socket.connected) {
      sendJoin();
    } else {
      socket.connect();
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('join_success', handleJoinSuccess);
      socket.off('room_created', handleJoinSuccess);
      socket.off('player_joined');
      socket.off('player_left');
      socket.off('update_players');
      socket.off('host_changed');
      socket.off('settings_updated');
      socket.off('round_start');
      socket.off('word_options');
      socket.off('choose_time_update');
      socket.off('word_chosen');
      socket.off('game_state');
      socket.off('hint_update');
      socket.off('timer_update');
      socket.off('round_end');
      socket.off('game_over');
      socket.off('game_reset');
      socket.off('kicked_from_room');
      socket.off('error_message');
    };
  }, [socket, roomId, username, avatar, isCreator, initialSettings, initialSpectator, navigate]);

  // Actions
  const handleStartGame = () => {
    if (!socket.connected) {
      socket.connect();
    }
    socket.emit('start_game', { roomId });
  };

  const handleToggleReady = () => {
    socket.emit('toggle_ready');
  };

  const handleToggleSpectator = () => {
    socket.emit('toggle_spectator');
  };

  const handleSelectWord = (word) => {
    socket.emit('word_chosen', { word, roomId });
    socket.emit('select_word', { roomId, word });
    setSecretWord(word);
    setWordChoices([]);
    setGamePhase('DRAWING');
  };

  const handlePlayAgain = () => {
    socket.emit('play_again');
  };

  const handleReplay = () => {
    socket.emit('get_round_replay');
  };

  // Safe clipboard helper for HTTP / LAN IP connections
  const copyInviteLink = () => {
    const inviteUrl = `${window.location.origin}/game/${roomId}`;

    const fallbackCopy = (text) => {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2500);
      } catch (err) {
        console.error('Copy fallback failed:', err);
      }
      document.body.removeChild(textArea);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inviteUrl)
        .then(() => {
          setCopiedLink(true);
          setTimeout(() => setCopiedLink(false), 2500);
        })
        .catch(() => fallbackCopy(inviteUrl));
    } else {
      fallbackCopy(inviteUrl);
    }
  };

  return (
    <div className="game-screen-wrapper">
      {/* Top Header Bar */}
      <header className="game-navbar">
        <div className="nav-brand" onClick={() => navigate('/')} title="Back to Lobby">
          <span className="brand-logo">skribbl</span><span className="brand-dot">.io</span>
        </div>

        <div className="nav-room-info">
          <span className="room-badge">Room: <strong>{roomId}</strong></span>
          <button type="button" className="copy-link-btn" onClick={copyInviteLink}>
            {copiedLink ? '✅ Link Copied!' : '📋 Copy Invite'}
          </button>
          {!isConnected && (
            <span className="conn-status-pill offline" title="Reconnecting to server...">
              🔴 Connecting...
            </span>
          )}
        </div>

        {gamePhase !== 'WAITING' && (
          <div className="round-badge">
            Round {currentRound} of {maxRounds}
          </div>
        )}

        {/* Word Display / Hint Header */}
        <div className="nav-word-hint">
          {isMyTurn ? (
            <div className="word-drawer-view">
              <span className="word-label">DRAW THIS: </span>
              <span className="word-secret">
                {secretWord ? secretWord.toUpperCase() : 'CHOOSING A WORD...'}
              </span>
            </div>
          ) : wordHint ? (
            <div className="word-guesser-view">
              <span className="word-hint-text">{formatHintDisplay(wordHint)}</span>
              {roomSettings.wordMode !== 'hidden' && (
                <span className="word-length-hint">
                  ({wordHint.replace(/\s/g, '').length} letters)
                </span>
              )}
            </div>
          ) : (
            <div className="phase-indicator-text">
              {statusMessage || (gamePhase === 'CHOOSING' ? `${drawerName} is choosing...` : 'Waiting for round')}
            </div>
          )}
        </div>

        {/* Countdown Timer */}
        <div className={`nav-timer ${timeLeft <= 15 && gamePhase === 'DRAWING' ? 'timer-urgent' : ''}`}>
          <span className="timer-icon">⏱️</span>
          <span className="timer-val">{timeLeft}s</span>
        </div>
      </header>

      {/* Error or Notification Alert */}
      {errorMessage && (
        <div className="global-error-banner">
          ⚠️ {errorMessage}
        </div>
      )}

      {/* Main Game Arena */}
      <div className="game-arena-grid">
        <Leaderboard
          players={displayPlayers}
          currentDrawerId={drawerId}
          isHost={isHost}
          currentUserId={currentUserId}
          socket={socket}
        />

        <div className="canvas-column">
          {/* Waiting Room Overlay if game has not started */}
          {gamePhase === 'WAITING' ? (
            <div className="lobby-waiting-overlay">
              <div className="waiting-card">
                <h2>Game Lobby</h2>
                <p className="waiting-subtitle">
                  Share Room Code <strong>{roomId}</strong> with friends to join!
                </p>

                <div className="lobby-players-grid">
                  {displayPlayers.map((p) => (
                    <div key={p.id} className={`lobby-player-bubble ${p.isReady ? 'ready-glow' : ''}`}>
                      <Avatar avatar={p.avatar} size={54} />
                      <span className="lobby-player-name">
                        {p.username} {p.isHost && '👑'} {p.isSpectator && '👁️'}
                      </span>
                      <span className={`ready-badge-pill ${p.isReady ? 'ready' : 'waiting'}`}>
                        {p.isReady ? '✓ Ready' : '⏳ Waiting'}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="lobby-settings-summary">
                  <span>⏱️ Draw Time: <strong>{roomSettings.drawTime}s</strong></span>
                  <span>🔄 Rounds: <strong>{roomSettings.rounds}</strong></span>
                  <span>🔤 Category: <strong>{roomSettings.wordCategory}</strong></span>
                  <span>🌐 Lang: <strong>{(roomSettings.language || 'en').toUpperCase()}</strong></span>
                  <span>💡 Hints: <strong>{roomSettings.hints}</strong></span>
                  <span>🧩 Mode: <strong>{roomSettings.wordMode}</strong></span>
                </div>

                {/* Player Lobby Controls: Ready-up & Spectator Mode */}
                <div className="lobby-user-controls">
                  <button
                    type="button"
                    className={`ready-toggle-btn ${isMyReady ? 'is-ready' : ''}`}
                    onClick={handleToggleReady}
                  >
                    {isMyReady ? '✅ You are Ready!' : '⌛ Click to Ready Up'}
                  </button>

                  <button
                    type="button"
                    className={`spectator-toggle-btn ${isMySpectator ? 'is-spectating' : ''}`}
                    onClick={handleToggleSpectator}
                    title="Toggle spectator mode"
                  >
                    {isMySpectator ? '👁️ Spectating (Active)' : '👁️ Switch to Spectator'}
                  </button>
                </div>

                {isHost || players.length <= 1 ? (
                  <div className="lobby-actions-group">
                    <button 
                      type="button" 
                      className="start-game-btn" 
                      onClick={handleStartGame}
                    >
                      ▶️ Start Game ({players.length} Player{players.length !== 1 ? 's' : ''})
                    </button>
                    <button
                      type="button"
                      className="open-tab-btn"
                      onClick={() => {
                        const guestNum = Math.floor(100 + Math.random() * 900);
                        window.open(`/game/${roomId}?name=Guest_${guestNum}`, '_blank');
                      }}
                      title="Open a 2nd player window to test multiplayer guessing"
                    >
                      👥 Open 2nd Player Window
                    </button>
                  </div>
                ) : (
                  <div className="guest-actions-group">
                    <p className="host-wait-msg">⏳ Waiting for room host to start the game...</p>
                    <button
                      type="button"
                      className="claim-host-btn"
                      onClick={handleStartGame}
                    >
                      Start Game
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <Canvas
              socket={socket}
              roomId={roomId}
              isDrawer={isMyTurn}
              canDraw={gamePhase === 'DRAWING' || gamePhase === 'CHOOSING' || isMyTurn}
            />
          )}
        </div>

        <Chat
          socket={socket}
          roomId={roomId}
          username={username}
          isDrawer={isMyTurn}
          hasGuessed={hasGuessed}
          gameStatus={gamePhase}
        />
      </div>

      {/* Word Selection Modal for Drawer */}
      {isMyTurn && gamePhase === 'CHOOSING' && wordChoices.length > 0 && (
        <div className="modal-overlay">
          <div className="word-select-dialog">
            <h3>Choose a Word to Draw</h3>
            <p className="choose-timer-text">Auto-selecting in {chooseTime}s</p>
            <div className="word-buttons-row">
              {wordChoices.map((word) => (
                <button
                  key={word}
                  type="button"
                  className="word-choice-btn"
                  onClick={() => handleSelectWord(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Round End Recap Modal with Replay Feature */}
      {gamePhase === 'ROUND_END' && roundEndData && (
        <div className="round-end-overlay">
          <div className="round-end-card">
            <h2>Round Finished!</h2>
            <p className="round-reason">{roundEndData.reason}</p>
            <div className="revealed-word-box">
              <span>The secret word was:</span>
              <strong className="revealed-word">{roundEndData.word?.toUpperCase()}</strong>
            </div>

            {roundEndData.nextDrawer && (
              <p className="next-drawer-preview">Next Drawer: <strong>{roundEndData.nextDrawer}</strong></p>
            )}

            {roundEndData.hasReplay && (
              <button type="button" className="replay-btn" onClick={handleReplay}>
                🎬 Watch Drawing Replay
              </button>
            )}

            <p className="next-round-countdown">Next turn starting soon...</p>
          </div>
        </div>
      )}

      {/* Game Over / Victory Podium Modal */}
      {gamePhase === 'GAME_OVER' && gameOverData && (
        <div className="modal-overlay">
          <div className="game-over-dialog">
            <h1 className="game-over-title">🏆 Game Finished!</h1>
            <p className="game-over-subtitle">
              Winner: <strong>{gameOverData.winner?.username || 'No one'}</strong> with {gameOverData.winner?.score || 0} points!
            </p>

            <div className="podium-section">
              {gameOverData.leaderboard?.slice(0, 3).map((player, idx) => (
                <div key={player.id} className={`podium-card rank-${idx + 1}`}>
                  <div className="podium-rank-icon">
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                  </div>
                  <Avatar avatar={player.avatar} size={48} />
                  <span className="podium-name">{player.username}</span>
                  <span className="podium-score">{player.score} pts</span>
                </div>
              ))}
            </div>

            <div className="game-over-actions">
              {isHost ? (
                <button type="button" className="play-again-btn" onClick={handlePlayAgain}>
                  🔄 Play Again
                </button>
              ) : (
                <span className="waiting-host-again">Waiting for host to restart...</span>
              )}
              <button type="button" className="leave-game-btn" onClick={() => navigate('/')}>
                🚪 Back to Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Game;