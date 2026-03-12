import React from 'react'
import { useAuth } from '../../context/AuthContext'
import { getLevelInfo } from '../../lib/constants'

export default function Header({ gamification }) {
  const { household } = useAuth()
  const levelInfo = gamification ? getLevelInfo(gamification.xp) : null

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 100,
      background: 'rgba(2,6,23,0.95)',
      backdropFilter: 'blur(10px)',
      borderBottom: '1px solid #1e293b',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <div style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: 16,
          fontWeight: 900,
          color: '#00f0ff',
          textShadow: '0 0 10px rgba(0,240,255,0.7)',
          letterSpacing: 1,
        }}>
          💰 BUDGET QUEST
        </div>
        {household && (
          <div style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>
            {household.name}
          </div>
        )}
      </div>
      {levelInfo && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(0,240,255,0.05)',
          border: '1px solid rgba(0,240,255,0.2)',
          borderRadius: 20,
          padding: '4px 12px 4px 8px',
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #00f0ff, #0080ff)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 11,
            fontWeight: 900,
            color: '#020617',
          }}>
            {levelInfo.level}
          </div>
          <div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 9, color: '#00f0ff', letterSpacing: 0.5 }}>
              LVL {levelInfo.level}
            </div>
            <div style={{ fontSize: 10, color: '#64748b' }}>
              {gamification.xp} XP
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
