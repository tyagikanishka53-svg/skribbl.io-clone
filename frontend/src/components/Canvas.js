import React, { useEffect, useRef, useState, useCallback } from 'react';
import Toolbox from './Toolbox';

// Fast flood fill implementation on HTML5 Canvas
function floodFill(ctx, startX, startY, fillHex, width = 800, height = 500) {
  startX = Math.floor(startX);
  startY = Math.floor(startY);
  if (startX < 0 || startX >= width || startY < 0 || startY >= height) return;

  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  // parse hex to rgba
  let hex = (fillHex || '#000000').replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const fillR = parseInt(hex.substring(0, 2), 16) || 0;
  const fillG = parseInt(hex.substring(2, 4), 16) || 0;
  const fillB = parseInt(hex.substring(4, 6), 16) || 0;
  const fillA = 255;

  const startIdx = (startY * width + startX) * 4;
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  // Already the target color
  if (
    Math.abs(startR - fillR) < 10 &&
    Math.abs(startG - fillG) < 10 &&
    Math.abs(startB - fillB) < 10 &&
    Math.abs(startA - fillA) < 10
  ) {
    return;
  }

  const matchTarget = (idx) => {
    return (
      Math.abs(data[idx] - startR) < 30 &&
      Math.abs(data[idx + 1] - startG) < 30 &&
      Math.abs(data[idx + 2] - startB) < 30 &&
      Math.abs(data[idx + 3] - startA) < 30
    );
  };

  const stack = [startX, startY];
  const visited = new Uint8Array(width * height);
  visited[startY * width + startX] = 1;

  while (stack.length > 0) {
    const cy = stack.pop();
    const cx = stack.pop();
    const idx = (cy * width + cx) * 4;

    data[idx] = fillR;
    data[idx + 1] = fillG;
    data[idx + 2] = fillB;
    data[idx + 3] = fillA;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1],
    ];

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0];
      const ny = neighbors[i][1];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPos = ny * width + nx;
        if (!visited[nPos]) {
          visited[nPos] = 1;
          const nIdx = nPos * 4;
          if (matchTarget(nIdx)) {
            stack.push(nx, ny);
          }
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function Canvas({ socket, roomId, isDrawer, canDraw = true }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawingRef = useRef(false);
  const lastEmitRef = useRef(0); // Ref for throttling socket event emission

  // Toolbox State
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(7);
  const [activeTool, setActiveTool] = useState('brush'); // 'brush' | 'fill' | 'eraser'
  const [isReplaying, setIsReplaying] = useState(false);
  const replayTimerRef = useRef(null);

  // Re-draw all strokes from history
  const redrawCanvas = useCallback((strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Fill canvas with white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!strokes || strokes.length === 0) return;

    strokes.forEach((stroke) => {
      if (stroke.type === 'fill') {
        floodFill(ctx, stroke.x, stroke.y, stroke.color, canvas.width, canvas.height);
        return;
      }

      if (!stroke.points || stroke.points.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? '#ffffff' : stroke.color || '#000000';
      ctx.lineWidth = stroke.size || 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const firstPoint = stroke.points[0];
      ctx.moveTo(firstPoint.x, firstPoint.y);

      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, []);

  // Replay animation function
  const playReplayAnimation = useCallback((strokes) => {
    const canvas = canvasRef.current;
    if (!canvas || !strokes || strokes.length === 0) return;

    setIsReplaying(true);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let strokeIndex = 0;
    let pointIndex = 0;

    if (replayTimerRef.current) {
      clearInterval(replayTimerRef.current);
    }

    replayTimerRef.current = setInterval(() => {
      if (strokeIndex >= strokes.length) {
        clearInterval(replayTimerRef.current);
        replayTimerRef.current = null;
        setIsReplaying(false);
        return;
      }

      const stroke = strokes[strokeIndex];

      if (stroke.type === 'fill') {
        floodFill(ctx, stroke.x, stroke.y, stroke.color, canvas.width, canvas.height);
        strokeIndex++;
        pointIndex = 0;
        return;
      }

      if (!stroke.points || stroke.points.length === 0) {
        strokeIndex++;
        pointIndex = 0;
        return;
      }

      ctx.strokeStyle = stroke.isEraser ? '#ffffff' : stroke.color || '#000000';
      ctx.lineWidth = stroke.size || 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (pointIndex === 0) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      }

      pointIndex += 2;
      if (pointIndex < stroke.points.length) {
        ctx.lineTo(stroke.points[pointIndex].x, stroke.points[pointIndex].y);
        ctx.stroke();
      } else {
        if (stroke.points.length > 1) {
          const last = stroke.points[stroke.points.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
        ctx.closePath();
        strokeIndex++;
        pointIndex = 0;
      }
    }, 25);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Fixed virtual canvas resolution for consistent cross-device coordinates
    canvas.width = 800;
    canvas.height = 500;

    const context = canvas.getContext('2d');
    context.lineCap = 'round';
    context.lineJoin = 'round';
    contextRef.current = context;

    // Initialize with white background
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (!socket) return;

    // Socket listeners for incoming drawing data from other players
    const handleDrawStart = (data) => {
      if (!contextRef.current) return;
      contextRef.current.strokeStyle = data.isEraser ? '#ffffff' : data.color;
      contextRef.current.lineWidth = data.size;
      contextRef.current.beginPath();
      contextRef.current.moveTo(data.x, data.y);
    };

    const handleDrawMove = (data) => {
      if (!contextRef.current) return;
      contextRef.current.lineTo(data.x, data.y);
      contextRef.current.stroke();
    };

    const handleDrawEnd = () => {
      if (!contextRef.current) return;
      contextRef.current.closePath();
    };

    const handleDrawFill = (data) => {
      if (!contextRef.current || !canvasRef.current) return;
      floodFill(contextRef.current, data.x, data.y, data.color, canvasRef.current.width, canvasRef.current.height);
    };

    const handleDrawData = (data) => {
      if (!contextRef.current) return;
      if (data.type === 'start') {
        contextRef.current.strokeStyle = data.isEraser ? '#ffffff' : data.color;
        contextRef.current.lineWidth = data.size;
        contextRef.current.beginPath();
        contextRef.current.moveTo(data.x, data.y);
      } else if (data.type === 'move') {
        contextRef.current.lineTo(data.x, data.y);
        contextRef.current.stroke();
      } else if (data.type === 'end') {
        contextRef.current.closePath();
      } else if (data.type === 'fill') {
        floodFill(contextRef.current, data.x, data.y, data.color, canvasRef.current.width, canvasRef.current.height);
      }
    };

    const handleClearCanvas = () => {
      if (!contextRef.current || !canvasRef.current) return;
      contextRef.current.fillStyle = '#ffffff';
      contextRef.current.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    };

    const handleCanvasSync = (data) => {
      if (data && data.strokes) {
        redrawCanvas(data.strokes);
      }
    };

    const handleRoundReplay = (data) => {
      if (data && data.strokes) {
        playReplayAnimation(data.strokes);
      }
    };

    socket.on('draw_start', handleDrawStart);
    socket.on('draw_move', handleDrawMove);
    socket.on('draw_end', handleDrawEnd);
    socket.on('draw_fill', handleDrawFill);
    socket.on('draw_data', handleDrawData);
    socket.on('canvas_clear', handleClearCanvas);
    socket.on('clear_canvas', handleClearCanvas);
    socket.on('canvas_sync', handleCanvasSync);
    socket.on('round_replay', handleRoundReplay);

    return () => {
      if (replayTimerRef.current) clearInterval(replayTimerRef.current);
      socket.off('draw_start', handleDrawStart);
      socket.off('draw_move', handleDrawMove);
      socket.off('draw_end', handleDrawEnd);
      socket.off('draw_fill', handleDrawFill);
      socket.off('draw_data', handleDrawData);
      socket.off('canvas_clear', handleClearCanvas);
      socket.off('clear_canvas', handleClearCanvas);
      socket.off('canvas_sync', handleCanvasSync);
      socket.off('round_replay', handleRoundReplay);
    };
  }, [socket, redrawCanvas, playReplayAnimation]);

  // Handle phone calls / app switching auto-reconnect & canvas sync
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && socket) {
        const savedRoomId = localStorage.getItem('skribbl_roomId') || roomId;
        const savedPlayerName = localStorage.getItem('skribbl_username') || localStorage.getItem('skribbl_playerName');

        if (savedRoomId) {
          socket.emit('rejoin_room', { roomId: savedRoomId, playerName: savedPlayerName });
          socket.emit('request_canvas_sync', { roomId: savedRoomId });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [socket, roomId]);

  // Compute exact coordinates normalized to internal 800x500 canvas resolution
  const getCanvasCoords = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleCanvasClick = (e) => {
    if (!isDrawer || !canDraw) return;

    if (activeTool === 'fill') {
      const { x, y } = getCanvasCoords(e);
      const canvas = canvasRef.current;
      const ctx = contextRef.current;
      if (canvas && ctx) {
        floodFill(ctx, x, y, color, canvas.width, canvas.height);
        socket?.emit('draw_fill', { roomId, x, y, color });
      }
    }
  };

  const startDrawing = (e) => {
    if (!isDrawer || !canDraw || !contextRef.current) return;

    // Prevent scrolling gestures on touch screens
    if (e.type === 'touchstart') {
      e.preventDefault();
    }

    if (activeTool === 'fill') {
      handleCanvasClick(e);
      return;
    }

    const { x, y } = getCanvasCoords(e);
    const isEraser = activeTool === 'eraser';
    const activeColor = isEraser ? '#ffffff' : color;

    contextRef.current.strokeStyle = activeColor;
    contextRef.current.lineWidth = brushSize;
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);

    isDrawingRef.current = true;

    // Send draw_start event
    socket?.emit('draw_start', {
      roomId,
      x,
      y,
      color: activeColor,
      size: brushSize,
      isEraser,
    });
  };

  const draw = (e) => {
    if (!isDrawingRef.current || !isDrawer || !canDraw || !contextRef.current || activeTool === 'fill') return;
    if (e.type === 'touchmove') e.preventDefault();

    const { x, y } = getCanvasCoords(e);

    // 1. Render line locally instantly
    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();

    // 2. Throttle socket emissions to once every 15ms (~60 FPS max)
    const now = Date.now();
    if (now - lastEmitRef.current >= 15) {
      lastEmitRef.current = now;
      socket?.emit('draw_move', {
        roomId,
        x,
        y,
      });
    }
  };

  const finishDrawing = () => {
    if (!isDrawingRef.current || !contextRef.current) return;
    isDrawingRef.current = false;
    contextRef.current.closePath();

    socket?.emit('draw_end', { roomId });
  };

  const clearCanvas = () => {
    if (!isDrawer || !canDraw) return;
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      contextRef.current.fillStyle = '#ffffff';
      contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
    }
    socket?.emit('canvas_clear', { roomId });
    socket?.emit('clear_canvas', { roomId });
  };

  const undoLastStroke = () => {
    if (!isDrawer || !canDraw) return;
    socket?.emit('draw_undo', { roomId });
  };

  return (
    <div className={`canvas-wrapper ${!isDrawer ? 'guesser-mode' : ''}`}>
      <div className="canvas-frame">
        <canvas
          ref={canvasRef}
          style={{ touchAction: 'none' }}
          className={`skribbl-canvas ${isDrawer && canDraw ? 'drawer-active' : 'spectator'} ${activeTool === 'fill' ? 'cursor-fill' : ''}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={finishDrawing}
          onMouseLeave={finishDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={finishDrawing}
        />

        {isReplaying && (
          <div className="canvas-replay-badge">
            <span>▶️ Replaying Last Round...</span>
          </div>
        )}

        {!isDrawer && !isReplaying && (
          <div className="canvas-guesser-badge">
            <span>👁️ Guessing mode</span>
          </div>
        )}
      </div>

      {isDrawer && canDraw && (
        <Toolbox
          color={color}
          setColor={setColor}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          clearCanvas={clearCanvas}
          activeTool={activeTool}
          setActiveTool={setActiveTool}
          isEraser={activeTool === 'eraser'}
          setIsEraser={(val) => setActiveTool(val ? 'eraser' : 'brush')}
          undoLastStroke={undoLastStroke}
        />
      )}
    </div>
  );
}

export default Canvas;