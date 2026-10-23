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
  color, 
  setColor, 
  brushSize, 
  setBrushSize, 
  clearCanvas, 
  isEraser, 
  setIsEraser,
  undoLastStroke 
}) {
  return (
    <div className="toolbox">
      {/* Colors Section */}
      <div className="palette-grid">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={`color-btn ${color === c && !isEraser ? 'active-color' : ''}`}
            style={{ backgroundColor: c }}
            onClick={() => {
              setColor(c);
              setIsEraser(false);
            }}
            title={c}
          />
        ))}
      </div>

      {/* Brush Sizes */}
      <div className="brush-controls">
        {BRUSH_SIZES.map(({ size, label }) => (
          <button
            key={size}
            type="button"
            className={`brush-size-btn ${brushSize === size && !isEraser ? 'active' : ''}`}
            onClick={() => {
              setBrushSize(size);
              setIsEraser(false);
            }}
            title={`${label} (${size}px)`}
          >
            <span 
              className="brush-preview-dot" 
              style={{ width: Math.min(24, Math.max(6, size)), height: Math.min(24, Math.max(6, size)) }} 
            />
          </button>
        ))}
      </div>

      {/* Tool Action Buttons: Eraser, Undo, Clear */}
      <div className="tool-actions">
        <button 
          type="button"
          className={`action-btn eraser-btn ${isEraser ? 'active' : ''}`} 
          onClick={() => setIsEraser(!isEraser)}
          title="Toggle Eraser"
        >
          🧹 Eraser
        </button>

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