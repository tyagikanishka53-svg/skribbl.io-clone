import React from 'react';

const PALETTE = [
  '#000000', '#4c4c4c', '#747474', '#ffffff',
  '#e74c3c', '#c0392b', '#e67e22', '#d35400',
  '#f1c40f', '#f39c12', '#2ecc71', '#27ae60',
  '#1abc9c', '#16a085', '#3498db', '#2980b9',
  '#9b59b6', '#8e44ad', '#e84393', '#fd79a8',
  '#795548', '#5d4037', '#a0522d', '#d2b48c'
];

const BRUSH_SIZES = [
  { size: 3, label: 'Thin' },
  { size: 7, label: 'Medium' },
  { size: 14, label: 'Thick' },
  { size: 28, label: 'Chunky' }
];

function Toolbox({ 
  color = '#000000', 
  setColor = () => {}, 
  brushSize = 7, 
  setBrushSize = () => {}, 
  clearCanvas = () => {}, 
  activeTool = 'brush',
  setActiveTool,
  isEraser = false, 
  setIsEraser,
  undoLastStroke = () => {}
}) {
  const currentTool = activeTool || (isEraser ? 'eraser' : 'brush');

  const setTool = (tool) => {
    if (setActiveTool) {
      setActiveTool(tool);
    }
    if (setIsEraser) {
      setIsEraser(tool === 'eraser');
    }
  };

  const handleColorSelect = (selectedColor) => {
    setColor(selectedColor);
    if (currentTool === 'eraser') {
      setTool('brush');
    }
  };

  const handleSizeSelect = (size) => {
    setBrushSize(size);
    if (currentTool === 'fill') {
      setTool('brush');
    }
  };

  return (
    <div className="toolbox">
      {/* Tools Section: Brush, Bucket Fill, Eraser */}
      <div className="drawing-modes">
        <button
          type="button"
          className={`mode-btn ${currentTool === 'brush' ? 'active-mode' : ''}`}
          onClick={() => setTool('brush')}
          title="Pen / Brush Tool"
        >
          ✏️ Brush
        </button>

        <button
          type="button"
          className={`mode-btn ${currentTool === 'fill' ? 'active-mode' : ''}`}
          onClick={() => setTool('fill')}
          title="Fill Bucket Tool"
        >
          🪣 Fill
        </button>

        <button 
          type="button"
          className={`mode-btn ${currentTool === 'eraser' ? 'active-mode' : ''}`} 
          onClick={() => setTool(currentTool === 'eraser' ? 'brush' : 'eraser')}
          title="Eraser Tool"
        >
          🧹 Eraser
        </button>
      </div>

      {/* Colors Section */}
      <div className="palette-grid">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-btn ${color === c && currentTool !== 'eraser' ? 'active-color' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => handleColorSelect(c)}
            title={`Select Color ${c}`}
            aria-label={`Select Color ${c}`}
          />
        ))}
      </div>

      {/* Brush Sizes */}
      <div className="brush-controls">
        {BRUSH_SIZES.map(({ size, label }) => (
          <button
            key={size}
            type="button"
            className={`brush-size-btn ${brushSize === size && currentTool !== 'fill' ? 'active' : ''}`}
            onClick={() => handleSizeSelect(size)}
            title={`${label} (${size}px)`}
            aria-label={`${label} brush size (${size}px)`}
          >
            <span 
              className="brush-preview-dot" 
              style={{ 
                width: Math.min(24, Math.max(6, size)), 
                height: Math.min(24, Math.max(6, size)),
                backgroundColor: currentTool === 'eraser' ? '#ffffff' : color,
                border: currentTool === 'eraser' || color.toLowerCase() === '#ffffff' ? '1px solid #ccc' : 'none'
              }} 
            />
          </button>
        ))}
      </div>

      {/* Tool Action Buttons: Undo, Clear */}
      <div className="tool-actions">
        <button 
          type="button"
          className="action-btn undo-btn" 
          onClick={undoLastStroke}
          title="Undo last stroke"
        >
          ↩️ Undo
        </button>

        <button 
          type="button"
          className="action-btn clear-btn" 
          onClick={clearCanvas}
          title="Clear entire canvas"
        >
          🗑️ Clear
        </button>
      </div>
    </div>
  );
}

export default Toolbox;