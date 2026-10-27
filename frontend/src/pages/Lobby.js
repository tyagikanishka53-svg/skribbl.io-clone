import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Avatar, { AVATAR_COLORS } from '../components/Avatar';

function Lobby({ socket }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const urlRoomCode = searchParams.get('room') || '';

  // Player profile state (persisted in localStorage)
  const [username, setUsername] = useState(
    localStorage.getItem('skribbl_username') || `Player${Math.floor(1000 + Math.random() * 9000)}`
  );

  // Avatar state (restored from localStorage if available)
  const [avatar, setAvatar] = useState(() => {
    const savedAvatar = localStorage.getItem('skribbl_avatar');
    if (savedAvatar) {
      try {
        return JSON.parse(savedAvatar);
      } catch (e) {
        // Fallback to random avatar if parse fails
      }
    }
    return {
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      eyes: 0,
      mouth: 0
    };
  });

  const [roomIdInput, setRoomIdInput] = useState(urlRoomCode);
  const [isSpectator, setIsSpectator] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [publicRooms, setPublicRooms] = useState([]);
  const [statusError, setStatusError] = useState('');

  // Host configuration settings
  const [settings, setSettings] = useState({
    maxPlayers: 8,
    rounds: 3,
    drawTime: 60,
    wordCount: 3,
    hints: 2,
    wordCategory: 'all',
    wordMode: 'normal', // 'normal' | 'hidden' | 'combination'
    language: 'en', // 'en' | 'es' | 'de' | 'fr'
    customWords: '',
    isPrivate: false
  });

  useEffect(() => {
    // Request public rooms list
    socket.emit('get_public_rooms');

    const handlePublicRooms = (list) => {
      setPublicRooms(list);
    };

    const handleErrorMessage = ({ message }) => {
      setStatusError(message);
    };

    socket.on('public_rooms_list', handlePublicRooms);
    socket.on('error_message', handleErrorMessage);

    // Refresh public rooms every 5 seconds
    const interval = setInterval(() => {
      socket.emit('get_public_rooms');
    }, 5000);

    return () => {
      clearInterval(interval);
      socket.off('public_rooms_list', handlePublicRooms);
      socket.off('error_message', handleErrorMessage);
    };
  }, [socket]);

  // Avatar customizers
  const nextColor = () => {
    const currentIdx = AVATAR_COLORS.indexOf(avatar.color);
    const nextIdx = (currentIdx + 1) % AVATAR_COLORS.length;
    setAvatar({ ...avatar, color: AVATAR_COLORS[nextIdx] });
  };

  const nextEyes = () => {
    setAvatar({ ...avatar, eyes: (avatar.eyes + 1) % 4 });
  };

  const nextMouth = () => {
    setAvatar({ ...avatar, mouth: (avatar.mouth + 1) % 4 });
  };

  // Helper function to save profile & session details before navigating
  const saveSession = (targetRoomId) => {
    const cleanName = username.trim();
    localStorage.setItem('skribbl_username', cleanName);
    localStorage.setItem('skribbl_playerName', cleanName);
    if (targetRoomId) {
      localStorage.setItem('skribbl_roomId', targetRoomId);
    }
    localStorage.setItem('skribbl_avatar', JSON.stringify(avatar));
  };

  // Join Room by Code or Direct
  const handleJoinByCode = (targetCode) => {
    const code = (targetCode || roomIdInput).trim().toUpperCase();
    if (!username.trim()) {
      setStatusError('Please enter a username');
      return;
    }
    if (!code) {
      setStatusError('Please enter a Room Code');
      return;
    }
    saveSession(code);
    navigate(`/game/${code}`, { state: { username, avatar, isSpectator } });
  };

  // Quick Play / Join Random Public Room
  const handleQuickPlay = () => {
    if (!username.trim()) {
      setStatusError('Please enter a username');
      return;
    }

    if (publicRooms.length > 0) {
      // Pick first room with open spots
      const openRoom = publicRooms.find(r => r.playerCount < r.maxPlayers && r.status === 'WAITING');
      if (openRoom) {
        saveSession(openRoom.roomId);
        navigate(`/game/${openRoom.roomId}`, { state: { username, avatar, isSpectator } });
        return;
      }
    }

    // Otherwise create a quick public room
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    saveSession(randomCode);
    navigate(`/game/${randomCode}`, { state: { username, avatar, isSpectator, initialSettings: { isPrivate: false } } });
  };

  // Create Custom Room
  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setStatusError('Please enter a username');
      return;
    }

    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    saveSession(randomCode);

    navigate(`/game/${randomCode}`, {
      state: {
        username,
        avatar,
        isSpectator,
        initialSettings: settings,
        isCreator: true
      }
    });
  };

  return (
    <div className="lobby-page">
      <div className="lobby-card">
        <header className="lobby-header">
          <h1 className="logo-text">
            <span>skribbl</span><span className="logo-accent">.io</span>
          </h1>
          <p className="logo-tagline">Multiplayer Drawing & Guessing Game</p>
        </header>

        {statusError && (
          <div className="error-banner" onClick={() => setStatusError('')}>
            ⚠️ {statusError} <span className="close-err">✕</span>
          </div>
        )}

        <div className="profile-section">
          <div className="avatar-preview-box">
            <Avatar avatar={avatar} size={84} />
            <div className="avatar-controls">
              <button type="button" onClick={nextColor} title="Change Color">🎨 Color</button>
              <button type="button" onClick={nextEyes} title="Change Eyes">👀 Eyes</button>
              <button type="button" onClick={nextMouth} title="Change Mouth">👄 Mouth</button>
            </div>
          </div>

          <div className="name-input-group">
            <label>Your Nickname:</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={16}
              required
            />
            <label className="spectator-toggle-label">
              <input
                type="checkbox"
                checked={isSpectator}
                onChange={(e) => setIsSpectator(e.target.checked)}
              />
              <span>👁️ Spectator Mode (Watch without playing)</span>
            </label>
          </div>
        </div>

        <div className="action-buttons-group">
          <button type="button" className="main-btn play-btn" onClick={handleQuickPlay}>
             Play Now (Quick Join)
          </button>

          <button 
            type="button" 
            className="main-btn create-btn" 
            onClick={() => setShowCreateModal(true)}
          >
            ⚙️ Create Private / Custom Room
          </button>
        </div>

        <div className="join-code-row">
          <input
            type="text"
            placeholder="Enter Room Code (e.g. AB12CD)"
            value={roomIdInput}
            onChange={(e) => setRoomIdInput(e.target.value.toUpperCase())}
            maxLength={10}
          />
          <button type="button" className="join-btn" onClick={() => handleJoinByCode()}>
            Join Room
          </button>
        </div>

        {/* Public Rooms List */}
        <div className="public-rooms-section">
          <h3>Open Public Rooms ({publicRooms.length})</h3>
          {publicRooms.length === 0 ? (
            <p className="no-rooms-hint">No active public rooms right now. Create one!</p>
          ) : (
            <div className="rooms-table-wrapper">
              <table className="rooms-table">
                <thead>
                  <tr>
                    <th>Room Code</th>
                    <th>Players</th>
                    <th>Category</th>
                    <th>Lang / Mode</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {publicRooms.map((room) => (
                    <tr key={room.roomId}>
                      <td><strong>{room.roomId}</strong></td>
                      <td>{room.playerCount} / {room.maxPlayers}</td>
                      <td>{room.category}</td>
                      <td>{(room.language || 'en').toUpperCase()} · {room.wordMode || 'normal'}</td>
                      <td>
                        <button
                          type="button"
                          className="table-join-btn"
                          disabled={room.playerCount >= room.maxPlayers}
                          onClick={() => handleJoinByCode(room.roomId)}
                        >
                          {room.playerCount >= room.maxPlayers ? 'Full' : 'Join'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Room Settings</h2>
              <button 
                type="button" 
                className="close-modal-btn" 
                onClick={() => setShowCreateModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="settings-form">
              <div className="setting-row">
                <label>Players (2–20):</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={settings.maxPlayers}
                  onChange={(e) => setSettings({ ...settings, maxPlayers: parseInt(e.target.value) || 8 })}
                />
              </div>

              <div className="setting-row">
                <label>Draw Time (15–240 sec):</label>
                <select
                  value={settings.drawTime}
                  onChange={(e) => setSettings({ ...settings, drawTime: parseInt(e.target.value) })}
                >
                  <option value={15}>15 seconds</option>
                  <option value={30}>30 seconds</option>
                  <option value={45}>45 seconds</option>
                  <option value={60}>60 seconds (Standard)</option>
                  <option value={80}>80 seconds</option>
                  <option value={100}>100 seconds</option>
                  <option value={120}>120 seconds</option>
                  <option value={180}>180 seconds</option>
                  <option value={240}>240 seconds</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Rounds (2–10):</label>
                <select
                  value={settings.rounds}
                  onChange={(e) => setSettings({ ...settings, rounds: parseInt(e.target.value) })}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => (
                    <option key={r} value={r}>{r} Rounds</option>
                  ))}
                </select>
              </div>

              <div className="setting-row">
                <label>Word Choices (1–5):</label>
                <select
                  value={settings.wordCount}
                  onChange={(e) => setSettings({ ...settings, wordCount: parseInt(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5].map(c => (
                    <option key={c} value={c}>{c} words</option>
                  ))}
                </select>
              </div>

              <div className="setting-row">
                <label>Hints:</label>
                <select
                  value={settings.hints}
                  onChange={(e) => setSettings({ ...settings, hints: parseInt(e.target.value) })}
                >
                  <option value={0}>0 (Disabled)</option>
                  <option value={1}>1 hint</option>
                  <option value={2}>2 hints (Standard)</option>
                  <option value={3}>3 hints</option>
                  <option value={4}>4 hints</option>
                  <option value={5}>5 hints</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Word Category:</label>
                <select
                  value={settings.wordCategory}
                  onChange={(e) => setSettings({ ...settings, wordCategory: e.target.value })}
                >
                  <option value="all">All Words (Mixed)</option>
                  <option value="animals">Animals</option>
                  <option value="food">Food & Drinks</option>
                  <option value="objects">Everyday Objects</option>
                  <option value="actions">Actions & Verbs</option>
                  <option value="nature">Nature & Places</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Word Mode:</label>
                <select
                  value={settings.wordMode}
                  onChange={(e) => setSettings({ ...settings, wordMode: e.target.value })}
                >
                  <option value="normal">Normal (reveals letters & length)</option>
                  <option value="hidden">Hidden (no length or hints shown)</option>
                  <option value="combination">Combination (2-word phrases e.g. "flying car")</option>
                </select>
              </div>

              <div className="setting-row">
                <label>Language:</label>
                <select
                  value={settings.language}
                  onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                >
                  <option value="en">English 🇬🇧</option>
                  <option value="es">Español 🇪🇸</option>
                  <option value="de">Deutsch 🇩🇪</option>
                  <option value="fr">Français 🇫🇷</option>
                </select>
              </div>

              <div className="setting-row full-width">
                <label>Custom Words (comma-separated, optional):</label>
                <textarea
                  rows="2"
                  placeholder="e.g. pikachu, microwave, matrix, sushi"
                  value={settings.customWords}
                  onChange={(e) => setSettings({ ...settings, customWords: e.target.value })}
                />
              </div>

              <div className="setting-row checkbox-row">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.isPrivate}
                    onChange={(e) => setSettings({ ...settings, isPrivate: e.target.checked })}
                  />
                  <span>Private Room (invite-only via link or code)</span>
                </label>
              </div>

              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="confirm-create-btn">
                  Create Room & Start Lobby
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Lobby;