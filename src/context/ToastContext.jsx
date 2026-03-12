import React, { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext({})

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'xp', icon = '⚡') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type, icon }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  )
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null
  return (
    <div style={{
      position: 'fixed',
      top: 70,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      width: '90%',
      maxWidth: 440,
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function Toast({ toast }) {
  const colors = {
    xp: { bg: 'rgba(0,240,255,0.15)', border: '#00f0ff', text: '#00f0ff' },
    success: { bg: 'rgba(0,255,135,0.15)', border: '#00ff87', text: '#00ff87' },
    achievement: { bg: 'rgba(255,217,61,0.15)', border: '#ffd93d', text: '#ffd93d' },
    error: { bg: 'rgba(255,107,107,0.15)', border: '#ff6b6b', text: '#ff6b6b' },
  }
  const c = colors[toast.type] || colors.xp

  return (
    <div style={{
      background: c.bg,
      border: `1px solid ${c.border}`,
      borderRadius: 12,
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: 'slideInFade 0.3s ease',
      backdropFilter: 'blur(10px)',
    }}>
      <style>{`
        @keyframes slideInFade {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <span style={{ fontSize: 20 }}>{toast.icon}</span>
      <span style={{ color: c.text, fontWeight: 600, fontSize: 14, fontFamily: 'Outfit, sans-serif' }}>
        {toast.message}
      </span>
    </div>
  )
}

export const useToast = () => useContext(ToastContext)
