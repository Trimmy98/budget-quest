import React from 'react'

export default function ProgressBar({ value, max, color = '#00f0ff', height = 6, showLabel = false, label = '' }) {
  const pct = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0
  const isOver = value > max
  const displayColor = isOver ? '#ff6b6b' : color

  return (
    <div>
      {showLabel && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{label}</span>
          <span style={{ fontSize: 12, color: displayColor, fontFamily: 'Orbitron, sans-serif' }}>
            {Math.round(pct * 100)}%
          </span>
        </div>
      )}
      <div style={{
        background: '#1e293b',
        borderRadius: height,
        height,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.min(pct * 100, 100)}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${displayColor}99, ${displayColor})`,
          borderRadius: height,
          boxShadow: `0 0 8px ${displayColor}60`,
          transition: 'width 0.5s ease',
        }} />
      </div>
    </div>
  )
}
