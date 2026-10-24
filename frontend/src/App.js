import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { io } from 'socket.io-client';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import './App.css';

// Automatically detect the backend server URL or default to your live Render backend
const getBackendUrl = () => {
  const envUrl = process.env.REACT_APP_BACKEND_URL;
  if (envUrl && !envUrl.includes('your-backend-app')) {
    return envUrl;
  }
  return 'https://skribbl-backend-vy86.onrender.com';
};

const SERVER_URL = getBackendUrl();
console.log('[Skribbl Client] Connecting to backend at:', SERVER_URL);

// Production-ready Socket.IO client instance
const socket = io(SERVER_URL, {
  transports: ['websocket', 'polling'],
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
});

function App() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<Lobby socket={socket} />} />
          <Route path="/game/:roomId" element={<Game socket={socket} />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;