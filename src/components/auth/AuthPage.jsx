import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #020617 0%, #0b1120 50%, #0f172a 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    background: 'linear-gradient(135deg, #0f172a, #1e293b)',
    border: '1px solid #1e293b',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    boxShadow: '0 0 40px rgba(0,240,255,0.1)',
  },
  logo: {
    textAlign: 'center',
    marginBottom: 32,
  },
  title: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: 28,
    fontWeight: 900,
    color: '#00f0ff',
    textShadow: '0 0 20px rgba(0,240,255,0.8)',
    letterSpacing: 2,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 6,
  },
  tabs: {
    display: 'flex',
    background: '#0b1120',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  tab: {
    flex: 1,
    padding: '10px 0',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 600,
    fontSize: 14,
    transition: 'all 0.2s',
  },
  input: {
    width: '100%',
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '12px 16px',
    color: '#e2e8f0',
    fontFamily: 'Outfit, sans-serif',
    fontSize: 15,
    outline: 'none',
    marginBottom: 12,
    transition: 'border-color 0.2s',
  },
  btn: {
    width: '100%',
    background: 'linear-gradient(135deg, #00f0ff, #00b4cc)',
    border: 'none',
    borderRadius: 12,
    padding: '14px 0',
    color: '#020617',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 700,
    fontSize: 16,
    cursor: 'pointer',
    marginTop: 8,
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(0,240,255,0.3)',
  },
  error: {
    background: 'rgba(255,107,107,0.1)',
    border: '1px solid #ff6b6b',
    borderRadius: 8,
    padding: '10px 14px',
    color: '#ff6b6b',
    fontSize: 13,
    marginBottom: 12,
  },
}

export default function AuthPage({ inviteCode }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { invite_code: inviteCode || null }
          }
        })
        if (error) throw error
        setSuccess('Konto skapat! Kontrollera din email för verifiering, eller logga in direkt.')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.title}>💰 BUDGET QUEST</div>
          <div style={styles.subtitle}>
            {inviteCode ? `Du bjuds in till ett hushåll! 🏠` : 'Gamifiera din ekonomi'}
          </div>
        </div>

        <div style={styles.tabs}>
          {['login', 'register'].map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                ...styles.tab,
                background: mode === m ? 'linear-gradient(135deg, #00f0ff22, #00f0ff11)' : 'transparent',
                color: mode === m ? '#00f0ff' : '#64748b',
                boxShadow: mode === m ? '0 0 10px rgba(0,240,255,0.2)' : 'none',
              }}
            >
              {m === 'login' ? 'Logga in' : 'Registrera'}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {success && (
          <div style={{ ...styles.error, borderColor: '#00ff87', color: '#00ff87', background: 'rgba(0,255,135,0.1)' }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            onFocus={e => e.target.style.borderColor = '#00f0ff'}
            onBlur={e => e.target.style.borderColor = '#1e293b'}
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Lösenord (min 6 tecken)"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            onFocus={e => e.target.style.borderColor = '#00f0ff'}
            onBlur={e => e.target.style.borderColor = '#1e293b'}
          />
          <button
            style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }}
            type="submit"
            disabled={loading}
          >
            {loading ? '...' : mode === 'login' ? 'Logga in' : 'Skapa konto'}
          </button>
        </form>
      </div>
    </div>
  )
}
