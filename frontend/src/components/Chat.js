import React, { useState, useEffect, useRef } from 'react';

function Chat({ socket, roomId, username, isDrawer, hasGuessed, gameStatus }) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageList, setMessageList] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // Unified message handler with strict deduplication
    const handleIncomingMessage = (data) => {
      if (!data) return;

      const author = data.author || data.playerName || 'System';
      const text = data.message || data.text || '';
      const isSystem = data.isSystem || data.playerId === 'system' || author === 'System';

      if (!text) return;

      setMessageList((prevList) => {
        const last = prevList[prevList.length - 1];
        // Deduplicate if identical to the previous message
        if (last && last.author === author && last.message === text) {
          return prevList;
        }
        return [
          ...prevList,
          {
            author,
            message: text,
            isSystem,
            isCorrectGuess: data.isCorrectGuess || data.correct,
            isClose: data.isClose,
            alreadyGuessed: data.alreadyGuessed,
          },
        ];
      });
    };

    socket.on('receive_message', handleIncomingMessage);
    socket.on('chat_message', handleIncomingMessage);

    return () => {
      socket.off('receive_message', handleIncomingMessage);
      socket.off('chat_message', handleIncomingMessage);
    };
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const sendMessage = (e) => {
    e.preventDefault();
    const trimmed = currentMessage.trim();
    if (!trimmed) return;

    // Emit 'guess' when guessing active word, otherwise emit standard 'chat'
    if (gameStatus === 'DRAWING' && !isDrawer && !hasGuessed) {
      socket.emit('guess', { roomId, text: trimmed, author: username });
    } else {
      socket.emit('chat', { roomId, text: trimmed, author: username });
    }

    // Single backward-compatible emission
    socket.emit('send_message', {
      roomId,
      author: username,
      message: trimmed,
      text: trimmed,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });

    setCurrentMessage('');
  };

  const isDrawingTurn = isDrawer && gameStatus === 'DRAWING';
  let inputPlaceholder = 'Type your guess here...';
  if (isDrawingTurn) {
    inputPlaceholder = 'You are drawing! Chat with others...';
  } else if (hasGuessed && gameStatus === 'DRAWING') {
    inputPlaceholder = 'You guessed it! Chat with others who guessed...';
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
            <div
              key={index}
              className={`message user-message ${guessedClass} ${isSelf ? 'self-msg' : ''}`}
            >
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