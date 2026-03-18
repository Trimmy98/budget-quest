import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Sentry from '../../lib/sentry'

export default function JoinPage() {
  const { code } = useParams()
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [household, setHousehold] = useState(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    async function handleJoin() {
      try {
        const { data: rows, error } = await supabase
          .rpc('lookup_household_by_invite', { invite_code_param: code })
        const hh = rows?.[0]
        if (error || !hh) throw new Error('Ogiltig inbjudningslänk')
        setHousehold(hh)

        if (!user) {
          sessionStorage.setItem('pending_invite', code)
          navigate('/?invite=' + code)
          return
        }

        // Already in THIS household
        if (profile?.household_id === hh.id) {
          setStatus('same_household')
          return
        }

        // Already in a DIFFERENT household - ask to switch
        if (profile?.household_id) {
          setStatus('ask_switch')
          return
        }

        // No household yet - join directly
        await joinHousehold()
      } catch (err) {
        console.error('Join error:', err); Sentry.captureException(err)
        setStatus('error')
      }
    }

    handleJoin()
  }, [code, user])

  async function joinHousehold() {
    try {
      const { data, error } = await supabase.rpc('join_household', { invite: code })
      if (error) {
        if (error.message.includes('fullt')) {
          setStatus('full')
        } else {
          console.error('Join error:', error); Sentry.captureException(error)
          setStatus('error')
        }
        return
      }
      setHousehold(data)
      sessionStorage.removeItem('pending_invite')
      await refreshProfile()
      setStatus('joined')
      setTimeout(() => navigate('/'), 2000)
    } catch (err) {
      console.error('Join error:', err)
      setStatus('error')
    }
  }

  async function handleSwitch() {
    setSwitching(true)
    await joinHousehold()
    setSwitching(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#020617',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
      padding: 24,
    }}>
      {status === 'loading' && (
        <div style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: 20,
          color: '#00f0ff',
          textShadow: '0 0 20px rgba(0,240,255,0.8)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          Laddar...
        </div>
      )}

      {status === 'joined' && (
        <>
          <div style={{ fontSize: 48 }}>🎉</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            color: '#00ff87',
            textShadow: '0 0 20px rgba(0,255,135,0.8)',
            textAlign: 'center',
          }}>
            Du har gått med i {household?.name}!
          </div>
          <div style={{ color: '#64748b', fontSize: 14 }}>Omdirigerar...</div>
        </>
      )}

      {status === 'same_household' && (
        <>
          <div style={{ fontSize: 48 }}>👋</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
            color: '#00f0ff',
            textAlign: 'center',
          }}>
            Du är redan med i {household?.name}!
          </div>
          <button
            onClick={() => navigate('/')}
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
              marginTop: 8,
            }}
          >
            Gå till appen
          </button>
        </>
      )}

      {status === 'ask_switch' && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 24,
          maxWidth: 400,
          width: '100%',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
            color: '#e2e8f0',
            marginBottom: 8,
          }}>
            Byta hushåll?
          </div>
          <div style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.5, marginBottom: 20 }}>
            Du är redan med i ett hushåll. Vill du lämna det och gå med i <strong style={{ color: '#00f0ff' }}>{household?.name}</strong> istället?
          </div>
          <button
            onClick={handleSwitch}
            disabled={switching}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, #00ff87, #00cc6a)',
              border: 'none',
              borderRadius: 12,
              padding: '14px 0',
              color: '#020617',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0,255,135,0.3)',
              opacity: switching ? 0.7 : 1,
              marginBottom: 10,
            }}
          >
            {switching ? 'Byter...' : `Ja, gå med i ${household?.name}`}
          </button>
          <button
            onClick={() => navigate('/')}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: '14px 0',
              color: '#64748b',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
            }}
          >
            Nej, stanna kvar
          </button>
        </div>
      )}

      {status === 'full' && (
        <>
          <div style={{ fontSize: 48 }}>😕</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
            color: '#ffd93d',
            textAlign: 'center',
          }}>
            Hushållet är fullt
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: '14px 32px',
              color: '#94a3b8',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            Tillbaka
          </button>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ fontSize: 48 }}>❌</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 18,
            color: '#ff6b6b',
            textAlign: 'center',
          }}>
            Ogiltig eller utgången länk
          </div>
          <button
            onClick={() => navigate('/')}
            style={{
              background: 'linear-gradient(135deg, #1e293b, #0f172a)',
              border: '1px solid #1e293b',
              borderRadius: 12,
              padding: '14px 32px',
              color: '#94a3b8',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              marginTop: 8,
            }}
          >
            Tillbaka
          </button>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
