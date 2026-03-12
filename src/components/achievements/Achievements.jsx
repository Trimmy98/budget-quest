import React from 'react'
import { ACHIEVEMENTS, getLevelInfo } from '../../lib/constants'

export default function Achievements({ gamification }) {
  const unlocked = gamification?.achievements || []
  const xp = gamification?.xp || 0
  const levelInfo = getLevelInfo(xp)

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Stats */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        border: '1px solid rgba(255,217,61,0.2)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        display: 'flex',
        justifyContent: 'space-around',
        boxShadow: '0 0 20px rgba(255,217,61,0.05)',
      }}>
        {[
          { label: 'Upplåsta', value: `${unlocked.length}/${ACHIEVEMENTS.length}`, color: '#ffd93d' },
          { label: 'Total XP', value: xp, color: '#00f0ff' },
          { label: 'Level', value: levelInfo.level, color: '#00ff87' },
        ].map(stat => (
          <div key={stat.label} style={{ textAlign: 'center' }}>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 22,
              fontWeight: 900,
              color: stat.color,
              textShadow: `0 0 10px ${stat.color}80`,
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Achievement Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {ACHIEVEMENTS.map(achievement => {
          const isUnlocked = unlocked.includes(achievement.id)
          return (
            <div key={achievement.id} style={{
              background: isUnlocked
                ? 'linear-gradient(135deg, rgba(255,217,61,0.15), rgba(255,217,61,0.05))'
                : '#0f172a',
              border: `1px solid ${isUnlocked ? 'rgba(255,217,61,0.4)' : '#1e293b'}`,
              borderRadius: 16,
              padding: 16,
              transition: 'all 0.2s',
              boxShadow: isUnlocked ? '0 0 15px rgba(255,217,61,0.1)' : 'none',
              filter: isUnlocked ? 'none' : 'grayscale(0.8) opacity(0.5)',
            }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{achievement.icon}</div>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: isUnlocked ? '#ffd93d' : '#64748b',
                marginBottom: 4,
                lineHeight: 1.2,
              }}>
                {achievement.title}
              </div>
              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 8 }}>
                {achievement.description}
              </div>
              <div style={{
                fontSize: 11,
                fontFamily: 'Orbitron, sans-serif',
                color: isUnlocked ? '#00ff87' : '#1e293b',
              }}>
                {isUnlocked ? `✓ +${achievement.xp} XP` : `${achievement.xp} XP`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
