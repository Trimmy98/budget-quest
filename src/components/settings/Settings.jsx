import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget, useIncome, useExpenses } from '../../hooks/useExpenses'
import { useMonthlyBudgets } from '../../hooks/useBudgetStatus'
import { useCurrency } from '../../hooks/useCurrency'
import { useToast } from '../../context/ToastContext'
import Sentry from '../../lib/sentry'
import { getCurrentMonth, DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
import { useBalance } from '../../hooks/useBalance'

export default function Settings({ selectedMonth, onMonthChange }) {
  const { user, profile, household, refreshProfile } = useAuth()
  const { budget, refetch: refetchBudget } = useBudget()
  const { allIncome, myIncome, refetch: refetchIncome } = useIncome(selectedMonth)
  const { expenses, refetch: refetchExpenses } = useExpenses(selectedMonth)
  const { currency, symbol, setCurrency, currencies } = useCurrency()
  const { addToast } = useToast()
  const { budgets: monthlyBudgets, defaults: budgetDefaults, saveBudgets, saveDefaults, copyFromDefaults, copyFromPrevMonth } = useMonthlyBudgets(selectedMonth)
  const [members, setMembers] = useState([])
  const [copied, setCopied] = useState(false)
  const [editingMonthlyBudget, setEditingMonthlyBudget] = useState(false)
  const [monthlyAmounts, setMonthlyAmounts] = useState({})
  const [savingMonthly, setSavingMonthly] = useState(false)
  const [editingShared, setEditingShared] = useState(false)
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [sharedCats, setSharedCats] = useState([])
  const [personalCats, setPersonalCats] = useState([])
  const [saving, setSaving] = useState(false)
  const [regenerating, setRegenerating] = useState(false)

  // Startsaldo
  const { balance, loading: balanceLoading, saving: balanceSaving, isSet: balanceIsSet, events: balanceEvents, savingsTrackingStart, setStartingBalance, resetBalance, resetSavings, setSavingsDate, addEvent: addBalanceEvent, deleteEvent: deleteBalanceEvent } = useBalance()
  const [editingBalance, setEditingBalance] = useState(false)
  const [balanceInput, setBalanceInput] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [showAddAdjustment, setShowAddAdjustment] = useState(false)
  const [adjAmount, setAdjAmount] = useState('')
  const [adjNote, setAdjNote] = useState('')
  const [deletingEventId, setDeletingEventId] = useState(null)
  const [editingSavingsDate, setEditingSavingsDate] = useState(false)
  const [savingsDateInput, setSavingsDateInput] = useState('')
  const [confirmResetSavings, setConfirmResetSavings] = useState(false)

  // Transaction management
  const [editingEntry, setEditingEntry] = useState(null) // { type: 'expense'|'income', id, amount, description, category }
  const [showTransactions, setShowTransactions] = useState(false)

  // Subscriptions
  const [subscriptions, setSubscriptions] = useState([])
  const [showAddSub, setShowAddSub] = useState(false)
  const [newSub, setNewSub] = useState({ name: '', amount: '', frequency: 'monthly' })

  // Auto-copy budget defaults om inga budgets finns för denna månad
  useEffect(() => {
    if (monthlyBudgets && monthlyBudgets.length === 0 && budgetDefaults && Object.keys(budgetDefaults).length > 0) {
      copyFromDefaults().then(ok => {
        if (ok) addToast('Budgetar kopierade från dina defaults', 'info', '📋')
      })
    }
  }, [monthlyBudgets?.length, budgetDefaults])

  // Initiera monthlyAmounts från befintliga budgets
  useEffect(() => {
    if (monthlyBudgets && monthlyBudgets.length > 0) {
      const amounts = {}
      monthlyBudgets.forEach(b => { amounts[b.category] = Number(b.budget_amount) })
      setMonthlyAmounts(amounts)
    }
  }, [monthlyBudgets])

  useEffect(() => {
    if (user?.id) {
      const stored = localStorage.getItem(`subs_${user.id}`)
      if (stored) {
        const subs = JSON.parse(stored)
        setSubscriptions(subs)
        autoLogSubscriptions(subs)
      }
    }
  }, [user, profile?.household_id])

  function saveSubs(subs) {
    setSubscriptions(subs)
    if (user?.id) localStorage.setItem(`subs_${user.id}`, JSON.stringify(subs))
  }

  function getMonthlyAmount(sub) {
    if (sub.frequency === 'yearly') return sub.amount / 12
    if (sub.frequency === 'quarterly') return sub.amount / 3
    if (sub.frequency === 'weekly') return sub.amount * 4.33
    return sub.amount
  }

  async function autoLogSubscriptions(subs) {
    if (!profile?.household_id || !user?.id || subs.length === 0) return
    const month = getCurrentMonth()
    const firstOfMonth = `${month}-01`

    // Kolla i DB om prenumerationer redan loggats denna månad (säkrare än localStorage)
    const { data: existing } = await supabase
      .from('expenses')
      .select('description')
      .eq('household_id', profile.household_id)
      .eq('user_id', user.id)
      .eq('date', firstOfMonth)
      .like('description', '%(prenumeration)%')
    const existingNames = new Set((existing || []).map(e => e.description))

    for (const sub of subs) {
      const desc = `${sub.name} (prenumeration)`
      if (existingNames.has(desc)) continue // redan loggad
      const monthly = getMonthlyAmount(sub)
      const { error: subErr } = await supabase.from('expenses').insert({
        household_id: profile.household_id,
        user_id: user.id,
        date: firstOfMonth,
        amount: Math.round(monthly * 100) / 100,
        paid_amount: Math.round(monthly * 100) / 100,
        description: desc,
        category: 'misc',
        expense_type: 'personal',
      })
      if (subErr) { console.error('autoLogSubscription error:', subErr); Sentry.captureException(subErr) }
    }
  }

  async function logSubscriptionAsExpense(sub) {
    if (!profile?.household_id || !user?.id) return
    const today = new Date().toISOString().split('T')[0]
    const monthly = getMonthlyAmount(sub)
    const { error: logErr } = await supabase.from('expenses').insert({
      household_id: profile.household_id,
      user_id: user.id,
      date: today,
      amount: Math.round(monthly * 100) / 100,
      paid_amount: Math.round(monthly * 100) / 100,
      description: `${sub.name} (prenumeration)`,
      category: 'misc',
      expense_type: 'personal',
    })
    if (logErr) { console.error('logSubscriptionAsExpense error:', logErr); Sentry.captureException(logErr) }
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
    logSubscriptionAsExpense(sub)
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
  }, [profile?.household_id])

  useEffect(() => {
    const sc = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
    const pc = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
    setSharedCats(sc)
    setPersonalCats(pc)
  }, [budget])

  async function fetchMembers() {
    const { data } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
    setMembers(data || [])
  }

  async function copyInviteLink() {
    if (!household) return
    const link = `${window.location.origin}/join/${household.invite_code}`
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback för äldre webbläsare / nekad behörighet
      prompt('Kopiera länken:', link)
    }
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
    await supabase.from('gamification').delete().eq('user_id', memberId).eq('household_id', profile.household_id)
    await fetchMembers()
  }

  async function toggleAdmin(memberId) {
    if (!isAdmin || memberId === user.id) return
    const member = members.find(m => m.id === memberId)
    if (!member) return
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    const label = newRole === 'admin' ? 'admin' : 'medlem'
    if (!confirm(`Gör ${member.display_name} till ${label}?`)) return
    await supabase.from('profiles').update({ role: newRole }).eq('id', memberId)
    await fetchMembers()
  }

  async function saveSharedBudget() {
    setSaving(true)
    try {
      const query = supabase.from('budgets')
        .update({ shared_categories: sharedCats })
        .eq('household_id', profile.household_id)
      const q = budget?.updated_at ? query.eq('updated_at', budget.updated_at) : query
      const { data, error } = await q.select()
      if (error) { console.error('saveSharedBudget error:', error); Sentry.captureException(error); return }
      if (!data || data.length === 0) {
        addToast('Budgeten har ändrats av någon annan — ladda om sidan', 'error', '⚠️')
        await refetchBudget()
        return
      }
      await refetchBudget()
      setEditingShared(false)
    } finally {
      setSaving(false)
    }
  }

  async function savePersonalBudget() {
    setSaving(true)
    try {
      const query = supabase.from('budgets')
        .update({ personal_categories: personalCats })
        .eq('household_id', profile.household_id)
      const q = budget?.updated_at ? query.eq('updated_at', budget.updated_at) : query
      const { data, error } = await q.select()
      if (error) { console.error('savePersonalBudget error:', error); Sentry.captureException(error); return }
      if (!data || data.length === 0) {
        addToast('Budgeten har ändrats av någon annan — ladda om sidan', 'error', '⚠️')
        await refetchBudget()
        return
      }
      await refetchBudget()
      setEditingPersonal(false)
    } finally {
      setSaving(false)
    }
  }

  async function deleteExpense(id) {
    if (!confirm('Ta bort denna loggning?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) { console.error('deleteExpense error:', error); Sentry.captureException(error) }
    refetchExpenses()
  }

  async function deleteIncome(id) {
    if (!confirm('Ta bort denna inkomst?')) return
    const { error } = await supabase.from('income').delete().eq('id', id)
    if (error) { console.error('deleteIncome error:', error); Sentry.captureException(error) }
    refetchIncome()
  }

  async function saveEditEntry() {
    if (!editingEntry) return
    const { type, id, amount, description, category, paid_amount } = editingEntry
    const parsedAmount = parseFloat(amount)
    if (isNaN(parsedAmount) || parsedAmount <= 0) return

    if (type === 'income') {
      await supabase.from('income').update({
        amount: parsedAmount,
        description: description || '',
      }).eq('id', id)
      refetchIncome()
    } else {
      const updateData = {
        amount: parsedAmount,
        description: description || '',
        category,
      }
      // Om paid_amount finns (gemensam utgift), spara den också
      if (paid_amount !== undefined) {
        const parsedPaid = parseFloat(paid_amount)
        updateData.paid_amount = isNaN(parsedPaid) || parsedPaid < 0 ? parsedAmount : parsedPaid
      }
      await supabase.from('expenses').update(updateData).eq('id', id)
      refetchExpenses()
    }
    setEditingEntry(null)
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

      {/* Startsaldo */}
      <div style={sectionStyle}>
        <div style={labelStyle}>🏦 STARTSALDO</div>
        {balanceLoading ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>Laddar...</div>
        ) : balanceIsSet ? (
          <>
            {/* Beräknat saldo */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(0,255,135,0.06), rgba(0,240,255,0.04))',
              border: '1px solid rgba(0,255,135,0.15)',
              borderRadius: 14, padding: 14, marginBottom: 12, textAlign: 'center',
            }}>
              <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 4 }}>
                BERÄKNAT SALDO
              </div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900,
                color: Number(balance.current_balance) >= 0 ? '#00ff87' : '#ff6b6b',
              }}>
                {Number(balance.current_balance).toLocaleString('sv-SE', { maximumFractionDigits: 0 })} {symbol}
              </div>
              <div style={{ fontSize: 10, color: '#475569', marginTop: 4 }}>
                Baserat på startsaldo + justeringar + inkomst − utgifter
              </div>
            </div>

            {/* Saldo-historik */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 0.5, marginBottom: 8 }}>
                HÄNDELSER
              </div>
              {balanceEvents.map(ev => {
                const evDate = new Date(ev.created_at)
                const dateStr = evDate.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
                const amt = Number(ev.amount)
                const isPositive = amt >= 0
                const typeLabel = ev.type === 'initial' ? 'Startsaldo'
                  : ev.type === 'adjustment' ? 'Justering'
                  : 'Korrigering'
                const typeColor = ev.type === 'initial' ? '#00f0ff'
                  : ev.type === 'adjustment' ? '#a78bfa'
                  : '#f59e0b'

                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: '#0b1120', borderRadius: 10, padding: '8px 10px',
                    marginBottom: 4, border: '1px solid #1e293b',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{dateStr}</span>
                        <span style={{
                          fontSize: 9, color: typeColor, background: `${typeColor}15`,
                          padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                        }}>
                          {typeLabel}
                        </span>
                      </div>
                      {ev.note && (
                        <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {ev.note}
                        </div>
                      )}
                    </div>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700,
                      color: isPositive ? '#00ff87' : '#ff6b6b', flexShrink: 0,
                    }}>
                      {isPositive ? '+' : ''}{amt.toLocaleString('sv-SE')}{symbol}
                    </div>
                    {deletingEventId === ev.id ? (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={async () => {
                            try {
                              await deleteBalanceEvent(ev.id)
                              setDeletingEventId(null)
                              addToast('Händelse borttagen', 'info', '🏦')
                            } catch { addToast('Kunde inte ta bort', 'error') }
                          }}
                          style={{
                            background: '#ff6b6b', border: 'none', borderRadius: 6,
                            padding: '4px 8px', color: '#fff', fontSize: 10, fontWeight: 700,
                            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                          }}
                        >
                          Ja
                        </button>
                        <button
                          onClick={() => setDeletingEventId(null)}
                          style={{
                            background: 'transparent', border: '1px solid #334155', borderRadius: 6,
                            padding: '4px 8px', color: '#94a3b8', fontSize: 10,
                            cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                          }}
                        >
                          Nej
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeletingEventId(ev.id)}
                        style={{
                          background: 'none', border: 'none', color: '#334155',
                          cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0,
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Lägg till justering */}
            {showAddAdjustment ? (
              <div style={{ background: '#0b1120', borderRadius: 12, padding: 12, marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, marginBottom: 8 }}>
                  Ny justering
                </div>
                <input
                  type="number"
                  step="1"
                  value={adjAmount}
                  onChange={e => setAdjAmount(e.target.value)}
                  placeholder="Belopp (negativt = uttag)..."
                  style={{
                    width: '100%', background: '#020617', border: '1px solid #1e293b',
                    borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
                    fontFamily: 'Outfit, sans-serif', fontSize: 14, outline: 'none',
                    marginBottom: 6, boxSizing: 'border-box',
                  }}
                />
                <input
                  type="text"
                  value={adjNote}
                  onChange={e => setAdjNote(e.target.value)}
                  placeholder="Notering (valfri men rekommenderad)..."
                  style={{
                    width: '100%', background: '#020617', border: '1px solid #1e293b',
                    borderRadius: 8, padding: '10px 12px', color: '#e2e8f0',
                    fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
                    marginBottom: 8, boxSizing: 'border-box',
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={async () => {
                      const val = parseFloat(adjAmount)
                      if (isNaN(val) || val === 0) return
                      try {
                        await addBalanceEvent('adjustment', val, adjNote || null)
                        setShowAddAdjustment(false)
                        setAdjAmount('')
                        setAdjNote('')
                        addToast('Justering sparad', 'success', '🏦')
                      } catch { addToast('Kunde inte spara', 'error') }
                    }}
                    disabled={balanceSaving || !adjAmount || parseFloat(adjAmount) === 0}
                    style={{
                      flex: 1,
                      background: balanceSaving ? '#1e293b' : 'linear-gradient(135deg, #a78bfa, #7c3aed)',
                      border: 'none', borderRadius: 10, padding: '10px 0',
                      color: '#fff', fontWeight: 700, fontSize: 13,
                      cursor: balanceSaving ? 'not-allowed' : 'pointer',
                      fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    {balanceSaving ? 'Sparar...' : 'Spara justering'}
                  </button>
                  <button
                    onClick={() => { setShowAddAdjustment(false); setAdjAmount(''); setAdjNote('') }}
                    style={{
                      background: 'transparent', border: '1px solid #334155',
                      borderRadius: 10, padding: '10px 16px', color: '#94a3b8',
                      cursor: 'pointer', fontSize: 13, fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    Avbryt
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setShowAddAdjustment(true)}
                  style={{
                    flex: 1,
                    background: 'rgba(167,139,250,0.08)',
                    border: '1px solid rgba(167,139,250,0.2)',
                    borderRadius: 10, padding: '10px 0',
                    color: '#a78bfa', cursor: 'pointer', fontSize: 13,
                    fontWeight: 600, fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  + Justering
                </button>

                {/* Sätt nytt startsaldo */}
                {editingBalance ? (
                  <div style={{
                    flex: 1, background: '#0b1120', borderRadius: 10, padding: 10,
                  }}>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={balanceInput}
                      onChange={e => setBalanceInput(e.target.value)}
                      placeholder="Nytt saldo..."
                      style={{
                        width: '100%', background: '#020617', border: '1px solid #1e293b',
                        borderRadius: 8, padding: '8px 10px', color: '#e2e8f0',
                        fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
                        marginBottom: 4, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ fontSize: 9, color: '#f59e0b', marginBottom: 6 }}>
                      Lägger till en korrigering så saldot matchar.
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={async () => {
                          const val = parseFloat(balanceInput)
                          if (isNaN(val) || val < 0) return
                          try {
                            await setStartingBalance(val)
                            setEditingBalance(false)
                            setBalanceInput('')
                            addToast('Saldo korrigerat', 'success', '🏦')
                          } catch { addToast('Kunde inte korrigera', 'error') }
                        }}
                        disabled={balanceSaving || !balanceInput || parseFloat(balanceInput) < 0}
                        style={{
                          flex: 1,
                          background: balanceSaving ? '#1e293b' : 'linear-gradient(135deg, #f59e0b, #d97706)',
                          border: 'none', borderRadius: 8, padding: '8px 0',
                          color: '#020617', fontWeight: 700, fontSize: 11,
                          cursor: balanceSaving ? 'not-allowed' : 'pointer',
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => { setEditingBalance(false); setBalanceInput('') }}
                        style={{
                          background: 'transparent', border: '1px solid #334155',
                          borderRadius: 8, padding: '8px 10px', color: '#94a3b8',
                          cursor: 'pointer', fontSize: 11, fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingBalance(true)}
                    style={{
                      flex: 1,
                      background: 'rgba(245,158,11,0.08)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      borderRadius: 10, padding: '10px 0',
                      color: '#f59e0b', cursor: 'pointer', fontSize: 13,
                      fontWeight: 600, fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    Korrigera saldo
                  </button>
                )}
              </div>
            )}

            {/* Nollställ */}
            {confirmReset ? (
              <div style={{
                display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center',
                background: 'rgba(255,107,107,0.06)', border: '1px solid rgba(255,107,107,0.2)',
                borderRadius: 10, padding: '8px 12px', marginTop: 8,
              }}>
                <span style={{ fontSize: 11, color: '#ff6b6b' }}>
                  Radera alla händelser?
                </span>
                <button
                  onClick={async () => {
                    await resetBalance()
                    setConfirmReset(false)
                    addToast('Startsaldo nollställt', 'info', '🏦')
                  }}
                  style={{
                    background: '#ff6b6b', border: 'none', borderRadius: 8,
                    padding: '5px 12px', color: '#fff', fontWeight: 700, fontSize: 11,
                    cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  Ja, radera
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  style={{
                    background: 'transparent', border: '1px solid #334155', borderRadius: 8,
                    padding: '5px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  Avbryt
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmReset(true)}
                style={{
                  display: 'block', margin: '8px auto 0', background: 'none', border: 'none',
                  color: '#334155', cursor: 'pointer', fontSize: 11, fontFamily: 'Outfit, sans-serif',
                }}
              >
                Nollställ allt →
              </button>
            )}

            {/* Sparande-tracking */}
            <div style={{
              marginTop: 14, paddingTop: 12,
              borderTop: '1px solid #1e293b',
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 0.5, marginBottom: 8 }}>
                SPARANDE-TRACKING
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 8 }}>
                Trackas sedan: <span style={{ color: '#ffd93d', fontWeight: 600 }}>
                  {savingsTrackingStart
                    ? new Date(savingsTrackingStart).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
                    : new Date(balance.starting_balance_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
                  }
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {confirmResetSavings ? (
                  <div style={{
                    flex: 1, display: 'flex', gap: 6, alignItems: 'center',
                    background: 'rgba(255,217,61,0.06)', border: '1px solid rgba(255,217,61,0.2)',
                    borderRadius: 10, padding: '6px 10px',
                  }}>
                    <span style={{ fontSize: 11, color: '#ffd93d', flex: 1 }}>
                      Nollställa? Börjar räkna från idag.
                    </span>
                    <button
                      onClick={async () => {
                        try {
                          await resetSavings()
                          setConfirmResetSavings(false)
                          addToast('Sparande nollställt', 'success', '📊')
                        } catch { addToast('Kunde inte nollställa', 'error') }
                      }}
                      style={{
                        background: '#ffd93d', border: 'none', borderRadius: 8,
                        padding: '5px 12px', color: '#020617', fontWeight: 700, fontSize: 11,
                        cursor: 'pointer', fontFamily: 'Outfit, sans-serif', flexShrink: 0,
                      }}
                    >
                      Ja
                    </button>
                    <button
                      onClick={() => setConfirmResetSavings(false)}
                      style={{
                        background: 'transparent', border: '1px solid #334155', borderRadius: 8,
                        padding: '5px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11,
                        fontFamily: 'Outfit, sans-serif', flexShrink: 0,
                      }}
                    >
                      Nej
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmResetSavings(true)}
                    style={{
                      flex: 1, background: 'rgba(255,217,61,0.08)',
                      border: '1px solid rgba(255,217,61,0.2)',
                      borderRadius: 10, padding: '8px 0',
                      color: '#ffd93d', cursor: 'pointer', fontSize: 12,
                      fontWeight: 600, fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    Nollställ sparande
                  </button>
                )}
                {editingSavingsDate ? (
                  <div style={{
                    flex: 1, background: '#0b1120', borderRadius: 10, padding: 8,
                  }}>
                    <input
                      type="date"
                      value={savingsDateInput}
                      onChange={e => setSavingsDateInput(e.target.value)}
                      style={{
                        width: '100%', background: '#020617', border: '1px solid #1e293b',
                        borderRadius: 8, padding: '6px 8px', color: '#e2e8f0',
                        fontFamily: 'Outfit, sans-serif', fontSize: 12, outline: 'none',
                        marginBottom: 4, boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={async () => {
                          if (!savingsDateInput) return
                          try {
                            await setSavingsDate(savingsDateInput)
                            setEditingSavingsDate(false)
                            setSavingsDateInput('')
                            addToast('Spardatum uppdaterat', 'success', '📊')
                          } catch { addToast('Kunde inte uppdatera', 'error') }
                        }}
                        disabled={!savingsDateInput}
                        style={{
                          flex: 1, background: savingsDateInput ? '#ffd93d' : '#1e293b',
                          border: 'none', borderRadius: 8, padding: '6px 0',
                          color: '#020617', fontWeight: 700, fontSize: 11,
                          cursor: savingsDateInput ? 'pointer' : 'not-allowed',
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => { setEditingSavingsDate(false); setSavingsDateInput('') }}
                        style={{
                          background: 'transparent', border: '1px solid #334155', borderRadius: 8,
                          padding: '6px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11,
                          fontFamily: 'Outfit, sans-serif',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const d = savingsTrackingStart || balance.starting_balance_date
                      setSavingsDateInput(new Date(d).toISOString().split('T')[0])
                      setEditingSavingsDate(true)
                    }}
                    style={{
                      flex: 1, background: 'rgba(100,116,139,0.08)',
                      border: '1px solid #1e293b',
                      borderRadius: 10, padding: '8px 0',
                      color: '#94a3b8', cursor: 'pointer', fontSize: 12,
                      fontFamily: 'Outfit, sans-serif',
                    }}
                  >
                    Ändra datum
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>
              Sätt ditt kontosaldo för att tracka hur det förändras.
            </div>
            <input
              type="number"
              min="0"
              step="1"
              value={balanceInput}
              onChange={e => setBalanceInput(e.target.value)}
              placeholder="Ditt nuvarande kontosaldo..."
              style={{
                width: '100%', background: '#0b1120', border: '1px solid #1e293b',
                borderRadius: 10, padding: '12px 14px', color: '#e2e8f0',
                fontFamily: 'Outfit, sans-serif', fontSize: 16, outline: 'none',
                marginBottom: 10, boxSizing: 'border-box',
              }}
            />
            <button
              onClick={async () => {
                const val = parseFloat(balanceInput)
                if (isNaN(val) || val < 0) return
                try {
                  await setStartingBalance(val)
                  setBalanceInput('')
                  addToast('Startsaldo sparat!', 'success', '🏦')
                } catch { addToast('Kunde inte spara', 'error') }
              }}
              disabled={balanceSaving || !balanceInput || parseFloat(balanceInput) < 0}
              style={{
                width: '100%',
                background: balanceSaving ? '#1e293b' : 'linear-gradient(135deg, #00f0ff, #0080ff)',
                border: 'none', borderRadius: 12, padding: '12px 0',
                color: '#020617', fontWeight: 700, fontSize: 14,
                cursor: balanceSaving ? 'not-allowed' : 'pointer',
                fontFamily: 'Outfit, sans-serif',
              }}
            >
              {balanceSaving ? 'Sparar...' : 'Sätt startsaldo'}
            </button>
          </div>
        )}
      </div>

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
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => toggleAdmin(member.id)}
                  style={{
                    background: member.role === 'admin'
                      ? 'rgba(100,116,139,0.1)' : 'rgba(255,217,61,0.1)',
                    border: `1px solid ${member.role === 'admin' ? 'rgba(100,116,139,0.3)' : 'rgba(255,217,61,0.3)'}`,
                    borderRadius: 8,
                    padding: '4px 10px',
                    color: member.role === 'admin' ? '#94a3b8' : '#ffd93d',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontFamily: 'Outfit, sans-serif',
                  }}
                >
                  {member.role === 'admin' ? 'Ta bort admin' : '👑 Gör admin'}
                </button>
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
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ═══ MÅNADSBUDGET ═══ */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={labelStyle}>📊 MÅNADSBUDGET</div>
          <button
            onClick={() => setEditingMonthlyBudget(!editingMonthlyBudget)}
            style={{
              background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)',
              borderRadius: 8, padding: '6px 14px', color: '#00f0ff', fontSize: 12,
              fontFamily: 'Outfit, sans-serif', cursor: 'pointer', fontWeight: 600,
            }}
          >
            {editingMonthlyBudget ? 'Avbryt' : '✏️ Redigera'}
          </button>
        </div>

        {editingMonthlyBudget ? (
          <div>
            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                onClick={async () => {
                  setSavingMonthly(true)
                  const ok = await copyFromPrevMonth()
                  setSavingMonthly(false)
                  if (ok) addToast('Kopierat från förra månaden', 'success', '📋')
                  else addToast('Inga budgets förra månaden', 'info', '📋')
                }}
                style={{
                  background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8,
                  padding: '6px 12px', color: '#94a3b8', fontSize: 11,
                  fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                }}
              >
                📋 Kopiera förra månaden
              </button>
              {budgetDefaults && Object.keys(budgetDefaults).length > 0 && (
                <button
                  onClick={async () => {
                    setSavingMonthly(true)
                    await copyFromDefaults()
                    setSavingMonthly(false)
                    addToast('Defaults applicerade', 'success', '✅')
                  }}
                  style={{
                    background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8,
                    padding: '6px 12px', color: '#94a3b8', fontSize: 11,
                    fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                  }}
                >
                  🔄 Applicera defaults
                </button>
              )}
            </div>

            {/* Category inputs */}
            {[...(budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES),
              ...(budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES),
            ].map(cat => (
              <div key={cat.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
              }}>
                <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{cat.icon}</span>
                <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                <input
                  type="number"
                  value={monthlyAmounts[cat.id] || ''}
                  onChange={e => setMonthlyAmounts(prev => ({ ...prev, [cat.id]: e.target.value ? Number(e.target.value) : '' }))}
                  placeholder="0"
                  style={{
                    width: 80, background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8,
                    padding: '6px 10px', color: '#e2e8f0', fontSize: 13,
                    fontFamily: 'Orbitron, sans-serif', textAlign: 'right', outline: 'none',
                  }}
                />
                <span style={{ fontSize: 11, color: '#64748b', width: 14 }}>{symbol}</span>
              </div>
            ))}

            {/* Save buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                disabled={savingMonthly}
                onClick={async () => {
                  setSavingMonthly(true)
                  try {
                    const clean = {}
                    Object.entries(monthlyAmounts).forEach(([k, v]) => { if (v > 0) clean[k] = Number(v) })
                    await saveBudgets(clean)
                    addToast('Månadsbudget sparad', 'success', '✅')
                    setEditingMonthlyBudget(false)
                  } catch { addToast('Kunde inte spara', 'error', '❌') }
                  setSavingMonthly(false)
                }}
                style={{
                  flex: 1, background: 'linear-gradient(135deg, #00ff87, #00cc6a)',
                  border: 'none', borderRadius: 10, padding: '10px 0',
                  color: '#020617', fontWeight: 700, fontSize: 13,
                  fontFamily: 'Outfit, sans-serif', cursor: savingMonthly ? 'wait' : 'pointer',
                  opacity: savingMonthly ? 0.6 : 1,
                }}
              >
                {savingMonthly ? 'Sparar...' : 'Spara budget'}
              </button>
              <button
                disabled={savingMonthly}
                onClick={async () => {
                  setSavingMonthly(true)
                  try {
                    const clean = {}
                    Object.entries(monthlyAmounts).forEach(([k, v]) => { if (v > 0) clean[k] = Number(v) })
                    await saveBudgets(clean)
                    await saveDefaults(clean)
                    addToast('Sparad som default', 'success', '⭐')
                    setEditingMonthlyBudget(false)
                  } catch { addToast('Kunde inte spara', 'error', '❌') }
                  setSavingMonthly(false)
                }}
                style={{
                  flex: 1, background: '#0b1120', border: '1px solid #1e293b',
                  borderRadius: 10, padding: '10px 0',
                  color: '#ffd93d', fontWeight: 700, fontSize: 13,
                  fontFamily: 'Outfit, sans-serif', cursor: savingMonthly ? 'wait' : 'pointer',
                  opacity: savingMonthly ? 0.6 : 1,
                }}
              >
                {savingMonthly ? 'Sparar...' : '⭐ Spara som default'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {monthlyBudgets.length === 0 ? (
              <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '12px 0' }}>
                Ingen budget satt för denna månad. Tryck Redigera för att börja.
              </div>
            ) : (
              <div>
                {monthlyBudgets.map(b => {
                  const cat = [...(budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES),
                    ...(budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES),
                  ].find(c => c.id === b.category) || { icon: '📦', name: b.category }
                  return (
                    <div key={b.category} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                    }}>
                      <span style={{ fontSize: 14 }}>{cat.icon}</span>
                      <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                      <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                        {Number(b.budget_amount).toFixed(0)}{symbol}
                      </span>
                    </div>
                  )
                })}
                <div style={{ marginTop: 6, padding: '6px 0', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Totalt</span>
                  <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 900, color: '#00f0ff' }}>
                    {monthlyBudgets.reduce((s, b) => s + Number(b.budget_amount), 0).toFixed(0)}{symbol}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
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

      {/* Transaction Management */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showTransactions ? 12 : 0 }}>
          <div style={labelStyle}>📝 HANTERA LOGGNINGAR</div>
          <button
            onClick={() => setShowTransactions(!showTransactions)}
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
            {showTransactions ? 'Dölj' : 'Visa'}
          </button>
        </div>

        {showTransactions && (() => {
          const myExpenses = expenses.filter(e => e.user_id === user?.id && e.expense_type !== 'shared')
          const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
          const myIncomeEntries = allIncome.filter(i => i.user_id === user?.id)
          const allCats = [...(budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES),
                           ...(budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES)]
          const getMemberName = (uid) => {
            const m = members.find(m => m.id === uid)
            return m?.display_name || 'Okänd'
          }

          const renderExpenseRow = (exp, showMember) => {
            const cat = allCats.find(c => c.id === exp.category)
            const isOther = exp.user_id !== user?.id
            return (
              <div key={exp.id}>
                {editingEntry?.id === exp.id ? (
                  <div style={{
                    background: '#0b1120', borderRadius: 10, padding: 10, marginBottom: 6,
                    border: `1px solid ${exp.expense_type === 'shared' ? '#ff79c6' : '#00ff87'}`,
                  }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <input
                        type="number"
                        value={editingEntry.amount}
                        onChange={e => setEditingEntry({ ...editingEntry, amount: e.target.value })}
                        style={{
                          flex: 1, background: '#020617', border: '1px solid #1e293b', borderRadius: 8,
                          padding: '8px 10px', color: '#00ff87', fontFamily: 'Orbitron, sans-serif', fontSize: 13, outline: 'none',
                        }}
                      />
                      <span style={{ color: '#64748b', fontSize: 13, alignSelf: 'center' }}>{symbol}</span>
                    </div>
                    <input
                      type="text"
                      placeholder="Beskrivning"
                      value={editingEntry.description || ''}
                      onChange={e => setEditingEntry({ ...editingEntry, description: e.target.value })}
                      style={{
                        width: '100%', background: '#020617', border: '1px solid #1e293b', borderRadius: 8,
                        padding: '8px 10px', color: '#e2e8f0', fontFamily: 'Outfit, sans-serif', fontSize: 12, outline: 'none', marginBottom: 8,
                      }}
                    />
                    {/* Betalt av loggaren - bara för gemensamma utgifter */}
                    {exp.expense_type === 'shared' && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                          💳 Betalt av {getMemberName(exp.user_id)} ({symbol})
                        </div>
                        <input
                          type="number"
                          value={editingEntry.paid_amount ?? ''}
                          onChange={e => setEditingEntry({ ...editingEntry, paid_amount: e.target.value })}
                          placeholder={editingEntry.amount}
                          style={{
                            width: '100%', background: '#020617', border: '1px solid rgba(255,121,198,0.3)', borderRadius: 8,
                            padding: '8px 10px', color: '#ff79c6', fontFamily: 'Orbitron, sans-serif', fontSize: 13, outline: 'none',
                          }}
                        />
                        <div style={{ fontSize: 9, color: '#475569', marginTop: 3 }}>
                          Lämna tomt = betalade hela beloppet
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                      {(exp.expense_type === 'shared'
                        ? (budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES)
                        : (budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES)
                      ).map(c => (
                        <button key={c.id} onClick={() => setEditingEntry({ ...editingEntry, category: c.id })} style={{
                          background: editingEntry.category === c.id ? 'rgba(0,240,255,0.15)' : '#020617',
                          border: `1px solid ${editingEntry.category === c.id ? '#00f0ff' : '#1e293b'}`,
                          borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: 11, color: editingEntry.category === c.id ? '#00f0ff' : '#94a3b8',
                        }}>
                          {c.icon} {c.name}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={saveEditEntry} style={{
                        flex: 1, background: 'linear-gradient(135deg, #00f0ff, #00b4cc)', border: 'none', borderRadius: 8,
                        padding: '8px 0', color: '#020617', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                      }}>Spara</button>
                      <button onClick={() => setEditingEntry(null)} style={{
                        flex: 1, background: 'transparent', border: '1px solid #1e293b', borderRadius: 8,
                        padding: '8px 0', color: '#64748b', fontSize: 12, cursor: 'pointer',
                      }}>Avbryt</button>
                    </div>
                  </div>
                ) : (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                    borderBottom: '1px solid #1e293b',
                  }}>
                    <span style={{ fontSize: 16 }}>{cat?.icon || '📦'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.description || cat?.name || exp.category}
                      </div>
                      <div style={{ fontSize: 10, color: '#64748b' }}>
                        {exp.date}{showMember ? ` • ${isOther ? getMemberName(exp.user_id) : 'Du'}` : ''} • {exp.expense_type === 'shared' ? '👥' : '👤'}
                        {exp.expense_type === 'shared' && exp.paid_amount != null && Number(exp.paid_amount) !== Number(exp.amount) && (
                          <span style={{ color: '#ff79c6' }}> • 💳 {Number(exp.paid_amount).toFixed(0)}{symbol} betalt</span>
                        )}
                      </div>
                    </div>
                    <span style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 13, flexShrink: 0,
                      color: exp.expense_type === 'shared' ? '#ff79c6' : '#ff6b6b',
                    }}>
                      -{Number(exp.amount).toFixed(0)}{symbol}
                    </span>
                    <button onClick={() => setEditingEntry({
                      type: 'expense', id: exp.id, amount: exp.amount,
                      description: exp.description || '', category: exp.category,
                      ...(exp.expense_type === 'shared' ? { paid_amount: exp.paid_amount ?? exp.amount } : {}),
                    })} style={{
                      background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 6,
                      padding: '3px 8px', color: '#00f0ff', cursor: 'pointer', fontSize: 11, flexShrink: 0,
                    }}>✏️</button>
                    <button onClick={() => deleteExpense(exp.id)} style={{
                      background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 6,
                      padding: '3px 8px', color: '#ff6b6b', cursor: 'pointer', fontSize: 11, flexShrink: 0,
                    }}>✕</button>
                  </div>
                )}
              </div>
            )
          }

          return (
            <div>
              {/* Income entries */}
              {myIncomeEntries.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#ffd93d', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
                    💰 INKOMSTER ({selectedMonth})
                  </div>
                  {myIncomeEntries.map(inc => (
                    <div key={inc.id}>
                      {editingEntry?.id === inc.id ? (
                        <div style={{
                          background: '#0b1120',
                          borderRadius: 10,
                          padding: 10,
                          marginBottom: 6,
                          border: '1px solid #ffd93d',
                        }}>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                            <input
                              type="number"
                              value={editingEntry.amount}
                              onChange={e => setEditingEntry({ ...editingEntry, amount: e.target.value })}
                              style={{
                                flex: 1, background: '#020617', border: '1px solid #1e293b', borderRadius: 8,
                                padding: '8px 10px', color: '#ffd93d', fontFamily: 'Orbitron, sans-serif', fontSize: 13, outline: 'none',
                              }}
                            />
                            <span style={{ color: '#64748b', fontSize: 13, alignSelf: 'center' }}>{symbol}</span>
                          </div>
                          <input
                            type="text"
                            placeholder="Beskrivning"
                            value={editingEntry.description || ''}
                            onChange={e => setEditingEntry({ ...editingEntry, description: e.target.value })}
                            style={{
                              width: '100%', background: '#020617', border: '1px solid #1e293b', borderRadius: 8,
                              padding: '8px 10px', color: '#e2e8f0', fontFamily: 'Outfit, sans-serif', fontSize: 12, outline: 'none', marginBottom: 8,
                            }}
                          />
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={saveEditEntry} style={{
                              flex: 1, background: 'linear-gradient(135deg, #ffd93d, #f0c020)', border: 'none', borderRadius: 8,
                              padding: '8px 0', color: '#020617', fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            }}>Spara</button>
                            <button onClick={() => setEditingEntry(null)} style={{
                              flex: 1, background: 'transparent', border: '1px solid #1e293b', borderRadius: 8,
                              padding: '8px 0', color: '#64748b', fontSize: 12, cursor: 'pointer',
                            }}>Avbryt</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                          borderBottom: '1px solid #1e293b',
                        }}>
                          <span style={{ fontSize: 16 }}>💰</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, color: '#e2e8f0' }}>{inc.description || 'Inkomst'}</div>
                          </div>
                          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, color: '#ffd93d', marginRight: 8 }}>
                            +{Number(inc.amount).toFixed(0)}{symbol}
                          </span>
                          <button onClick={() => setEditingEntry({ type: 'income', id: inc.id, amount: inc.amount, description: inc.description || '' })} style={{
                            background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.2)', borderRadius: 6,
                            padding: '3px 8px', color: '#00f0ff', cursor: 'pointer', fontSize: 11,
                          }}>✏️</button>
                          <button onClick={() => deleteIncome(inc.id)} style={{
                            background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: 6,
                            padding: '3px 8px', color: '#ff6b6b', cursor: 'pointer', fontSize: 11,
                          }}>✕</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Shared expense entries (all members) */}
              {sharedExpenses.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: '#ff79c6', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
                    👥 GEMENSAMMA UTGIFTER ({selectedMonth})
                  </div>
                  {sharedExpenses.map(exp => renderExpenseRow(exp, true))}
                </div>
              )}

              {/* Personal expense entries (own only) */}
              {myExpenses.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: '#00ff87', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
                    👤 PERSONLIGA UTGIFTER ({selectedMonth})
                  </div>
                  {myExpenses.map(exp => renderExpenseRow(exp, false))}
                </div>
              )}

              {myExpenses.length === 0 && sharedExpenses.length === 0 && myIncomeEntries.length === 0 && (
                <div style={{ fontSize: 12, color: '#475569', textAlign: 'center', padding: '12px 0' }}>
                  Inga loggningar för {selectedMonth}
                </div>
              )}
            </div>
          )
        })()}
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
