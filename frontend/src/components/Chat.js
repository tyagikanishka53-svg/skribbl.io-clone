import React, { useState, useEffect, useRef } from 'react';

function Chat({ socket, roomId, username, isDrawer, hasGuessed, gameStatus }) {
  const [currentMessage, setCurrentMessage] = useState('');
  const [messageList, setMessageList] = useState([]);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
    };

    socket.on('receive_message', handleReceiveMessage);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
    };
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const sendMessage = (e) => {
    e.preventDefault();
    const trimmed = currentMessage.trim();
    if (!trimmed) return;

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
    inputPlaceholder = "You are drawing! Don't spoil the word!";
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
          disabled={isDrawingTurn}
          onChange={(e) => setCurrentMessage(e.target.value)}
          maxLength={100}
        />
        <button type="submit" disabled={isDrawingTurn || !currentMessage.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

export default Chat;