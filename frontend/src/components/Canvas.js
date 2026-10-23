import React, { useEffect, useRef, useState, useCallback } from 'react';
import Toolbox from './Toolbox';

function Canvas({ socket, roomId, isDrawer, canDraw = true }) {
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const isDrawingRef = useRef(false);

  // Toolbox State
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(7);
  const [isEraser, setIsEraser] = useState(false);

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
      if (!stroke.points || stroke.points.length === 0) return;

      ctx.beginPath();
      ctx.strokeStyle = stroke.isEraser ? '#ffffff' : (stroke.color || '#000000');
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

    const handleDrawData = (data) => {
      if (!contextRef.current) return;
      const { offsetX, offsetY, isStarting, strokeColor, strokeSize } = data;
      contextRef.current.strokeStyle = strokeColor;
      contextRef.current.lineWidth = strokeSize;

      if (isStarting) {
        contextRef.current.beginPath();
        contextRef.current.moveTo(offsetX, offsetY);
      } else {
        contextRef.current.lineTo(offsetX, offsetY);
        contextRef.current.stroke();
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

    socket.on('draw_start', handleDrawStart);
    socket.on('draw_move', handleDrawMove);
    socket.on('draw_end', handleDrawEnd);
    socket.on('draw_data', handleDrawData);
    socket.on('clear_canvas', handleClearCanvas);
    socket.on('canvas_sync', handleCanvasSync);

    return () => {
      socket.off('draw_start', handleDrawStart);
      socket.off('draw_move', handleDrawMove);
      socket.off('draw_end', handleDrawEnd);
      socket.off('draw_data', handleDrawData);
      socket.off('clear_canvas', handleClearCanvas);
      socket.off('canvas_sync', handleCanvasSync);
    };
  }, [socket, redrawCanvas]);

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
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e) => {
    if (!isDrawer || !canDraw) return;
    if (e.type === 'touchstart') e.preventDefault();

    const { x, y } = getCanvasCoords(e);
    const activeColor = isEraser ? '#ffffff' : color;

    contextRef.current.strokeStyle = activeColor;
    contextRef.current.lineWidth = brushSize;
    contextRef.current.beginPath();
    contextRef.current.moveTo(x, y);

    isDrawingRef.current = true;

    // Send draw_start event
    socket.emit('draw_start', {
      roomId,
      x,
      y,
      color: activeColor,
      size: brushSize,
      isEraser
    });
  };

  const draw = (e) => {
    if (!isDrawingRef.current || !isDrawer || !canDraw) return;
    if (e.type === 'touchmove') e.preventDefault();

    const { x, y } = getCanvasCoords(e);

    contextRef.current.lineTo(x, y);
    contextRef.current.stroke();

    socket.emit('draw_move', {
      roomId,
      x,
      y
    });
  };

  const finishDrawing = (e) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    contextRef.current.closePath();

    socket.emit('draw_end', { roomId });
  };

  const clearCanvas = () => {
    if (!isDrawer || !canDraw) return;
    const canvas = canvasRef.current;
    if (canvas && contextRef.current) {
      contextRef.current.fillStyle = '#ffffff';
      contextRef.current.fillRect(0, 0, canvas.width, canvas.height);
    }
    socket.emit('clear_canvas', { roomId });
  };

  const undoLastStroke = () => {
    if (!isDrawer || !canDraw) return;
    socket.emit('draw_undo', { roomId });
  };

  return (
    <div className={`canvas-wrapper ${!isDrawer ? 'guesser-mode' : ''}`}>
      <div className="canvas-frame">
        <canvas
          ref={canvasRef}
          className={`skribbl-canvas ${isDrawer && canDraw ? 'drawer-active' : 'spectator'}`}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={finishDrawing}
          onMouseLeave={finishDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={finishDrawing}
        />
        {!isDrawer && (
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
          isEraser={isEraser}
          setIsEraser={setIsEraser}
          undoLastStroke={undoLastStroke}
        />
      )}
    </div>
  );
}

export default Canvas;