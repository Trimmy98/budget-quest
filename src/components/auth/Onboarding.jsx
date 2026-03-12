import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES, WEEKLY_CHALLENGES } from '../../lib/constants'

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
    maxWidth: 420,
    boxShadow: '0 0 40px rgba(0,240,255,0.1)',
  },
  stepIndicator: {
    display: 'flex',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 28,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    transition: 'all 0.3s',
  },
  heading: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    color: '#00f0ff',
    textShadow: '0 0 15px rgba(0,240,255,0.6)',
    marginBottom: 8,
    textAlign: 'center',
  },
  subheading: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    width: '100%',
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 10,
    padding: '14px 16px',
    color: '#e2e8f0',
    fontFamily: 'Outfit, sans-serif',
    fontSize: 16,
    outline: 'none',
    marginBottom: 12,
  },
  bigInput: {
    width: '100%',
    background: '#0b1120',
    border: '1px solid #00ff87',
    borderRadius: 10,
    padding: '16px',
    color: '#00ff87',
    fontFamily: 'Orbitron, sans-serif',
    fontSize: 28,
    fontWeight: 700,
    outline: 'none',
    textAlign: 'center',
    marginBottom: 12,
    boxShadow: '0 0 15px rgba(0,255,135,0.2)',
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
    transition: 'all 0.2s',
    boxShadow: '0 0 20px rgba(0,240,255,0.3)',
  },
  btnSecondary: {
    width: '100%',
    background: 'transparent',
    border: '1px solid #1e293b',
    borderRadius: 12,
    padding: '14px 0',
    color: '#94a3b8',
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 600,
    fontSize: 15,
    cursor: 'pointer',
    marginTop: 10,
    transition: 'all 0.2s',
  },
  optionCard: {
    background: '#0b1120',
    border: '1px solid #1e293b',
    borderRadius: 14,
    padding: '18px 20px',
    cursor: 'pointer',
    marginBottom: 12,
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  inviteBox: {
    background: '#0b1120',
    border: '1px solid #00f0ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    boxShadow: '0 0 15px rgba(0,240,255,0.15)',
  },
  inviteLink: {
    fontFamily: 'Orbitron, sans-serif',
    fontSize: 13,
    color: '#00f0ff',
    wordBreak: 'break-all',
    marginBottom: 10,
  },
  copyBtn: {
    background: 'rgba(0,240,255,0.1)',
    border: '1px solid #00f0ff',
    borderRadius: 8,
    padding: '8px 16px',
    color: '#00f0ff',
    cursor: 'pointer',
    fontSize: 13,
    fontFamily: 'Outfit, sans-serif',
    fontWeight: 600,
    width: '100%',
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

const TOTAL_STEPS = 5

export default function Onboarding({ inviteCode, pendingInviteCode }) {
  const { user, refreshProfile } = useAuth()
  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [householdChoice, setHouseholdChoice] = useState(null) // 'create' or 'join'
  const [householdName, setHouseholdName] = useState('')
  const [income, setIncome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdHousehold, setCreatedHousehold] = useState(null)
  const [joinedHousehold, setJoinedHousehold] = useState(null)
  const [copied, setCopied] = useState(false)

  const effectiveInviteCode = inviteCode || pendingInviteCode

  function getStepCount() {
    if (effectiveInviteCode) return 3
    if (householdChoice === 'join') return 3
    return TOTAL_STEPS
  }

  async function handleStep1() {
    if (!displayName.trim()) return
    setLoading(true)
    setError('')
    try {
      const { error } = await supabase.from('profiles').upsert({
        id: user.id,
        display_name: displayName.trim(),
        onboarding_complete: false,
      })
      if (error) throw error
      if (effectiveInviteCode) {
        await handleJoinByCode(effectiveInviteCode)
      } else {
        setStep(2)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinByCode(code) {
    try {
      const { data: hh, error: hhErr } = await supabase
        .from('households')
        .select('*')
        .eq('invite_code', code)
        .single()
      if (hhErr) throw new Error('Ogiltig inbjudningskod')

      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', hh.id)

      if (count >= hh.max_members) throw new Error('Hushållet är fullt (max 4 personer)')

      await supabase.from('profiles').upsert({
        id: user.id,
        household_id: hh.id,
        role: 'member',
      })

      await supabase.from('gamification').upsert({
        user_id: user.id,
        household_id: hh.id,
      })

      setJoinedHousehold(hh)
      setStep(effectiveInviteCode ? 2 : 3)
    } catch (err) {
      throw err
    }
  }

  async function handleStep2Choice(choice) {
    setHouseholdChoice(choice)
    if (choice === 'create') {
      setStep(3)
    } else {
      setStep(3)
    }
  }

  async function handleCreateHousehold() {
    if (!householdName.trim()) return
    setLoading(true)
    setError('')
    try {
      const challenge = WEEKLY_CHALLENGES[Math.floor(Math.random() * WEEKLY_CHALLENGES.length)]

      const { data: hh, error: hhErr } = await supabase
        .from('households')
        .insert({ name: householdName.trim(), admin_id: user.id })
        .select()
        .single()
      if (hhErr) throw hhErr

      await supabase.from('profiles').upsert({
        id: user.id,
        household_id: hh.id,
        role: 'admin',
      })

      await supabase.from('budgets').insert({
        household_id: hh.id,
        shared_categories: DEFAULT_SHARED_CATEGORIES,
        personal_categories: DEFAULT_PERSONAL_CATEGORIES,
        weekly_challenge: challenge,
      })

      await supabase.from('gamification').upsert({
        user_id: user.id,
        household_id: hh.id,
      })

      setCreatedHousehold(hh)
      setStep(4)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleJoinStep() {
    // They'll type an invite code
  }

  async function handleSaveIncome() {
    setLoading(true)
    setError('')
    try {
      const hh = createdHousehold || joinedHousehold
      if (hh && income) {
        const now = new Date()
        const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        await supabase.from('income').upsert({
          household_id: hh.id,
          user_id: user.id,
          month,
          amount: parseFloat(income),
        })
      }
      setStep(step + 1)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleFinish() {
    setLoading(true)
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        onboarding_complete: true,
      })
      await refreshProfile()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function copyInviteLink() {
    const hh = createdHousehold
    if (!hh) return
    const link = `${window.location.origin}/join/${hh.invite_code}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const stepCount = getStepCount()

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.stepIndicator}>
          {Array.from({ length: stepCount }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i < step ? '#00f0ff' : '#1e293b',
                boxShadow: i < step ? '0 0 8px rgba(0,240,255,0.6)' : 'none',
                width: i === step - 1 ? 20 : 8,
                borderRadius: i === step - 1 ? 4 : '50%',
              }}
            />
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}

        {/* Step 1: Name */}
        {step === 1 && (
          <div>
            <div style={styles.heading}>Välkommen! 👋</div>
            <div style={styles.subheading}>Vad heter du?</div>
            <input
              style={styles.input}
              placeholder="Ditt namn"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleStep1()}
              autoFocus
              onFocus={e => e.target.style.borderColor = '#00f0ff'}
              onBlur={e => e.target.style.borderColor = '#1e293b'}
            />
            <button
              style={{ ...styles.btn, opacity: !displayName.trim() || loading ? 0.5 : 1 }}
              onClick={handleStep1}
              disabled={!displayName.trim() || loading}
            >
              {loading ? 'Sparar...' : 'Fortsätt →'}
            </button>
          </div>
        )}

        {/* Step 2: Create or Join */}
        {step === 2 && !effectiveInviteCode && (
          <div>
            <div style={styles.heading}>Hushåll 🏠</div>
            <div style={styles.subheading}>Välj ett alternativ</div>
            <div
              style={{
                ...styles.optionCard,
                borderColor: householdChoice === 'create' ? '#00f0ff' : '#1e293b',
                boxShadow: householdChoice === 'create' ? '0 0 15px rgba(0,240,255,0.2)' : 'none',
              }}
              onClick={() => handleStep2Choice('create')}
            >
              <span style={{ fontSize: 28 }}>🏗️</span>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>Skapa nytt hushåll</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>Du blir admin</div>
              </div>
            </div>
            <div
              style={{
                ...styles.optionCard,
                borderColor: householdChoice === 'join' ? '#00ff87' : '#1e293b',
                boxShadow: householdChoice === 'join' ? '0 0 15px rgba(0,255,135,0.2)' : 'none',
              }}
              onClick={() => handleStep2Choice('join')}
            >
              <span style={{ fontSize: 28 }}>🔗</span>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>Jag har en inbjudningslänk</div>
                <div style={{ color: '#64748b', fontSize: 13 }}>Gå med i befintligt hushåll</div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3a: Create household name */}
        {step === 3 && householdChoice === 'create' && (
          <div>
            <div style={styles.heading}>Namnge ditt hushåll 🏠</div>
            <div style={styles.subheading}>T.ex. "Vasagatan 12" eller "Fam. Svensson"</div>
            <input
              style={styles.input}
              placeholder="Hushållets namn"
              value={householdName}
              onChange={e => setHouseholdName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateHousehold()}
              autoFocus
              onFocus={e => e.target.style.borderColor = '#00f0ff'}
              onBlur={e => e.target.style.borderColor = '#1e293b'}
            />
            <button
              style={{ ...styles.btn, opacity: !householdName.trim() || loading ? 0.5 : 1 }}
              onClick={handleCreateHousehold}
              disabled={!householdName.trim() || loading}
            >
              {loading ? 'Skapar...' : 'Skapa hushåll →'}
            </button>
          </div>
        )}

        {/* Step 3b: Join with invite code */}
        {step === 3 && householdChoice === 'join' && (
          <JoinWithCode
            user={user}
            onJoined={(hh) => { setJoinedHousehold(hh); setStep(4) }}
            onError={setError}
          />
        )}

        {/* Step 2 when joining via invite link (income) */}
        {step === 2 && effectiveInviteCode && (
          <div>
            <div style={styles.heading}>Din inkomst 💰</div>
            <div style={styles.subheading}>Vad är din månadsinkomst efter skatt?</div>
            <input
              style={styles.bigInput}
              type="number"
              placeholder="0"
              value={income}
              onChange={e => setIncome(e.target.value)}
              autoFocus
            />
            <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>€ per månad</div>
            <button style={styles.btn} onClick={handleSaveIncome} disabled={loading}>
              {loading ? 'Sparar...' : 'Spara →'}
            </button>
            <button style={styles.btnSecondary} onClick={() => setStep(3)}>
              Hoppa över
            </button>
          </div>
        )}

        {/* Step 4: Income (for create household flow) */}
        {step === 4 && householdChoice === 'create' && (
          <div>
            <div style={styles.heading}>Din inkomst 💰</div>
            <div style={styles.subheading}>Vad är din månadsinkomst efter skatt?</div>
            <input
              style={styles.bigInput}
              type="number"
              placeholder="0"
              value={income}
              onChange={e => setIncome(e.target.value)}
              autoFocus
            />
            <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>€ per månad</div>
            <button style={styles.btn} onClick={handleSaveIncome} disabled={loading}>
              {loading ? 'Sparar...' : 'Nästa →'}
            </button>
            <button style={styles.btnSecondary} onClick={() => setStep(5)}>
              Hoppa över
            </button>
          </div>
        )}

        {/* Step 5: Invite link */}
        {step === 5 && householdChoice === 'create' && createdHousehold && (
          <div>
            <div style={styles.heading}>Bjud in! 🎉</div>
            <div style={styles.subheading}>Dela länken med dina roommates</div>
            <div style={styles.inviteBox}>
              <div style={styles.inviteLink}>
                {window.location.origin}/join/{createdHousehold.invite_code}
              </div>
              <button style={styles.copyBtn} onClick={copyInviteLink}>
                {copied ? '✓ Kopierad!' : '📋 Kopiera länk'}
              </button>
            </div>
            <button style={styles.btn} onClick={handleFinish} disabled={loading}>
              {loading ? '...' : 'Kör igång! 🚀'}
            </button>
          </div>
        )}

        {/* Finish for join flow */}
        {step === 3 && (effectiveInviteCode || householdChoice === 'join') && joinedHousehold && (
          <div>
            <div style={styles.heading}>Du är med! 🎉</div>
            <div style={styles.subheading}>Du har gått med i <strong style={{color:'#00f0ff'}}>{joinedHousehold.name}</strong></div>
            <div style={{ textAlign: 'center', fontSize: 48, margin: '20px 0' }}>🏠</div>
            <button style={styles.btn} onClick={handleFinish} disabled={loading}>
              {loading ? '...' : 'Kör igång! 🚀'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function JoinWithCode({ user, onJoined, onError }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleJoin() {
    if (!code.trim()) return
    setLoading(true)
    try {
      const { data: hh, error: hhErr } = await supabase
        .from('households')
        .select('*')
        .eq('invite_code', code.trim().toLowerCase())
        .single()
      if (hhErr) throw new Error('Ogiltig kod. Kontrollera och försök igen.')

      const { count } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', hh.id)
      if (count >= hh.max_members) throw new Error('Hushållet är fullt (max 4 personer)')

      const { error: profileErr } = await supabase.from('profiles').upsert({
        id: user.id,
        household_id: hh.id,
        role: 'member',
      })
      if (profileErr) throw profileErr

      await supabase.from('gamification').upsert({
        user_id: user.id,
        household_id: hh.id,
      })

      onJoined(hh)
    } catch (err) {
      onError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 22,
        fontWeight: 700,
        color: '#00ff87',
        textShadow: '0 0 15px rgba(0,255,135,0.6)',
        marginBottom: 8,
        textAlign: 'center',
      }}>Ange inbjudningskod 🔗</div>
      <div style={{ color: '#64748b', fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
        8-tecken koden från din kompis
      </div>
      <input
        style={{
          width: '100%',
          background: '#0b1120',
          border: '1px solid #00ff87',
          borderRadius: 10,
          padding: '16px',
          color: '#00ff87',
          fontFamily: 'Orbitron, sans-serif',
          fontSize: 20,
          fontWeight: 700,
          outline: 'none',
          textAlign: 'center',
          letterSpacing: 4,
          marginBottom: 12,
        }}
        placeholder="abc12345"
        value={code}
        onChange={e => setCode(e.target.value.toLowerCase())}
        maxLength={8}
        autoFocus
      />
      <button
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #00ff87, #00cc6a)',
          border: 'none',
          borderRadius: 12,
          padding: '14px 0',
          color: '#020617',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: 16,
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(0,255,135,0.3)',
          opacity: !code.trim() || loading ? 0.5 : 1,
        }}
        onClick={handleJoin}
        disabled={!code.trim() || loading}
      >
        {loading ? 'Ansluter...' : 'Gå med i hushåll →'}
      </button>
    </div>
  )
}
