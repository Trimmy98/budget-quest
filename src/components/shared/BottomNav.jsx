import React from 'react'

const tabs = [
  { id: 'dashboard', icon: '📊', label: 'Hem' },
  { id: 'add', icon: '➕', label: 'Logga' },
  { id: 'personal', icon: '👤', label: 'Personligt' },
  { id: 'quests', icon: '🗺️', label: 'Sparande' },
  { id: 'achievements', icon: '🏆', label: 'Badges' },
  { id: 'settings', icon: '⚙️', label: 'Mer' },
]

export default function BottomNav({ activeTab, onTabChange }) {
  return (
    <nav style={{
      position: 'sticky',
      bottom: 0,
      zIndex: 100,
      background: 'rgba(11,17,32,0.98)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid #1e293b',
      display: 'flex',
      justifyContent: 'space-around',
      padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
    }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
            padding: '4px 8px',
            borderRadius: 10,
            transition: 'all 0.2s',
            opacity: activeTab === tab.id ? 1 : 0.5,
          }}
        >
          {tab.id === 'add' ? (
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: activeTab === 'add'
                ? 'linear-gradient(135deg, #00ff87, #00cc6a)'
                : 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: activeTab === 'add' ? 'none' : '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              boxShadow: activeTab === 'add' ? '0 0 15px rgba(0,255,135,0.5)' : 'none',
              marginTop: -10,
              transition: 'all 0.2s',
            }}>
              ➕
            </div>
          ) : (
            <span style={{
              fontSize: 20,
              filter: activeTab === tab.id ? 'drop-shadow(0 0 6px currentColor)' : 'none',
            }}>
              {tab.icon}
            </span>
          )}
          <span style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: 10,
            fontWeight: activeTab === tab.id ? 600 : 400,
            color: activeTab === tab.id ? '#00f0ff' : '#64748b',
          }}>
            {tab.label}
          </span>
        </button>
      ))}
    </nav>
  )
}
