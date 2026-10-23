import React, { useState, useEffect, useRef } from 'react';

function Chat({ socket, roomId, username, isDrawer, hasGuessed, gameStatus }) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageList, setMessageList] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // 1. Listen for standard receive_message
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
    };

    // 2. Listen for PDF spec event: chat_message { playerId, playerName, text }
    const handleChatMessage = (data) => {
      // Avoid duplicate display if already handled via receive_message
      // Only add if not duplicate
      if (data && data.text) {
        setMessageList((list) => {
          const last = list[list.length - 1];
          if (last && last.author === data.playerName && last.message === data.text) {
            return list;
          }
          return [...list, {
            author: data.playerName,
            message: data.text,
            isSystem: data.playerId === 'system',
            alreadyGuessed: data.alreadyGuessed
          }];
        });
      }
    };

    // 3. Listen for PDF spec event: guess_result { correct, playerId, playerName, points }
    const handleGuessResult = (data) => {
      if (data && data.correct) {
        // Shown via system message
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('chat_message', handleChatMessage);
    socket.on('guess_result', handleGuessResult);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('chat_message', handleChatMessage);
      socket.off('guess_result', handleGuessResult);
    };
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const sendMessage = (e) => {
    e.preventDefault();
    const trimmed = currentMessage.trim();
    if (!trimmed) return;

    // Emit PDF spec events: guess or chat
    if (gameStatus === 'DRAWING' && !isDrawer && !hasGuessed) {
      socket.emit('guess', { text: trimmed });
    } else {
      socket.emit('chat', { text: trimmed });
    }

    // Also emit backward-compatible send_message
    const messageData = {
      roomId,
      author: username,
      message: trimmed,
      text: trimmed,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    socket.emit('send_message', messageData);

    setCurrentMessage('');
  };

  const isDrawingTurn = isDrawer && gameStatus === 'DRAWING';
  let inputPlaceholder = "Type your guess here...";
  if (isDrawingTurn) {
    inputPlaceholder = "You are drawing! Chat with others...";
  } else if (hasGuessed && gameStatus === 'DRAWING') {
    inputPlaceholder = "You guessed it! Chat with others who guessed...";
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <span>💬 Room Chat & Guesses</span>
      </div>

      <div className="chat-messages">
        {messageList.map((msg, index) => {
          if (msg.isSystem) {
            let sysClass = 'system-message';
            if (msg.isCorrectGuess) sysClass += ' correct-guess-msg';
            if (msg.isClose) sysClass += ' close-guess-msg';

            return (
              <div key={index} className={`message ${sysClass}`}>
                {msg.message}
              </div>
            );
          }

          const isSelf = msg.author === username;
          const guessedClass = msg.alreadyGuessed ? 'guessed-chat' : '';

          return (
            <div key={index} className={`message user-message ${guessedClass} ${isSelf ? 'self-msg' : ''}`}>
              <strong className="msg-author">{msg.author}: </strong>
              <span className="msg-content">{msg.message}</span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={sendMessage} className="chat-input-form">
        <input
          type="text"
          value={currentMessage}
          placeholder={inputPlaceholder}
          onChange={(e) => setCurrentMessage(e.target.value)}
          maxLength={100}
        />
        <button type="submit" disabled={!currentMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default Chat;