import React from 'react';

export const AVATAR_COLORS = [
  '#3498db', '#e74c3c', '#2ecc71', '#f1c40f', 
  '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#34495e'
];

export const AVATAR_EYES = [
  // 0: Normal dots
  { left: '32%', right: '68%', top: '38%', shape: 'circle', r: 4 },
  // 1: Happy curves ^ ^
  { type: 'happy' },
  // 2: Wink ^ o
  { type: 'wink' },
  // 3: Cool Sunglasses
  { type: 'glasses' }
];

export const AVATAR_MOUTHS = [
  // 0: Smile
  { type: 'smile' },
  // 1: Grin / Teeth
  { type: 'grin' },
  // 2: O-mouth
  { type: 'o' },
  // 3: Neutral
  { type: 'neutral' }
];

function Avatar({ avatar, size = 48, className = '' }) {
  const color = avatar?.color || '#3498db';
  const eyesIdx = avatar?.eyes !== undefined ? avatar.eyes % 4 : 0;
  const mouthIdx = avatar?.mouth !== undefined ? avatar.mouth % 4 : 0;

  return (
    <div 
      className={`player-avatar-svg ${className}`} 
      style={{ width: size, height: size, minWidth: size, position: 'relative' }}
    >
      <svg viewBox="0 0 100 100" width={size} height={size}>
        {/* Head / Body Circle */}
        <circle cx="50" cy="50" r="46" fill={color} stroke="#2c3e50" strokeWidth="4" />
        
        {/* Cheek blushes */}
        <ellipse cx="24" cy="58" rx="7" ry="4" fill="rgba(255,255,255,0.3)" />
        <ellipse cx="76" cy="58" rx="7" ry="4" fill="rgba(255,255,255,0.3)" />

        {/* Eyes */}
        {eyesIdx === 0 && (
          <g fill="#2c3e50">
            <circle cx="34" cy="42" r="5" />
            <circle cx="66" cy="42" r="5" />
            <circle cx="35" cy="40" r="1.5" fill="#fff" />
            <circle cx="67" cy="40" r="1.5" fill="#fff" />
          </g>
        )}
        {eyesIdx === 1 && (
          <g stroke="#2c3e50" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M 28 44 Q 34 35 40 44" />
            <path d="M 60 44 Q 66 35 72 44" />
          </g>
        )}
        {eyesIdx === 2 && (
          <g fill="#2c3e50">
            <path d="M 28 44 Q 34 35 40 44" stroke="#2c3e50" strokeWidth="4" strokeLinecap="round" fill="none" />
            <circle cx="66" cy="42" r="5" />
            <circle cx="67" cy="40" r="1.5" fill="#fff" />
          </g>
        )}
        {eyesIdx === 3 && (
          <g fill="#1a252f" stroke="#2c3e50" strokeWidth="2">
            <rect x="22" y="36" width="22" height="14" rx="3" />
            <rect x="56" y="36" width="22" height="14" rx="3" />
            <line x1="44" y1="42" x2="56" y2="42" stroke="#1a252f" strokeWidth="4" />
          </g>
        )}

        {/* Mouth */}
        {mouthIdx === 0 && (
          <path d="M 36 62 Q 50 75 64 62" stroke="#2c3e50" strokeWidth="4" strokeLinecap="round" fill="none" />
        )}
        {mouthIdx === 1 && (
          <path d="M 34 60 Q 50 78 66 60 Z" fill="#fff" stroke="#2c3e50" strokeWidth="3" />
        )}
        {mouthIdx === 2 && (
          <circle cx="50" cy="65" r="7" fill="#2c3e50" />
        )}
        {mouthIdx === 3 && (
          <line x1="38" y1="64" x2="62" y2="64" stroke="#2c3e50" strokeWidth="4" strokeLinecap="round" />
        )}
      </svg>
    </div>
  );
}

export default Avatar;
