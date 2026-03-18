import React from 'react'
import Sentry from '../../lib/sentry'

export default class ErrorBoundary extends React.Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        background: '#020617',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid #ff6b6b40',
          borderRadius: 20,
          padding: 32,
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            color: '#ff6b6b',
            textShadow: '0 0 20px rgba(255,107,107,0.5)',
            marginBottom: 8,
          }}>
            Något gick fel
          </div>
          <div style={{
            fontSize: 14,
            color: '#94a3b8',
            lineHeight: 1.5,
            marginBottom: 24,
          }}>
            Appen stötte på ett oväntat fel. Prova att ladda om sidan.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              background: 'linear-gradient(135deg, #00f0ff, #0080ff)',
              border: 'none',
              borderRadius: 12,
              padding: '14px 32px',
              color: '#020617',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0,240,255,0.3)',
              marginBottom: 20,
            }}
          >
            Ladda om
          </button>
          <div style={{
            fontSize: 11,
            color: '#475569',
            background: '#0b1120',
            borderRadius: 8,
            padding: '8px 12px',
            wordBreak: 'break-word',
            fontFamily: 'monospace',
          }}>
            {this.state.error.message}
          </div>
        </div>
      </div>
    )
  }
}
