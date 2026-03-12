import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../hooks/useExpenses'
import { getCurrentMonth } from '../../lib/constants'

export default function Settings({ selectedMonth, onMonthChange }) {
  const { user, profile, household, refreshProfile } = useAuth()
  const { budget, refetch: refetchBudget } = useBudget()
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [editingShared, setEditingShared] = useState(false)
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [sharedCats, setSharedCats] = useState([])
  const [personalCats, setPersonalCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  const isAdmin = profile?.role === 'admin'

  useEffect(() => {
    if (profile?.household_id) fetchMembers()
  }, [profile])

  useEffect(() => {
    if (budget) {
      setSharedCats(budget.shared_categories || [])
      setPersonalCats(budget.personal_categories || [])
    }
  }, [budget])

  async function fetchMembers() {
    const { data } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
    setMembers(data || [])
  }

  async function copyInviteLink() {
    if (!household) return
    const link = `${window.location.origin}/join/${household.invite_code}`
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function regenerateInviteCode() {
    if (!isAdmin || !household) return
    setRegenerating(true)
    try {
      const newCode = Math.random().toString(36).substring(2, 10)
      await supabase.from('households').update({ invite_code: newCode }).eq('id', household.id)
      await refreshProfile()
    } finally {
      setRegenerating(false)
    }
  }

  async function removeMember(memberId) {
    if (!isAdmin || memberId === user.id) return
    if (!confirm('Är du säker på att du vill ta bort denna person?')) return
    await supabase.from('profiles').update({ household_id: null, role: 'member' }).eq('id', memberId)
    await fetchMembers()
  }

  async function saveSharedBudget() {
    setSaving(true)
    try {
      await supabase.from('budgets').update({ shared_categories: sharedCats }).eq('household_id', profile.household_id)
      await refetchBudget()
      setEditingShared(false)
    } finally {
      setSaving(false)
    }
  }

  async function savePersonalBudget() {
    setSaving(true)
    try {
      await supabase.from('budgets').update({ personal_categories: personalCats }).eq('household_id', profile.household_id)
      await refetchBudget()
      setEditingPersonal(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  // Generate month options (last 12 months)
  const monthOptions = []
  const now = new Date()
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthOptions.push(m)
  }

  const inviteLink = household ? `${window.location.origin}/join/${household.invite_code}` : ''

  const sectionStyle = {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  }
  const labelStyle = {
    fontSize: 13,
    color: '#64748b',
    fontFamily: 'Orbitron, sans-serif',
    letterSpacing: 1,
    marginBottom: 12,
  }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Month Selector */}
      <div style={sectionStyle}>
        <div style={labelStyle}>📅 VÄLJ MÅNAD</div>
        <select
          value={selectedMonth}
          onChange={e => onMonthChange(e.target.value)}
          style={{
            width: '100%',
            background: '#0b1120',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: '12px 14px',
            color: '#e2e8f0',
            fontFamily: 'Outfit, sans-serif',
            fontSize: 14,
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {monthOptions.map(m => (
            <option key={m} value={m}>{m} {m === getCurrentMonth() ? '(nuvarande)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Household Info */}
      {household && (
        <div style={sectionStyle}>
          <div style={labelStyle}>🏠 HUSHÅLLSINFO</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>
            {household.name}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
            {members.length}/{household.max_members} medlemmar
          </div>
          <div style={{
            background: '#0b1120',
            border: '1px solid rgba(0,240,255,0.2)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
          }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6 }}>Inbjudningslänk:</div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 11,
              color: '#00f0ff',
              wordBreak: 'break-all',
              marginBottom: 8,
            }}>
              {inviteLink}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={copyInviteLink}
                style={{
                  flex: 1,
                  background: 'rgba(0,240,255,0.1)',
                  border: '1px solid rgba(0,240,255,0.3)',
                  borderRadius: 8,
                  padding: '8px 0',
                  color: '#00f0ff',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 600,
                }}
              >
                {copied ? '✓ Kopierad!' : '📋 Kopiera'}
              </button>
              {isAdmin && (
                <button
                  onClick={regenerateInviteCode}
                  disabled={regenerating}
                  style={{
                    background: 'rgba(255,107,107,0.1)',
                    border: '1px solid rgba(255,107,107,0.3)',
                    borderRadius: 8,
                    padding: '8px 12px',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  {regenerating ? '...' : '🔄'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Members */}
      <div style={sectionStyle}>
        <div style={labelStyle}>👥 MEDLEMMAR</div>
        {members.map(member => (
          <div key={member.id} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 0',
            borderBottom: '1px solid #1e293b',
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: member.id === user?.id
                ? 'linear-gradient(135deg, #00f0ff, #0080ff)'
                : 'linear-gradient(135deg, #1e293b, #0f172a)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: member.id === user?.id ? '#020617' : '#94a3b8',
              flexShrink: 0,
            }}>
              {member.display_name?.[0]?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                {member.display_name}
                {member.id === user?.id && <span style={{ color: '#00f0ff', fontSize: 11 }}> (du)</span>}
              </div>
              <div style={{ fontSize: 11, color: '#64748b' }}>
                {member.role === 'admin' ? '👑 Admin' : 'Medlem'}
              </div>
            </div>
            {isAdmin && member.id !== user?.id && (
              <button
                onClick={() => removeMember(member.id)}
                style={{
                  background: 'rgba(255,107,107,0.1)',
                  border: '1px solid rgba(255,107,107,0.3)',
                  borderRadius: 8,
                  padding: '4px 10px',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                Ta bort
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Edit Shared Budget */}
      {isAdmin && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={labelStyle}>💰 GEMENSAM BUDGET</div>
            <button
              onClick={() => setEditingShared(!editingShared)}
              style={{
                background: 'rgba(0,240,255,0.1)',
                border: '1px solid rgba(0,240,255,0.3)',
                borderRadius: 8,
                padding: '4px 12px',
                color: '#00f0ff',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: 'Outfit, sans-serif',
              }}
            >
              {editingShared ? 'Avbryt' : '✏️ Redigera'}
            </button>
          </div>
          {editingShared ? (
            <div>
              {sharedCats.map((cat, i) => (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 18, width: 24 }}>{cat.icon}</span>
                  <span style={{ flex: 1, fontSize: 12, color: '#94a3b8' }}>{cat.name}</span>
                  <input
                    type="number"
                    value={sharedCats[i].budget}
                    onChange={e => {
                      const updated = [...sharedCats]
                      updated[i] = { ...updated[i], budget: parseFloat(e.target.value) || 0 }
                      setSharedCats(updated)
                    }}
                    style={{
                      width: 80,
                      background: '#0b1120',
                      border: '1px solid #1e293b',
                      borderRadius: 8,
                      padding: '6px 10px',
                      color: '#00f0ff',
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 12,
                      outline: 'none',
                      textAlign: 'right',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#64748b' }}>€</span>
                </div>
              ))}
              <button
                onClick={saveSharedBudget}
                disabled={saving}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #00f0ff, #00b4cc)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 0',
                  color: '#020617',
                  fontFamily: 'Outfit, sans-serif',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: 'pointer',
                  marginTop: 8,
                }}
              >
                {saving ? 'Sparar...' : '💾 Spara'}
              </button>
            </div>
          ) : (
            <div>
              {sharedCats.map(cat => (
                <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                  <span style={{ fontSize: 12, fontFamily: 'Orbitron, sans-serif', color: '#00f0ff' }}>{cat.budget}€</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Personal Budget */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={labelStyle}>👤 PERSONLIG BUDGET</div>
          <button
            onClick={() => setEditingPersonal(!editingPersonal)}
            style={{
              background: 'rgba(0,255,135,0.1)',
              border: '1px solid rgba(0,255,135,0.3)',
              borderRadius: 8,
              padding: '4px 12px',
              color: '#00ff87',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            {editingPersonal ? 'Avbryt' : '✏️ Redigera'}
          </button>
        </div>
        {editingPersonal ? (
          <div>
            {personalCats.map((cat, i) => (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18, width: 24 }}>{cat.icon}</span>
                <span style={{ flex: 1, fontSize: 12, color: '#94a3b8' }}>{cat.name}</span>
                <input
                  type="number"
                  value={personalCats[i].budget}
                  onChange={e => {
                    const updated = [...personalCats]
                    updated[i] = { ...updated[i], budget: parseFloat(e.target.value) || 0 }
                    setPersonalCats(updated)
                  }}
                  style={{
                    width: 80,
                    background: '#0b1120',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    padding: '6px 10px',
                    color: '#00ff87',
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 12,
                    outline: 'none',
                    textAlign: 'right',
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748b' }}>€</span>
              </div>
            ))}
            <button
              onClick={savePersonalBudget}
              disabled={saving}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #00ff87, #00cc6a)',
                border: 'none',
                borderRadius: 10,
                padding: '10px 0',
                color: '#020617',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              {saving ? 'Sparar...' : '💾 Spara'}
            </button>
          </div>
        ) : (
          <div>
            {personalCats.map(cat => (
              <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                <span style={{ fontSize: 12, fontFamily: 'Orbitron, sans-serif', color: '#00ff87' }}>{cat.budget}€</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        style={{
          width: '100%',
          background: 'rgba(255,107,107,0.1)',
          border: '1px solid rgba(255,107,107,0.3)',
          borderRadius: 14,
          padding: '14px 0',
          color: '#ff6b6b',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 600,
          fontSize: 15,
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        🚪 Logga ut
      </button>
    </div>
  )
}
