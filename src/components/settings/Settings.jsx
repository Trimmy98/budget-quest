import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget, useIncome } from '../../hooks/useExpenses'
import { useCurrency } from '../../hooks/useCurrency'
import { getCurrentMonth } from '../../lib/constants'

export default function Settings({ selectedMonth, onMonthChange }) {
  const { user, profile, household, refreshProfile } = useAuth()
  const { budget, refetch: refetchBudget } = useBudget()
  const { myIncome } = useIncome(selectedMonth)
  const { currency, symbol, setCurrency, currencies } = useCurrency()
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [editingShared, setEditingShared] = useState(false)
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [sharedCats, setSharedCats] = useState([])
  const [personalCats, setPersonalCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState([])
  const [showAddSub, setShowAddSub] = useState(false)
  const [newSub, setNewSub] = useState({ name: '', amount: '', frequency: 'monthly' })

  useEffect(() => {
    if (user?.id) {
      const stored = localStorage.getItem(`subs_${user.id}`)
      if (stored) setSubscriptions(JSON.parse(stored))
    }
  }, [user])

  function saveSubs(subs) {
    setSubscriptions(subs)
    if (user?.id) localStorage.setItem(`subs_${user.id}`, JSON.stringify(subs))
  }

  function addSubscription() {
    if (!newSub.name || !newSub.amount) return
    const sub = {
      id: Date.now(),
      name: newSub.name,
      amount: parseFloat(newSub.amount),
      frequency: newSub.frequency,
    }
    saveSubs([...subscriptions, sub])
    setNewSub({ name: '', amount: '', frequency: 'monthly' })
    setShowAddSub(false)
  }

  function removeSubscription(id) {
    saveSubs(subscriptions.filter(s => s.id !== id))
  }

  const monthlySubTotal = subscriptions.reduce((sum, s) => {
    if (s.frequency === 'yearly') return sum + s.amount / 12
    if (s.frequency === 'quarterly') return sum + s.amount / 3
    if (s.frequency === 'weekly') return sum + s.amount * 4.33
    return sum + s.amount
  }, 0)
  const yearlySubTotal = monthlySubTotal * 12
  const subPercentOfIncome = myIncome > 0 ? Math.min((monthlySubTotal / myIncome) * 100, 999) : 0

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

      {/* Currency Selector */}
      <div style={sectionStyle}>
        <div style={labelStyle}>💱 VALUTA</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {currencies.map(c => (
            <button
              key={c.code}
              onClick={() => setCurrency(c.code)}
              style={{
                background: currency === c.code
                  ? 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))'
                  : '#0b1120',
                border: `1px solid ${currency === c.code ? '#00f0ff' : '#1e293b'}`,
                borderRadius: 10,
                padding: '10px 6px',
                cursor: 'pointer',
                textAlign: 'center',
                boxShadow: currency === c.code ? '0 0 10px rgba(0,240,255,0.2)' : 'none',
              }}
            >
              <div style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 16,
                fontWeight: 700,
                color: currency === c.code ? '#00f0ff' : '#64748b',
              }}>
                {c.symbol}
              </div>
              <div style={{
                fontSize: 10,
                color: currency === c.code ? '#00f0ff' : '#475569',
                marginTop: 2,
              }}>
                {c.code}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Invite Banner - always visible and prominent */}
      {household && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,240,255,0.12), rgba(0,240,255,0.04))',
          border: '1px solid rgba(0,240,255,0.3)',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 32 }}>🏠</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                {household.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                {members.length}/{household.max_members} medlemmar
              </div>
            </div>
          </div>

          <button
            onClick={copyInviteLink}
            style={{
              width: '100%',
              background: copied
                ? 'linear-gradient(135deg, #00ff87, #00cc6a)'
                : 'linear-gradient(135deg, #00f0ff, #0080ff)',
              border: 'none',
              borderRadius: 12,
              padding: '14px 0',
              color: '#020617',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(0,240,255,0.3)',
              transition: 'all 0.2s',
              marginBottom: 8,
            }}
          >
            {copied ? '✓ Länk kopierad!' : '📨 Bjud in till hushållet'}
          </button>

          <div style={{
            background: '#0b1120',
            borderRadius: 8,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              flex: 1,
              fontFamily: 'monospace',
              fontSize: 10,
              color: '#64748b',
              wordBreak: 'break-all',
              lineHeight: 1.4,
            }}>
              {inviteLink}
            </div>
            {isAdmin && (
              <button
                onClick={regenerateInviteCode}
                disabled={regenerating}
                style={{
                  background: 'rgba(255,107,107,0.1)',
                  border: '1px solid rgba(255,107,107,0.3)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'Outfit, sans-serif',
                  flexShrink: 0,
                }}
              >
                {regenerating ? '...' : '🔄 Ny kod'}
              </button>
            )}
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
                    min="0"
                    value={sharedCats[i].budget}
                    onChange={e => {
                      const updated = [...sharedCats]
                      updated[i] = { ...updated[i], budget: Math.max(0, parseFloat(e.target.value) || 0) }
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
                  <span style={{ fontSize: 11, color: '#64748b' }}>{symbol}</span>
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
                  <span style={{ fontSize: 12, fontFamily: 'Orbitron, sans-serif', color: '#00f0ff' }}>{cat.budget}{symbol}</span>
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
                  min="0"
                  value={personalCats[i].budget}
                  onChange={e => {
                    const updated = [...personalCats]
                    updated[i] = { ...updated[i], budget: Math.max(0, parseFloat(e.target.value) || 0) }
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
                <span style={{ fontSize: 11, color: '#64748b' }}>{symbol}</span>
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
                <span style={{ fontSize: 12, fontFamily: 'Orbitron, sans-serif', color: '#00ff87' }}>{cat.budget}{symbol}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Subscription Scanner */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={labelStyle}>🔄 PRENUMERATIONER</div>
          <button
            onClick={() => setShowAddSub(!showAddSub)}
            style={{
              background: 'rgba(255,121,198,0.1)',
              border: '1px solid rgba(255,121,198,0.3)',
              borderRadius: 8,
              padding: '4px 12px',
              color: '#ff79c6',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: 'Outfit, sans-serif',
            }}
          >
            {showAddSub ? 'Avbryt' : '+ Lägg till'}
          </button>
        </div>

        {/* Summary stats */}
        {subscriptions.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            {[
              { label: 'Per månad', value: `${monthlySubTotal.toFixed(0)}${symbol}`, color: '#ff79c6' },
              { label: 'Per år', value: `${yearlySubTotal.toFixed(0)}${symbol}`, color: '#ffd93d' },
              { label: 'Av inkomst', value: myIncome > 0 ? `${subPercentOfIncome.toFixed(1)}%` : '–', color: subPercentOfIncome > 15 ? '#ff6b6b' : '#00ff87' },
            ].map(s => (
              <div key={s.label} style={{
                flex: 1,
                background: '#0b1120',
                borderRadius: 10,
                padding: '8px 6px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Add new subscription form */}
        {showAddSub && (
          <div style={{
            background: '#0b1120',
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}>
            <input
              type="text"
              placeholder="Namn (t.ex. Netflix, Spotify...)"
              value={newSub.name}
              onChange={e => setNewSub({ ...newSub, name: e.target.value })}
              style={{
                width: '100%',
                background: '#020617',
                border: '1px solid #1e293b',
                borderRadius: 8,
                padding: '10px 12px',
                color: '#e2e8f0',
                fontFamily: 'Outfit, sans-serif',
                fontSize: 13,
                outline: 'none',
                marginBottom: 8,
              }}
              onFocus={e => e.target.style.borderColor = '#ff79c6'}
              onBlur={e => e.target.style.borderColor = '#1e293b'}
            />
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                type="number"
                placeholder="Belopp"
                value={newSub.amount}
                onChange={e => setNewSub({ ...newSub, amount: e.target.value })}
                style={{
                  flex: 1,
                  background: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: '10px 12px',
                  color: '#e2e8f0',
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 13,
                  outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = '#ff79c6'}
                onBlur={e => e.target.style.borderColor = '#1e293b'}
              />
              <select
                value={newSub.frequency}
                onChange={e => setNewSub({ ...newSub, frequency: e.target.value })}
                style={{
                  background: '#020617',
                  border: '1px solid #1e293b',
                  borderRadius: 8,
                  padding: '10px 8px',
                  color: '#e2e8f0',
                  fontFamily: 'Outfit, sans-serif',
                  fontSize: 12,
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="weekly">Veckovis</option>
                <option value="monthly">Månadsvis</option>
                <option value="quarterly">Kvartalsvis</option>
                <option value="yearly">Årsvis</option>
              </select>
            </div>
            <button
              onClick={addSubscription}
              disabled={!newSub.name || !newSub.amount}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #ff79c6, #ff5599)',
                border: 'none',
                borderRadius: 8,
                padding: '10px 0',
                color: '#020617',
                fontFamily: 'Outfit, sans-serif',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                opacity: !newSub.name || !newSub.amount ? 0.5 : 1,
              }}
            >
              Lägg till prenumeration
            </button>
          </div>
        )}

        {/* Subscription list */}
        {subscriptions.length === 0 ? (
          <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '12px 0' }}>
            Inga prenumerationer tillagda ännu. Lägg till dina för att se hur mycket de kostar!
          </div>
        ) : (
          subscriptions.map(sub => {
            const freqLabel = { weekly: '/vecka', monthly: '/mån', quarterly: '/kvartal', yearly: '/år' }[sub.frequency]
            const monthlyAmount = sub.frequency === 'yearly' ? sub.amount / 12
              : sub.frequency === 'quarterly' ? sub.amount / 3
              : sub.frequency === 'weekly' ? sub.amount * 4.33
              : sub.amount
            return (
              <div key={sub.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid #1e293b',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{sub.name}</div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {sub.amount}{symbol} {freqLabel}
                    {sub.frequency !== 'monthly' && (
                      <span style={{ color: '#ff79c6' }}> ({monthlyAmount.toFixed(0)}{symbol}/mån)</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => removeSubscription(sub.id)}
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
                  ✕
                </button>
              </div>
            )
          })
        )}

        {/* Warning if subscriptions are high */}
        {subPercentOfIncome > 15 && myIncome > 0 && (
          <div style={{
            marginTop: 12,
            background: 'rgba(255,107,107,0.08)',
            border: '1px solid rgba(255,107,107,0.2)',
            borderRadius: 10,
            padding: 10,
            fontSize: 12,
            color: '#ff6b6b',
            lineHeight: 1.4,
          }}>
            ⚠️ Dina prenumerationer tar {subPercentOfIncome.toFixed(0)}% av din inkomst. Experter rekommenderar max 10-15%.
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
