import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import io from 'socket.io-client';
import Lobby from './pages/Lobby';
import Game from './pages/Game';
import './App.css';

// Automatically detect the backend server URL across local IP, localhost, or production env
const getBackendUrl = () => {
  if (process.env.REACT_APP_BACKEND_URL) {
    return process.env.REACT_APP_BACKEND_URL;
  }
  
  const { protocol, hostname, port } = window.location;
  
  // If served directly from the backend server on port 5000
  if (port === '5000') {
    return window.location.origin;
  }
  
  // Development mode: auto-target backend on port 5000
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.startsWith('172.')
  ) {
    return `${protocol}//${hostname}:5000`;
  }

  // Production fallback
  return window.location.origin;
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