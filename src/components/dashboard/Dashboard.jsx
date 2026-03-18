import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { useBudgetStatus } from '../../hooks/useBudgetStatus'
import { useWeeklyReport } from '../../hooks/useWeeklyReport'
import { getLevelInfo, getMonthGrade, getCurrentMonth, DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
import { useCurrency } from '../../hooks/useCurrency'
import ProgressRing from '../shared/ProgressRing'
import ProgressBar from '../shared/ProgressBar'
import Sentry from '../../lib/sentry'

export default function Dashboard({ gamification, allGamification, selectedMonth }) {
  const { user, profile } = useAuth()
  const { expenses } = useExpenses(selectedMonth)
  const { budget, refetch: refetchBudget } = useBudget()
  const { budgetStatus } = useBudgetStatus(selectedMonth)
  const { allIncome, myIncome } = useIncome(selectedMonth)
  const weeklyReport = useWeeklyReport()
  const { symbol } = useCurrency()
  const [members, setMembers] = useState([])
  const [showPaymentForm, setShowPaymentForm] = useState(false)
  const [submittingPayment, setSubmittingPayment] = useState(false)
  const [debtPaymentAmount, setDebtPaymentAmount] = useState('')
  const [debtPaymentNote, setDebtPaymentNote] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [showAllPayments, setShowAllPayments] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [editingPaymentId, setEditingPaymentId] = useState(null)
  const [editAmount, setEditAmount] = useState('')
  const [editNote, setEditNote] = useState('')
  const [showAllBudgetCats, setShowAllBudgetCats] = useState(false)
  const [showAllSharedExpenses, setShowAllSharedExpenses] = useState(false)
  const [allTimeSharedExpenses, setAllTimeSharedExpenses] = useState([])

  // Skulddata från calculate_debt() RPC
  const [debtData, setDebtData] = useState(null)

  useEffect(() => {
    if (profile?.household_id) fetchMembers()
  }, [profile?.household_id])

  useEffect(() => {
    if (!profile?.household_id) return
    fetchDebtData()
    fetchAllTimeShared()
    const expChannel = supabase
      .channel(`alltime-shared-${profile.household_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'expenses',
        filter: `household_id=eq.${profile.household_id}`,
      }, () => { fetchDebtData(); fetchAllTimeShared() })
      .subscribe()
    const debtChannel = supabase
      .channel(`debt-payments-${profile.household_id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'debt_payments',
        filter: `household_id=eq.${profile.household_id}`,
      }, () => { fetchDebtData() })
      .subscribe()
    return () => {
      supabase.removeChannel(expChannel)
      supabase.removeChannel(debtChannel)
    }
  }, [profile?.household_id])

  async function fetchDebtData() {
    const { data, error } = await supabase.rpc('calculate_debt')
    if (error) { console.error('calculate_debt error:', error); Sentry.captureException(error) }
    setDebtData(data || null)
  }

  async function fetchAllTimeShared() {
    const { data, error } = await supabase
      .from('expenses')
      .select('id, user_id, description, amount, date, created_at')
      .eq('household_id', profile.household_id)
      .eq('expense_type', 'shared')
      .order('created_at', { ascending: false })
    if (error) { console.error('fetchAllTimeShared error:', error); Sentry.captureException(error) }
    setAllTimeSharedExpenses(data || [])
  }

  async function handleRegisterPayment(fromId, toId, maxDebt) {
    const amount = parseFloat(debtPaymentAmount)
    setPaymentError('')
    if (!amount || amount <= 0) { setPaymentError('Ange ett belopp större än 0'); return }
    if (amount > maxDebt + 0.01) { setPaymentError(`Beloppet kan inte vara mer än skulden (${Math.round(maxDebt)}${symbol})`); return }
    setSubmittingPayment(true)
    try {
      const { error: rpcErr } = await supabase.rpc('register_debt_payment', {
        from_user_id: fromId,
        to_user_id: toId,
        payment_amount: amount,
        payment_note: debtPaymentNote.trim() || null,
      })
      if (rpcErr) throw rpcErr
      setShowPaymentForm(false)
      setDebtPaymentAmount('')
      setDebtPaymentNote('')
      setPaymentError('')
      setPaymentSuccess(true)
      setTimeout(() => setPaymentSuccess(false), 2000)
      await fetchDebtData()
    } catch (err) {
      console.error('Kunde inte spara betalning:', err); Sentry.captureException(err)
      setPaymentError('Något gick fel — försök igen')
    } finally {
      setSubmittingPayment(false)
    }
  }

  async function handleDeletePayment(paymentId) {
    const { error } = await supabase
      .from('debt_payments')
      .delete()
      .eq('id', paymentId)
    if (error) { console.error('deletePayment error:', error); Sentry.captureException(error) }
    setConfirmDeleteId(null)
    await fetchDebtData()
  }

  async function handleUpdatePayment(paymentId) {
    const amount = parseFloat(editAmount)
    if (!amount || amount <= 0) return
    const { error } = await supabase.rpc('update_debt_payment', {
      payment_id: paymentId,
      new_amount: amount,
      new_note: editNote.trim() || null,
    })
    if (error) { console.error('updatePayment error:', error); Sentry.captureException(error) }
    setEditingPaymentId(null)
    setEditAmount('')
    setEditNote('')
    await fetchDebtData()
  }

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('household_id', profile.household_id)
    if (error) { console.error('fetchMembers error:', error); Sentry.captureException(error) }
    setMembers(data || [])
  }

  // Hämta förra månadens utgifter för jämförelse
  const [prevExpenses, setPrevExpenses] = useState([])
  useEffect(() => {
    if (profile?.household_id && selectedMonth) {
      const [y, m] = selectedMonth.split('-').map(Number)
      const prevDate = new Date(y, m - 2, 1) // month - 1 (0-indexed) - 1 (previous)
      const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`
      const startDate = `${prevMonth}-01`
      const endDate = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).toISOString().split('T')[0]
      supabase.from('expenses').select('*')
        .eq('household_id', profile.household_id)
        .gte('date', startDate).lte('date', endDate)
        .then(({ data, error }) => {
          if (error) { console.error('fetchPrevExpenses error:', error); Sentry.captureException(error) }
          setPrevExpenses(data || [])
        })
    }
  }, [profile, selectedMonth])

  const memberCount = members.length || 1
  const myExpenses = expenses.filter(e => e.user_id === user?.id)
  const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
  const personalExpenses = myExpenses.filter(e => e.expense_type === 'personal')

  const sharedTotal = sharedExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const myShareOfShared = sharedTotal / memberCount
  const myPersonalTotal = personalExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const totalSpent = myShareOfShared + myPersonalTotal
  const mySaved = myIncome - totalSpent
  const savingsRate = myIncome > 0 ? mySaved / myIncome : 0

  const { grade, color: gradeColor } = getMonthGrade(savingsRate)
  const levelInfo = gamification ? getLevelInfo(gamification.xp) : null

  const daysInMonth = new Date(
    parseInt(selectedMonth.split('-')[0]),
    parseInt(selectedMonth.split('-')[1]),
    0
  ).getDate()
  const currentDay = new Date().getDate()
  const isCurrentMonth = selectedMonth === getCurrentMonth()
  const daysLeft = isCurrentMonth ? daysInMonth - currentDay + 1 : 0

  const sharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const personalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const totalBudget = sharedCats.reduce((s, c) => s + c.budget, 0) / memberCount +
    personalCats.reduce((s, c) => s + c.budget, 0)
  const remainingBudget = totalBudget - totalSpent
  const perDay = daysLeft > 0 ? remainingBudget / daysLeft : 0

  const streak = gamification?.streak_current || 0
  const badgeCount = gamification?.achievements?.length || 0

  // Skuldsaldo från server-side calculate_debt() RPC
  const debtMembers = debtData?.members || []
  const debtPayments = debtData?.payments || []
  const memberBalances = debtMembers.map(m => ({
    id: m.user_id,
    name: m.display_name || 'Okänd',
    paid: m.my_shared_total,
    fairShare: m.fair_share,
    expenseBalance: m.expense_balance,
    paymentAdjustment: m.payment_adjustment,
    balance: m.net_balance,
  }))

  // Category spending
  const categorySpend = {}
  sharedExpenses.forEach(e => {
    categorySpend[e.category] = (categorySpend[e.category] || 0) + Number(e.amount)
  })
  const personalCategorySpend = {}
  personalExpenses.forEach(e => {
    personalCategorySpend[e.category] = (personalCategorySpend[e.category] || 0) + Number(e.amount)
  })

  // Leaderboard
  const leaderboard = allGamification
    .map(g => {
      const member = members.find(m => m.id === g.user_id)
      const memberIncomeEntries = allIncome.filter(i => i.user_id === g.user_id)
      const memberIncome = memberIncomeEntries.reduce((sum, i) => sum + Number(i.amount), 0)
      const memberShared = sharedTotal / memberCount
      const memberPersonal = expenses.filter(e => e.user_id === g.user_id && e.expense_type === 'personal')
        .reduce((sum, e) => sum + Number(e.amount), 0)
      const saved = memberIncome - memberShared - memberPersonal
      const rate = memberIncome > 0 ? saved / memberIncome : 0
      const li = getLevelInfo(g.xp)
      return {
        ...g,
        displayName: member?.display_name || 'Okänd',
        level: li.level,
        title: li.title,
        savingsRate: rate,
      }
    })
    .sort((a, b) => b.xp - a.xp)

  const weeklyChallenge = budget?.weekly_challenge
  // Visa bara egna utgifter + delade (inte andras personliga)
  const recentExpenses = expenses.filter(e =>
    e.expense_type === 'shared' || e.user_id === user?.id
  ).slice(0, 5)
  const allCats = [...sharedCats, ...personalCats]

  return (
    <div style={{ padding: '16px 16px 24px' }}>

      {/* ═══ HERO: Level + Grade + Stats ═══ */}
      <div style={{
        background: 'linear-gradient(145deg, #0f172a 0%, #1a1040 50%, #0f172a 100%)',
        border: '1px solid rgba(0,240,255,0.15)',
        borderRadius: 24,
        padding: '20px 16px',
        marginBottom: 14,
        boxShadow: '0 4px 30px rgba(0,240,255,0.06)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Subtle glow background */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 120, height: 120,
          background: `radial-gradient(circle, ${gradeColor}15, transparent 70%)`,
          borderRadius: '50%',
        }} />

        {/* Top row: Level ring + info + grade */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, position: 'relative' }}>
          {levelInfo && (
            <ProgressRing progress={levelInfo.progress} size={64} strokeWidth={4} color="#00f0ff">
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 900,
                color: '#00f0ff', textShadow: '0 0 12px rgba(0,240,255,0.8)',
              }}>
                {levelInfo.level}
              </div>
            </ProgressRing>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5 }}>
              LVL {levelInfo?.level || 1}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0', lineHeight: 1.2, marginBottom: 4 }}>
              {levelInfo?.title || 'Budget Noob'}
            </div>
            {levelInfo && (
              <>
                <ProgressBar value={levelInfo.xpInLevel} max={levelInfo.xpNeeded} color="#00f0ff" height={3} />
                <div style={{ fontSize: 10, color: '#475569', marginTop: 3 }}>
                  {levelInfo.xpInLevel}/{levelInfo.xpNeeded} XP
                </div>
              </>
            )}
          </div>
          {/* Grade badge */}
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: `linear-gradient(135deg, ${gradeColor}20, ${gradeColor}08)`,
            border: `2px solid ${gradeColor}60`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            boxShadow: `0 0 20px ${gradeColor}20`,
            flexShrink: 0,
          }}>
            <div style={{
              fontFamily: 'Orbitron, sans-serif', fontSize: 26, fontWeight: 900,
              color: gradeColor, lineHeight: 1,
              textShadow: `0 0 15px ${gradeColor}80`,
            }}>{grade}</div>
            <div style={{ fontSize: 7, color: gradeColor, fontFamily: 'Orbitron, sans-serif', letterSpacing: 0.5, marginTop: 1 }}>BETYG</div>
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
          {[
            { icon: '🔥', value: streak, label: 'Streak', color: '#ff79c6' },
            { icon: '💰', value: `${perDay.toFixed(0)}`, label: `${symbol}/dag kvar`, color: perDay >= 0 ? '#00ff87' : '#ff6b6b' },
            { icon: '🏅', value: badgeCount, label: 'Badges', color: '#ffd93d' },
            { icon: '📊', value: `${(savingsRate * 100).toFixed(0)}%`, label: 'Sparkvot', color: savingsRate >= 0.2 ? '#00ff87' : savingsRate >= 0 ? '#ffd93d' : '#ff6b6b' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: 'rgba(2,6,23,0.6)', borderRadius: 12,
              padding: '8px 4px', textAlign: 'center',
              border: '1px solid rgba(30,41,59,0.6)',
            }}>
              <div style={{ fontSize: 12, marginBottom: 2 }}>{s.icon}</div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700,
                color: s.color, lineHeight: 1,
              }}>{s.value}</div>
              <div style={{ fontSize: 8, color: '#475569', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ FINANSÖVERSIKT ═══ */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
        marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 14 }}>
          FINANSÖVERSIKT
        </div>

        {/* Big saved number */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Sparat denna månad</div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif', fontSize: 32, fontWeight: 900,
            color: mySaved >= 0 ? '#00ff87' : '#ff6b6b',
            textShadow: mySaved >= 0 ? '0 0 25px rgba(0,255,135,0.4)' : '0 0 25px rgba(255,107,107,0.4)',
            lineHeight: 1,
          }}>
            {mySaved >= 0 ? '+' : ''}{mySaved.toFixed(0)}{symbol}
          </div>
        </div>

        {/* Breakdown bars */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {[
            { label: 'Inkomst', amount: myIncome, color: '#00ff87', icon: '💰' },
            { label: 'Gemensamt', amount: myShareOfShared, color: '#ff79c6', icon: '👥' },
            { label: 'Personligt', amount: myPersonalTotal, color: '#a78bfa', icon: '👤' },
          ].map(item => (
            <div key={item.label} style={{
              flex: 1, background: '#0b1120', borderRadius: 12, padding: '10px 8px',
              border: '1px solid #1e293b',
            }}>
              <div style={{ fontSize: 11, marginBottom: 4 }}>{item.icon}</div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700,
                color: item.color, lineHeight: 1, marginBottom: 3,
              }}>
                {item.amount.toFixed(0)}{symbol}
              </div>
              <div style={{ fontSize: 9, color: '#475569' }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* Prognos */}
        {myIncome > 0 && isCurrentMonth && currentDay > 3 && (() => {
          const dailyRate = totalSpent / currentDay
          const projectedSpend = dailyRate * daysInMonth
          const projectedSaved = myIncome - projectedSpend
          const projectedRate = myIncome > 0 ? projectedSaved / myIncome : 0
          // Trend baseras på sparkvot: positiv = bra, negativ = dåligt
          const trend = projectedRate >= 0.2 ? 'up' : projectedRate >= 0 ? 'flat' : 'down'
          return (
            <div style={{
              background: 'rgba(2,6,23,0.6)', borderRadius: 12, padding: '10px 12px',
              marginBottom: 12, border: '1px solid #1e293b',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>{projectedSaved >= 0 ? '🔮' : '⚠️'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Prognos vid månadens slut</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 700,
                    color: projectedSaved >= 0 ? '#00ff87' : '#ff6b6b',
                  }}>
                    {projectedSaved >= 0 ? '+' : ''}{projectedSaved.toFixed(0)}{symbol}
                  </span>
                  <span style={{ fontSize: 10, color: '#475569' }}>
                    ({(projectedRate * 100).toFixed(0)}% sparkvot)
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 14 }}>
                {trend === 'up' ? '📈' : trend === 'down' ? '📉' : '➡️'}
              </span>
            </div>
          )
        })()}

        {/* Income bar visualization */}
        {myIncome > 0 && (
          <div style={{ borderRadius: 8, overflow: 'hidden', height: 8, background: '#0b1120', display: 'flex' }}>
            <div style={{
              width: `${Math.min((myShareOfShared / myIncome) * 100, 100)}%`,
              background: '#ff79c6', transition: 'width 0.5s ease',
            }} />
            <div style={{
              width: `${Math.min((myPersonalTotal / myIncome) * 100, 100)}%`,
              background: '#a78bfa', transition: 'width 0.5s ease',
            }} />
            <div style={{ flex: 1, background: 'rgba(0,255,135,0.3)' }} />
          </div>
        )}
      </div>

      {/* ═══ BUDGET BURN RATE ═══ */}
      {budgetStatus && budgetStatus.categories?.length > 0 && (() => {
        const t = budgetStatus.totals
        const cats = budgetStatus.categories
        const daysLeft = budgetStatus.days_left
        const pct = Number(t.household_pct) || 0
        const barColor = pct > 90 ? '#ff6b6b' : pct > 75 ? '#ff9f43' : pct > 50 ? '#ffd93d' : '#00ff87'
        const warnings = cats.filter(c => c.household_status === 'warning' || c.household_status === 'over_budget')
        const visibleCats = showAllBudgetCats ? cats : cats.slice(0, 5)

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #15132a)',
            border: '1px solid #1e293b', borderRadius: 20, padding: 16, marginBottom: 14,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 28 }}>📊</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif', color: '#e2e8f0', letterSpacing: 1 }}>
                  MÅNADSBUDGET
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {daysLeft > 0 ? `${daysLeft} dagar kvar` : 'Månaden avslutad'}
                </div>
              </div>
            </div>

            {/* Total remaining + daily */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{
                flex: 1, background: '#0b1120', borderRadius: 12, padding: '10px 12px',
                border: '1px solid #1e293b', textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Kvar</div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                  color: Number(t.household_remaining) >= 0 ? '#00ff87' : '#ff6b6b',
                }}>
                  {Number(t.household_remaining).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}
                </div>
              </div>
              <div style={{
                flex: 1, background: '#0b1120', borderRadius: 12, padding: '10px 12px',
                border: '1px solid #1e293b', textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, color: '#64748b', marginBottom: 3 }}>Daglig budget</div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                  color: Number(t.daily_allowance) > 0 ? '#00f0ff' : '#ff6b6b',
                }}>
                  {Number(t.daily_allowance).toFixed(0)}{symbol}<span style={{ fontSize: 12, color: '#64748b' }}>/dag</span>
                </div>
              </div>
            </div>

            {/* Total progress bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#94a3b8' }}>
                  {Number(t.household_spent).toFixed(0)} / {Number(t.budget).toFixed(0)}{symbol}
                </span>
                <span style={{ fontSize: 10, color: barColor, fontWeight: 700 }}>{pct.toFixed(0)}%</span>
              </div>
              <div style={{ borderRadius: 6, overflow: 'hidden', height: 8, background: '#0b1120' }}>
                <div style={{
                  width: `${Math.min(pct, 100)}%`,
                  height: '100%', borderRadius: 6,
                  background: `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
                  boxShadow: `0 0 8px ${barColor}40`,
                  transition: 'width 0.5s ease',
                }} />
              </div>
            </div>

            {/* Varningar */}
            {warnings.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                {warnings.map(w => {
                  const cat = allCats.find(c => c.id === w.category) || { icon: '📦', name: w.category }
                  const isOver = w.household_status === 'over_budget'
                  const overAmount = Number(w.household_spent) - Number(w.budget_amount)
                  return (
                    <div key={w.category} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px',
                      background: isOver ? 'rgba(255,107,107,0.08)' : 'rgba(255,159,67,0.08)',
                      border: `1px solid ${isOver ? 'rgba(255,107,107,0.2)' : 'rgba(255,159,67,0.2)'}`,
                      borderRadius: 8, marginBottom: 4, fontSize: 11,
                    }}>
                      <span>{cat.icon}</span>
                      <span style={{ color: isOver ? '#ff6b6b' : '#ff9f43', fontWeight: 600 }}>
                        {cat.name}: {isOver
                          ? `Över med ${overAmount.toFixed(0)}${symbol}`
                          : `${Number(w.household_pct).toFixed(0)}% — sakta ner!`
                        }
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Per-kategori */}
            {visibleCats.map(c => {
              const cat = allCats.find(ct => ct.id === c.category) || { icon: '📦', name: c.category }
              const cpct = Number(c.household_pct) || 0
              const cColor = cpct > 90 ? '#ff6b6b' : cpct > 75 ? '#ff9f43' : cpct > 50 ? '#ffd93d' : '#00ff87'
              const isOver = c.household_status === 'over_budget'
              return (
                <div key={c.category} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ fontSize: 13 }}>{cat.icon}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                    <span style={{ fontSize: 11, fontFamily: 'Orbitron, sans-serif', fontWeight: 700, color: isOver ? '#ff6b6b' : '#e2e8f0' }}>
                      {Number(c.household_spent).toFixed(0)} / {Number(c.budget_amount).toFixed(0)}{symbol}
                    </span>
                    {Number(c.daily_allowance) > 0 && daysLeft > 0 && (
                      <span style={{ fontSize: 9, color: '#64748b', marginLeft: 4 }}>
                        {Number(c.daily_allowance).toFixed(0)}/dag
                      </span>
                    )}
                  </div>
                  <div style={{ borderRadius: 4, overflow: 'hidden', height: 4, background: '#0b1120' }}>
                    <div style={{
                      width: `${Math.min(cpct, 100)}%`, height: '100%', borderRadius: 4,
                      background: cColor, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              )
            })}

            {cats.length > 5 && (
              <button onClick={() => setShowAllBudgetCats(!showAllBudgetCats)} style={{
                background: 'none', border: 'none', color: '#00f0ff', fontSize: 11,
                fontFamily: 'Outfit, sans-serif', cursor: 'pointer', padding: '6px 0',
                fontWeight: 600,
              }}>
                {showAllBudgetCats ? 'Visa färre' : `Visa alla kategorier (${cats.length})`}
              </button>
            )}
          </div>
        )
      })()}

      {/* ═══ VECKORAPPORT ═══ */}
      {(() => {
        const wr = weeklyReport
        const r = wr.report
        const d = r?.data
        const hasBudgets = d?.budget_status?.length > 0

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1a1040)',
            border: '1px solid #1e293b', borderRadius: 20, padding: 16, marginBottom: 14,
          }}>
            {/* Header + navigation */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <button onClick={wr.goBack} style={{
                background: 'none', border: 'none', color: '#00f0ff', fontSize: 20,
                cursor: 'pointer', padding: '4px 8px',
              }}>←</button>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif',
                  color: '#e2e8f0', letterSpacing: 1,
                }}>
                  📋 VECKORAPPORT
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  V.{wr.weekNumber} ({wr.dateRange})
                </div>
              </div>
              <button onClick={wr.goForward} disabled={!wr.canGoForward} style={{
                background: 'none', border: 'none', fontSize: 20, padding: '4px 8px',
                color: wr.canGoForward ? '#00f0ff' : '#1e293b',
                cursor: wr.canGoForward ? 'pointer' : 'default',
              }}>→</button>
            </div>

            {wr.loading ? (
              <div style={{ textAlign: 'center', padding: 30, color: '#64748b' }}>Genererar rapport...</div>
            ) : !d || d.expense_count === 0 ? (
              <div style={{
                textAlign: 'center', padding: '24px 16px', color: '#475569', fontSize: 13,
              }}>
                Inga utgifter loggade denna vecka
              </div>
            ) : (
              <>
                {/* Total spenderat */}
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 32, fontWeight: 900,
                    color: '#e2e8f0',
                  }}>
                    {Number(d.total_spent).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}
                  </div>

                  {/* Jämförelse */}
                  {d.vs_last_week && (
                    <div style={{
                      fontSize: 12, fontWeight: 600, marginTop: 4,
                      color: d.vs_last_week.direction === 'more' ? '#ff6b6b' : '#00ff87',
                    }}>
                      {d.vs_last_week.direction === 'more' ? '↑' : '↓'}{' '}
                      {Math.abs(Number(d.vs_last_week.total_diff_percent)).toFixed(0)}%{' '}
                      {d.vs_last_week.direction === 'more' ? 'mer' : 'mindre'} än förra veckan
                      <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 4 }}>
                        ({d.vs_last_week.direction === 'more' ? '+' : ''}{Number(d.vs_last_week.total_diff_amount).toFixed(0)}{symbol})
                      </span>
                    </div>
                  )}
                </div>

                {/* Snabb-stats */}
                <div style={{
                  display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 12,
                  fontSize: 11, color: '#94a3b8',
                }}>
                  <span>{d.expense_count} utgifter</span>
                  <span>•</span>
                  <span>{Number(d.avg_per_day).toFixed(0)}{symbol}/dag i snitt</span>
                </div>

                {/* Proportionell bar: gemensamt vs personligt */}
                {Number(d.total_spent) > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ borderRadius: 8, overflow: 'hidden', height: 20, display: 'flex', background: '#0b1120' }}>
                      {Number(d.total_shared) > 0 && (
                        <div style={{
                          width: `${Number(d.total_shared) / Number(d.total_spent) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #ff79c6, #ff5599)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: '#020617',
                          overflow: 'hidden', whiteSpace: 'nowrap',
                        }}>
                          {Number(d.total_shared) / Number(d.total_spent) * 100 > 25 && `Gemensamt ${Number(d.total_shared).toFixed(0)}${symbol}`}
                        </div>
                      )}
                      {Number(d.total_personal) > 0 && (
                        <div style={{
                          width: `${Number(d.total_personal) / Number(d.total_spent) * 100}%`,
                          height: '100%',
                          background: 'linear-gradient(135deg, #a78bfa, #8b5cf6)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 9, fontWeight: 700, color: '#020617',
                          overflow: 'hidden', whiteSpace: 'nowrap',
                        }}>
                          {Number(d.total_personal) / Number(d.total_spent) * 100 > 25 && `Personligt ${Number(d.total_personal).toFixed(0)}${symbol}`}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Per-member breakdown */}
                {d.per_member?.length > 1 && (
                  <div style={{ marginBottom: 12 }}>
                    {d.per_member.map(m => (
                      <div key={m.user_id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '4px 0', fontSize: 12,
                      }}>
                        <span style={{ color: '#94a3b8' }}>
                          {m.user_id === user?.id ? '👤' : '👥'} {m.name}
                        </span>
                        <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                          {(Number(m.shared_paid) + Number(m.personal)).toFixed(0)}{symbol}
                          <span style={{ color: '#64748b', fontWeight: 400, fontSize: 9, marginLeft: 4 }}>
                            ({Number(m.shared_paid).toFixed(0)} gem + {Number(m.personal).toFixed(0)} pers)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Topp kategorier */}
                {d.top_categories?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Topp kategorier</div>
                    {d.top_categories.slice(0, 3).map(tc => {
                      const cat = allCats.find(c => c.id === tc.category) || { icon: '📦', name: tc.category }
                      return (
                        <div key={tc.category} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0',
                        }}>
                          <span style={{ fontSize: 13 }}>{cat.icon}</span>
                          <span style={{ fontSize: 11, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 700, color: '#e2e8f0' }}>
                            {Number(tc.amount).toFixed(0)}{symbol}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Skuld-förändring */}
                {d.debt_change && (Number(d.debt_change.start) !== 0 || Number(d.debt_change.end) !== 0 || Number(d.debt_change.payments) > 0) && (
                  <div style={{
                    background: '#0b1120', borderRadius: 10, padding: '8px 12px', marginBottom: 12,
                    border: '1px solid #1e293b', fontSize: 11,
                  }}>
                    <span style={{ color: '#64748b' }}>Skuld: </span>
                    <span style={{ color: '#e2e8f0', fontWeight: 600 }}>
                      {Number(d.debt_change.start).toFixed(0)} → {Number(d.debt_change.end).toFixed(0)}{symbol}
                    </span>
                    {Number(d.debt_change.payments) > 0 && (
                      <span style={{ color: '#00ff87', marginLeft: 6 }}>
                        ({Number(d.debt_change.payments).toFixed(0)}{symbol} betalat)
                      </span>
                    )}
                  </div>
                )}

                {/* Budget-status */}
                {hasBudgets && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Budget hittills i månaden</div>
                    {d.budget_status.slice(0, 4).map(bs => {
                      const cat = allCats.find(c => c.id === bs.category) || { icon: '📦', name: bs.category }
                      const pct = Number(bs.percent) || 0
                      const barColor = pct > 90 ? '#ff6b6b' : pct > 75 ? '#ff9f43' : pct > 50 ? '#ffd93d' : '#00ff87'
                      return (
                        <div key={bs.category} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 11 }}>{cat.icon}</span>
                            <span style={{ fontSize: 10, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                            <span style={{ fontSize: 10, fontFamily: 'Orbitron, sans-serif', fontWeight: 700, color: barColor }}>
                              {pct}%
                            </span>
                          </div>
                          <div style={{ borderRadius: 3, overflow: 'hidden', height: 3, background: '#0b1120' }}>
                            <div style={{
                              width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3,
                              background: barColor, transition: 'width 0.4s ease',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* AI-kommentar */}
                {(r.ai_comment || wr.aiLoading) && (
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(0,240,255,0.06), rgba(139,92,246,0.06))',
                    border: '1px solid rgba(0,240,255,0.15)',
                    borderRadius: 12, padding: '10px 14px',
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6,
                    }}>
                      <span style={{
                        background: 'linear-gradient(135deg, #00f0ff, #8b5cf6)',
                        color: '#020617', fontSize: 9, fontWeight: 800,
                        padding: '2px 6px', borderRadius: 4,
                        fontFamily: 'Orbitron, sans-serif',
                      }}>AI</span>
                      <span style={{ fontSize: 10, color: '#64748b' }}>Veckoanalys</span>
                    </div>
                    {wr.aiLoading ? (
                      <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                        Analyserar veckan...
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.5 }}>
                        {r.ai_comment}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })()}

      {/* ═══ PENGAPUSSLET ═══ */}
      {memberCount > 1 && debtData && (() => {
        const myBalance = memberBalances.find(m => m.id === user?.id)
        const otherMember = memberBalances.find(m => m.id !== user?.id)
        const allEven = !myBalance || Math.abs(myBalance.balance) < 0.5
        const iOwe = !allEven && myBalance.balance < -0.5
        const absDebt = myBalance ? Math.abs(myBalance.balance) : 0
        const debtor = iOwe ? myBalance : otherMember
        const creditor = iOwe ? otherMember : myBalance
        const visiblePayments = showAllPayments ? debtPayments : debtPayments.slice(0, 5)
        const visibleExpenses = showAllSharedExpenses ? allTimeSharedExpenses : allTimeSharedExpenses.slice(0, 5)

        return <>
          {/* ── 1. SKULD-KORT ── */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #15132a)',
            border: `1px solid ${allEven ? 'rgba(0,255,135,0.2)' : iOwe ? 'rgba(255,121,198,0.2)' : 'rgba(0,255,135,0.2)'}`,
            borderRadius: 20, padding: 16, marginBottom: 14,
          }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <div style={{ fontSize: 28 }}>🧩</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif', color: '#e2e8f0', letterSpacing: 1 }}>
                  PENGAPUSSLET
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Löpande skuldsaldo</div>
              </div>
            </div>

            {/* Bekräftelse-animation */}
            {paymentSuccess && (
              <div style={{ textAlign: 'center', padding: '12px 0', marginBottom: 10, animation: 'paymentConfirm 2s ease-out forwards' }}>
                <div style={{ fontSize: 36, marginBottom: 4 }}>✅</div>
                <div style={{ fontSize: 13, color: '#00ff87', fontWeight: 700 }}>Betalning registrerad!</div>
              </div>
            )}

            {/* Skuld-siffra */}
            {allEven ? (
              <div style={{ textAlign: 'center', padding: '16px 0 12px' }}>
                <div style={{ fontSize: 36, marginBottom: 8, animation: 'puzzleCelebrate 2s ease-in-out infinite' }}>🎊</div>
                <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900, color: '#00ff87', textShadow: '0 0 20px rgba(0,255,135,0.5)', marginBottom: 6 }}>
                  Ni är kvitt!
                </div>
              </div>
            ) : (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 4 }}>
                  {iOwe
                    ? <>Du skuldar <strong style={{ color: '#ff79c6' }}>{otherMember?.name || 'Okänd'}</strong></>
                    : <><strong style={{ color: '#00ff87' }}>{otherMember?.name || 'Okänd'}</strong> skuldar dig</>
                  }
                </div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 36, fontWeight: 900,
                  color: iOwe ? '#ff79c6' : '#00ff87',
                  textShadow: `0 0 20px ${iOwe ? 'rgba(255,121,198,0.5)' : 'rgba(0,255,135,0.5)'}`,
                }}>
                  {absDebt.toFixed(0)}{symbol}
                </div>
              </div>
            )}

            {/* Breakdown */}
            <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#94a3b8', lineHeight: 1.8 }}>
              <div>Du har lagt ut <strong style={{ color: '#e2e8f0' }}>{(myBalance?.paid || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}</strong></div>
              <div>{otherMember?.name || 'Okänd'} har lagt ut <strong style={{ color: '#e2e8f0' }}>{(otherMember?.paid || 0).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}</strong></div>
              {(myBalance?.paymentAdjustment || 0) !== 0 && (
                <div>Betalningar: <strong style={{ color: myBalance.paymentAdjustment > 0 ? '#00ff87' : '#ff79c6' }}>
                  {myBalance.paymentAdjustment > 0 ? '+' : ''}{myBalance.paymentAdjustment.toFixed(0)}{symbol}
                </strong></div>
              )}
            </div>

            {/* Registrera betalning — ALLTID synlig knapp om skuld finns */}
            {!allEven && !showPaymentForm && (
              <button
                onClick={() => { setShowPaymentForm(true); setPaymentError(''); setDebtPaymentAmount(''); setDebtPaymentNote('') }}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #00ff87, #00cc6a)',
                  border: 'none',
                  borderRadius: 12, padding: '12px 16px',
                  color: '#020617', fontSize: 14, fontWeight: 700,
                  fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(0,255,135,0.3)',
                }}
              >
                💸 Registrera betalning
              </button>
            )}

            {/* Inline betalningsformulär */}
            {!allEven && showPaymentForm && (
              <div style={{
                background: 'rgba(0,240,255,0.04)',
                border: '1px solid rgba(0,240,255,0.2)', borderRadius: 14, padding: 14,
              }}>
                {/* Från → Till */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px', border: '1px solid #1e293b', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Från</div>
                    <div style={{ fontSize: 13, color: '#ff79c6', fontWeight: 600 }}>
                      {debtor?.id === user?.id ? 'Du' : debtor?.name || 'Okänd'}
                    </div>
                  </div>
                  <div style={{ fontSize: 18, color: '#475569' }}>→</div>
                  <div style={{ flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px', border: '1px solid #1e293b', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Till</div>
                    <div style={{ fontSize: 13, color: '#00ff87', fontWeight: 600 }}>
                      {creditor?.id === user?.id ? 'Du' : creditor?.name || 'Okänd'}
                    </div>
                  </div>
                </div>
                {/* Belopp */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  background: '#0b1120', borderRadius: 10, padding: '8px 12px',
                  border: `1px solid ${paymentError ? 'rgba(255,107,107,0.4)' : 'rgba(0,240,255,0.2)'}`,
                }}>
                  <input type="number" placeholder="Belopp" value={debtPaymentAmount} autoFocus
                    onChange={e => { setDebtPaymentAmount(e.target.value); setPaymentError('') }}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 700, color: '#00f0ff', textShadow: '0 0 10px rgba(0,240,255,0.4)' }}
                  />
                  <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, color: '#64748b' }}>{symbol}</span>
                </div>
                {paymentError && (
                  <div style={{ fontSize: 11, color: '#ff6b6b', marginBottom: 8, padding: '0 4px' }}>{paymentError}</div>
                )}
                {/* Kommentar */}
                <input type="text" placeholder="Kommentar (valfritt, t.ex. Swish mars)" value={debtPaymentNote}
                  onChange={e => setDebtPaymentNote(e.target.value)}
                  style={{
                    width: '100%', background: '#0b1120', border: '1px solid #1e293b', borderRadius: 10,
                    padding: '8px 12px', color: '#e2e8f0', fontFamily: 'Outfit, sans-serif', fontSize: 12, outline: 'none', marginBottom: 8, boxSizing: 'border-box',
                  }}
                />
                {/* Snabbknappar */}
                {absDebt > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button onClick={() => { setDebtPaymentAmount(String(Math.round(absDebt / 2))); setPaymentError('') }}
                      style={{ flex: 1, background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8, padding: '6px 0', color: '#94a3b8', fontSize: 11, fontFamily: 'Outfit, sans-serif', cursor: 'pointer' }}>
                      Halva ({Math.round(absDebt / 2)}{symbol})
                    </button>
                    <button onClick={() => { setDebtPaymentAmount(String(Math.round(absDebt))); setPaymentError('') }}
                      style={{ flex: 1, background: '#0b1120', border: '1px solid rgba(0,255,135,0.2)', borderRadius: 8, padding: '6px 0', color: '#00ff87', fontSize: 11, fontFamily: 'Outfit, sans-serif', cursor: 'pointer', fontWeight: 600 }}>
                      Hela ({Math.round(absDebt)}{symbol})
                    </button>
                  </div>
                )}
                {/* Knappar */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setShowPaymentForm(false); setDebtPaymentAmount(''); setDebtPaymentNote(''); setPaymentError('') }}
                    style={{ flex: 1, background: '#1e293b', border: 'none', borderRadius: 10, padding: '10px 0', color: '#94a3b8', fontSize: 13, fontFamily: 'Outfit, sans-serif', cursor: 'pointer' }}>
                    Avbryt
                  </button>
                  <button
                    disabled={submittingPayment}
                    onClick={() => debtor && creditor && handleRegisterPayment(debtor.id, creditor.id, absDebt)}
                    style={{
                      flex: 1,
                      background: submittingPayment ? '#1e293b' : 'linear-gradient(135deg, #00ff87, #00cc6a)',
                      border: 'none', borderRadius: 10, padding: '10px 0', color: '#020617', fontSize: 13,
                      fontWeight: 700, fontFamily: 'Outfit, sans-serif', cursor: submittingPayment ? 'default' : 'pointer',
                      boxShadow: '0 0 12px rgba(0,255,135,0.3)',
                      opacity: submittingPayment ? 0.6 : 1,
                    }}>
                    {submittingPayment ? 'Sparar...' : '💸 Betala'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── 2. BETALNINGSHISTORIK ── */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #15132a)',
            border: '1px solid #1e293b',
            borderRadius: 20, padding: 16, marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: '#e2e8f0', letterSpacing: 1, marginBottom: 12 }}>
              BETALNINGAR
            </div>
            {debtPayments.length === 0 ? (
              <div style={{ fontSize: 12, color: '#475569', padding: '8px 0' }}>Inga betalningar registrerade</div>
            ) : (
              <>
                {visiblePayments.map(p => {
                  const fromName = members.find(m => m.id === p.from_user_id)?.display_name || 'Okänd'
                  const toName = members.find(m => m.id === p.to_user_id)?.display_name || 'Okänd'
                  const isEditing = editingPaymentId === p.id
                  const isDeleting = confirmDeleteId === p.id
                  const isMine = p.from_user_id === user?.id

                  if (isEditing) {
                    return (
                      <div key={p.id} style={{
                        padding: '10px 12px', marginBottom: 4, borderRadius: 10,
                        background: 'rgba(0,240,255,0.06)', border: '1px solid rgba(0,240,255,0.2)',
                      }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                          <input type="number" value={editAmount}
                            onChange={e => setEditAmount(e.target.value)} autoFocus
                            style={{ flex: 1, background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8, padding: '6px 10px', color: '#00f0ff', fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, outline: 'none' }}
                          />
                          <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#64748b', alignSelf: 'center' }}>{symbol}</span>
                        </div>
                        <input type="text" value={editNote} placeholder="Kommentar (valfritt)"
                          onChange={e => setEditNote(e.target.value)}
                          style={{ width: '100%', background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8, padding: '6px 10px', color: '#e2e8f0', fontFamily: 'Outfit, sans-serif', fontSize: 11, outline: 'none', marginBottom: 8, boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleUpdatePayment(p.id)}
                            style={{ flex: 1, background: 'linear-gradient(135deg, #00ff87, #00cc6a)', border: 'none', borderRadius: 8, padding: '7px 0', color: '#020617', fontSize: 11, fontWeight: 700, fontFamily: 'Outfit, sans-serif', cursor: 'pointer' }}>
                            Spara
                          </button>
                          <button onClick={() => { setEditingPaymentId(null); setEditAmount(''); setEditNote('') }}
                            style={{ flex: 1, background: '#1e293b', border: 'none', borderRadius: 8, padding: '7px 0', color: '#94a3b8', fontSize: 11, fontFamily: 'Outfit, sans-serif', cursor: 'pointer' }}>
                            Avbryt
                          </button>
                        </div>
                      </div>
                    )
                  }

                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                      background: isDeleting ? 'rgba(255,107,107,0.08)' : '#0b112080',
                      border: `1px solid ${isDeleting ? 'rgba(255,107,107,0.3)' : 'transparent'}`,
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                          {new Date(p.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                          <span style={{ color: '#475569' }}> — </span>
                          {p.from_user_id === user?.id ? 'Du' : fromName}
                          <span style={{ color: '#475569' }}> → </span>
                          {p.to_user_id === user?.id ? 'Du' : toName}
                          <span style={{ color: '#475569' }}>: </span>
                          <strong style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#00ff87' }}>{Number(p.amount).toFixed(0)}{symbol}</strong>
                        </div>
                        {p.note && (
                          <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>— {p.note}</div>
                        )}
                      </div>
                      {isMine && !isDeleting && (
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button onClick={() => { setEditingPaymentId(p.id); setEditAmount(String(Number(p.amount))); setEditNote(p.note || ''); setConfirmDeleteId(null) }}
                            style={{ background: 'none', border: 'none', color: '#475569', fontSize: 12, cursor: 'pointer', padding: '2px 4px' }}
                            title="Redigera">
                            ✏️
                          </button>
                          <button onClick={() => { setConfirmDeleteId(p.id); setEditingPaymentId(null) }}
                            style={{ background: 'none', border: 'none', color: '#475569', fontSize: 13, cursor: 'pointer', padding: '2px 4px' }}
                            title="Radera">
                            ✕
                          </button>
                        </div>
                      )}
                      {isDeleting && (
                        <div style={{ flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: '#ff6b6b', marginBottom: 4 }}>Radera?</div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => handleDeletePayment(p.id)}
                              style={{ background: '#ff6b6b', border: 'none', borderRadius: 6, color: '#fff', fontSize: 10, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}>
                              Ja
                            </button>
                            <button onClick={() => setConfirmDeleteId(null)}
                              style={{ background: '#1e293b', border: 'none', borderRadius: 6, color: '#94a3b8', fontSize: 10, padding: '4px 8px', cursor: 'pointer' }}>
                              Nej
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {debtPayments.length > 5 && (
                  <button onClick={() => setShowAllPayments(!showAllPayments)}
                    style={{
                      width: '100%', marginTop: 4, background: 'none', border: '1px solid #1e293b',
                      borderRadius: 8, padding: '6px 0', color: '#64748b', fontSize: 11,
                      fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                    }}>
                    {showAllPayments ? 'Visa färre' : `Visa alla (${debtPayments.length} st)`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* ── 3. SENASTE GEMENSAMMA UTGIFTER ── */}
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #15132a)',
            border: '1px solid #1e293b',
            borderRadius: 20, padding: 16, marginBottom: 14,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'Orbitron, sans-serif', color: '#e2e8f0', letterSpacing: 1, marginBottom: 12 }}>
              GEMENSAMMA UTGIFTER
            </div>
            {allTimeSharedExpenses.length === 0 ? (
              <div style={{ fontSize: 12, color: '#475569', padding: '8px 0' }}>Inga gemensamma utgifter ännu</div>
            ) : (
              <>
                {visibleExpenses.map(e => {
                  const expMember = members.find(m => m.id === e.user_id)
                  return (
                    <div key={e.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '8px 10px', marginBottom: 4, borderRadius: 10,
                      background: '#0b112080',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: '#e2e8f0' }}>
                          {e.description || '(ingen beskrivning)'}
                          <span style={{ color: '#475569' }}> — </span>
                          <span style={{ color: e.user_id === user?.id ? '#00f0ff' : '#94a3b8' }}>
                            {e.user_id === user?.id ? 'Du' : expMember?.display_name || 'Okänd'}
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                          {new Date(e.date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: '#e2e8f0', flexShrink: 0 }}>
                        {Number(e.amount).toFixed(0)}{symbol}
                      </div>
                    </div>
                  )
                })}
                {allTimeSharedExpenses.length > 5 && (
                  <button onClick={() => setShowAllSharedExpenses(!showAllSharedExpenses)}
                    style={{
                      width: '100%', marginTop: 4, background: 'none', border: '1px solid #1e293b',
                      borderRadius: 8, padding: '6px 0', color: '#64748b', fontSize: 11,
                      fontFamily: 'Outfit, sans-serif', cursor: 'pointer',
                    }}>
                    {showAllSharedExpenses ? 'Visa färre' : `Visa alla (${allTimeSharedExpenses.length} st)`}
                  </button>
                )}
              </>
            )}
          </div>
        </>
      })()}

      {/* Pengapusslet animations */}
      <style>{`
        @keyframes puzzleCelebrate {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes paymentConfirm {
          0% { opacity: 0; transform: scale(0.8); }
          20% { opacity: 1; transform: scale(1.1); }
          30% { transform: scale(1); }
          80% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* ═══ EMPTY STATE ═══ */}
      {myIncome === 0 && expenses.length === 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(0,240,255,0.06), rgba(167,139,250,0.04))',
          border: '1px dashed rgba(0,240,255,0.3)',
          borderRadius: 20, padding: '24px 16px', marginBottom: 14,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🚀</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
            Dags att komma igång!
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
            Logga din <strong style={{ color: '#ffd93d' }}>inkomst</strong> och din första{' '}
            <strong style={{ color: '#00ff87' }}>utgift</strong> så vaknar dashboarden till liv.
          </div>
        </div>
      )}

      {/* ═══ BUDGETKOLL ═══ */}
      {myIncome > 0 && isCurrentMonth && (() => {
        const dayProgress = currentDay / daysInMonth
        const budgetProgress = totalBudget > 0 ? totalSpent / totalBudget : 0
        const onTrack = budgetProgress <= dayProgress + 0.05

        return (
          <div style={{
            background: '#0f172a',
            border: `1px solid ${onTrack ? 'rgba(0,255,135,0.2)' : 'rgba(255,107,107,0.2)'}`,
            borderRadius: 20,
            padding: 16,
            marginBottom: 14,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5 }}>
                BUDGETKOLL
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: onTrack ? 'rgba(0,255,135,0.1)' : 'rgba(255,107,107,0.1)',
                color: onTrack ? '#00ff87' : '#ff6b6b',
                border: `1px solid ${onTrack ? 'rgba(0,255,135,0.2)' : 'rgba(255,107,107,0.2)'}`,
              }}>
                {onTrack
                  ? budgetProgress < dayProgress * 0.7 ? '🎯 Riktigt bra!' : '✅ I fas'
                  : budgetProgress > 0.9 ? '🚨 Nästan slut' : '⚠️ Före budget'}
              </div>
            </div>

            {/* Dual progress */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>⏱ Tid</span>
                <span style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif' }}>
                  Dag {currentDay}/{daysInMonth}
                </span>
              </div>
              <ProgressBar value={dayProgress} max={1} color="#334155" height={4} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>💸 Budget</span>
                <span style={{
                  fontSize: 10, fontFamily: 'Orbitron, sans-serif',
                  color: onTrack ? '#00ff87' : '#ff6b6b',
                }}>
                  {totalSpent.toFixed(0)}/{totalBudget.toFixed(0)}{symbol}
                </span>
              </div>
              <ProgressBar value={budgetProgress} max={1} color={onTrack ? '#00ff87' : '#ff6b6b'} height={4} />
            </div>
          </div>
        )
      })()}

      {/* ═══ BUDGET PER KATEGORI ═══ */}
      {sharedCats.length > 0 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 12 }}>
            👥 GEMENSAM BUDGET
          </div>
          {sharedCats.map(cat => {
            const spent = (categorySpend[cat.id] || 0) / memberCount
            const myBudget = cat.budget / memberCount
            const pct = myBudget > 0 ? spent / myBudget : 0
            const isOver = pct > 1
            return (
              <div key={cat.id} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11, fontFamily: 'Orbitron, sans-serif',
                      color: isOver ? '#ff6b6b' : '#00f0ff',
                    }}>
                      {spent.toFixed(0)}/{myBudget.toFixed(0)}{symbol}
                    </span>
                    {isOver && <span style={{ fontSize: 10, color: '#ff6b6b' }}>⚠️</span>}
                  </div>
                </div>
                <ProgressBar value={spent} max={myBudget} color={isOver ? '#ff6b6b' : '#00f0ff'} height={4} />
              </div>
            )
          })}

          {/* Personal budget summary */}
          <div style={{ borderTop: '1px solid #1e293b', marginTop: 8, paddingTop: 12 }}>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 10 }}>
              👤 PERSONLIG BUDGET
            </div>
            {personalCats.map(cat => {
              const spent = personalCategorySpend[cat.id] || 0
              const pct = cat.budget > 0 ? spent / cat.budget : 0
              const isOver = pct > 1
              return (
                <div key={cat.id} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                    <span style={{
                      fontSize: 11, fontFamily: 'Orbitron, sans-serif',
                      color: isOver ? '#ff6b6b' : '#a78bfa',
                    }}>
                      {spent.toFixed(0)}/{cat.budget}{symbol}
                    </span>
                  </div>
                  <ProgressBar value={spent} max={cat.budget} color={isOver ? '#ff6b6b' : '#a78bfa'} height={4} />
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ MÅNADS-JÄMFÖRELSE ═══ */}
      {prevExpenses.length > 0 && (() => {
        // Förra månadens spending per kategori (min andel)
        const prevMyExpenses = prevExpenses.filter(e => e.user_id === user?.id)
        const prevShared = prevExpenses.filter(e => e.expense_type === 'shared')
        const prevCatSpend = {}
        prevMyExpenses.forEach(e => {
          const amt = e.expense_type === 'shared' ? Number(e.amount) / memberCount : Number(e.amount)
          prevCatSpend[e.category] = (prevCatSpend[e.category] || 0) + amt
        })
        // Komplettera med delade utgifter från andra medlemmar
        prevShared.forEach(e => {
          if (e.user_id !== user?.id) {
            const amt = Number(e.amount) / memberCount
            prevCatSpend[e.category] = (prevCatSpend[e.category] || 0) + amt
          }
        })
        // Nuvarande månadens spending
        const currCatSpend = {}
        myExpenses.forEach(e => {
          const amt = e.expense_type === 'shared' ? Number(e.amount) / memberCount : Number(e.amount)
          currCatSpend[e.category] = (currCatSpend[e.category] || 0) + amt
        })
        sharedExpenses.forEach(e => {
          if (e.user_id !== user?.id) {
            const amt = Number(e.amount) / memberCount
            currCatSpend[e.category] = (currCatSpend[e.category] || 0) + amt
          }
        })

        const allCatIds = [...new Set([...Object.keys(prevCatSpend), ...Object.keys(currCatSpend)])]
        const comparisons = allCatIds.map(catId => {
          const cat = allCats.find(c => c.id === catId)
          const prev = prevCatSpend[catId] || 0
          const curr = currCatSpend[catId] || 0
          const diff = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0
          return { catId, cat, prev, curr, diff }
        }).filter(c => c.prev > 0 || c.curr > 0).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))

        if (comparisons.length === 0) return null

        const [py, pm] = (() => {
          const [y, m] = selectedMonth.split('-').map(Number)
          const d = new Date(y, m - 2, 1)
          return [d.getFullYear(), d.getMonth() + 1]
        })()
        const prevLabel = `${py}-${String(pm).padStart(2, '0')}`

        return (
          <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 20,
            padding: 16,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 4 }}>
              📊 JÄMFÖRT MED {prevLabel}
            </div>
            <div style={{ fontSize: 10, color: '#334155', marginBottom: 12 }}>
              Hur dina kategorier förändrats vs förra månaden
            </div>
            {comparisons.map(c => {
              const isUp = c.diff > 5
              const isDown = c.diff < -5
              const arrow = isUp ? '↑' : isDown ? '↓' : '→'
              const color = isUp ? '#ff6b6b' : isDown ? '#00ff87' : '#64748b'
              return (
                <div key={c.catId} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 0',
                  borderBottom: '1px solid #1e293b20',
                }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>
                    {c.cat?.icon || '📦'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 500 }}>
                      {c.cat?.name || c.catId}
                    </div>
                    <div style={{ fontSize: 10, color: '#475569' }}>
                      {c.prev.toFixed(0)}{symbol} → {c.curr.toFixed(0)}{symbol}
                    </div>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '3px 8px', borderRadius: 8,
                    background: `${color}15`,
                  }}>
                    <span style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color,
                    }}>
                      {arrow}{Math.abs(c.diff).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ═══ LEADERBOARD ═══ */}
      {leaderboard.length > 1 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 12 }}>
            🏆 LEADERBOARD
          </div>
          {leaderboard.map((member, i) => {
            const isMe = member.user_id === user?.id
            const medals = ['🥇', '🥈', '🥉']
            return (
              <div key={member.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 8px', marginBottom: 4,
                background: isMe ? 'rgba(0,240,255,0.05)' : 'transparent',
                borderRadius: 12,
                border: isMe ? '1px solid rgba(0,240,255,0.15)' : '1px solid transparent',
              }}>
                <div style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>
                  {medals[i] || `${i + 1}.`}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: isMe ? '#00f0ff' : '#e2e8f0',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {member.displayName} {isMe && '(du)'}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569' }}>
                    Lv.{member.level} • {member.streak_current || 0}🔥
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#00f0ff', fontWeight: 700 }}>
                    {member.xp} XP
                  </div>
                  <div style={{
                    fontSize: 10,
                    color: member.savingsRate >= 0.2 ? '#00ff87' : member.savingsRate >= 0 ? '#ffd93d' : '#ff6b6b',
                  }}>
                    {(member.savingsRate * 100).toFixed(0)}% sparat
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ VECKOUTMANING ═══ */}
      {weeklyChallenge && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,121,198,0.08), rgba(167,139,250,0.05))',
          border: '1px solid rgba(255,121,198,0.2)',
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(255,121,198,0.15)', border: '1px solid rgba(255,121,198,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, flexShrink: 0,
          }}>⚔️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', marginBottom: 2 }}>
              {weeklyChallenge.title}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.3 }}>
              {weeklyChallenge.description}
            </div>
          </div>
          <div style={{
            fontFamily: 'Orbitron, sans-serif', fontSize: 11, color: '#ffd93d',
            background: 'rgba(255,217,61,0.1)', padding: '4px 8px', borderRadius: 8,
            flexShrink: 0, fontWeight: 700,
          }}>
            +{weeklyChallenge.xp}
          </div>
        </div>
      )}

      {/* ═══ SENASTE UTGIFTER ═══ */}
      {recentExpenses.length > 0 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 14,
        }}>
          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 10 }}>
            SENASTE UTGIFTER
          </div>
          {recentExpenses.map((expense, i) => {
            const cat = allCats.find(c => c.id === expense.category)
            const member = members.find(m => m.id === expense.user_id)
            return (
              <div key={expense.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 0',
                borderBottom: i < recentExpenses.length - 1 ? '1px solid #1e293b10' : 'none',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: expense.expense_type === 'shared' ? 'rgba(255,121,198,0.1)' : 'rgba(167,139,250,0.1)',
                  border: `1px solid ${expense.expense_type === 'shared' ? 'rgba(255,121,198,0.2)' : 'rgba(167,139,250,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>
                  {cat?.icon || '📦'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, color: '#e2e8f0', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {expense.description || cat?.name || expense.category}
                  </div>
                  <div style={{ fontSize: 10, color: '#475569' }}>
                    {expense.date?.slice(5)} • {member?.display_name || 'Du'} • {expense.expense_type === 'shared' ? '👥' : '👤'}
                  </div>
                </div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, flexShrink: 0,
                  color: expense.expense_type === 'shared' ? '#ff79c6' : '#a78bfa',
                }}>
                  -{(expense.expense_type === 'shared' ? Number(expense.amount) / memberCount : Number(expense.amount)).toFixed(0)}{symbol}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ UTGIFTSMÖNSTER ═══ */}
      {(() => {
        const dailySpend = {}
        myExpenses.forEach(e => {
          const day = parseInt(e.date?.split('-')[2])
          const amt = e.expense_type === 'shared' ? Number(e.amount) / memberCount : Number(e.amount)
          if (day) dailySpend[day] = (dailySpend[day] || 0) + amt
        })
        const days = Object.keys(dailySpend).map(Number).sort((a, b) => a - b)
        if (days.length === 0) return null
        const maxSpend = Math.max(...Object.values(dailySpend))
        const topDay = days.find(d => dailySpend[d] === maxSpend)
        const avgSpend = Object.values(dailySpend).reduce((a, b) => a + b, 0) / days.length
        const activeDays = days.length
        const totalDaysToCount = isCurrentMonth ? currentDay : daysInMonth
        const quietDays = Math.max(totalDaysToCount - activeDays, 0)

        return (
          <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 20,
            padding: 16,
            marginBottom: 14,
          }}>
            <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5, marginBottom: 12 }}>
              UTGIFTSMÖNSTER
            </div>

            {/* Mini stats */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {[
                { label: 'Dyraste', value: `Dag ${topDay}`, sub: `${maxSpend.toFixed(0)}${symbol}`, color: '#ff6b6b' },
                { label: 'Snitt/dag', value: `${avgSpend.toFixed(0)}${symbol}`, sub: `${activeDays} dagar`, color: '#00f0ff' },
                { label: 'Lugna', value: `${quietDays}`, sub: 'utan köp', color: '#00ff87' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1, background: '#0b1120', borderRadius: 10,
                  padding: '8px 6px', textAlign: 'center', border: '1px solid #1e293b',
                }}>
                  <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 8, color: '#334155', marginTop: 1 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div style={{
              display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 70, padding: '0 1px',
            }}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const spend = dailySpend[day] || 0
                const height = maxSpend > 0 ? (spend / maxSpend) * 100 : 0
                const isToday = day === currentDay && isCurrentMonth
                const barColor = spend === maxSpend && spend > 0
                  ? '#ff6b6b'
                  : spend > avgSpend ? '#ffd93d'
                  : spend > 0 ? '#00f0ff' : '#1e293b'
                return (
                  <div key={day} style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', height: '100%', justifyContent: 'flex-end',
                  }}>
                    <div style={{
                      width: '100%', height: `${Math.max(height, 2)}%`,
                      background: barColor, borderRadius: '2px 2px 0 0',
                      opacity: spend > 0 ? 1 : 0.25,
                      boxShadow: spend === maxSpend ? `0 0 6px ${barColor}` : 'none',
                      transition: 'height 0.4s ease',
                    }} />
                    {isToday && (
                      <div style={{
                        width: 3, height: 3, borderRadius: '50%',
                        background: '#00ff87', marginTop: 2,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 8, color: '#334155' }}>1</span>
              <span style={{ fontSize: 8, color: '#334155' }}>{Math.floor(daysInMonth / 2)}</span>
              <span style={{ fontSize: 8, color: '#334155' }}>{daysInMonth}</span>
            </div>
          </div>
        )
      })()}

      {/* ═══ MÅNADSRAPPORT ═══ */}
      {myIncome > 0 && (() => {
        const topCategory = Object.entries(
          myExpenses.reduce((acc, e) => {
            const cat = allCats.find(c => c.id === e.category)
            const name = cat ? `${cat.icon} ${cat.name}` : e.category
            const amt = e.expense_type === 'shared' ? Number(e.amount) / memberCount : Number(e.amount)
            acc[name] = (acc[name] || 0) + amt
            return acc
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]

        // Räkna alla dagar där jag hade kostnad (inkl. delade loggade av andra)
        const allMyExpenseDates = new Set(myExpenses.map(e => e.date))
        sharedExpenses.forEach(e => { if (e.date) allMyExpenseDates.add(e.date) })
        const expenseDays = allMyExpenseDates.size
        const avgPerExpenseDay = expenseDays > 0 ? totalSpent / expenseDays : 0

        let title, emoji, borderColor
        if (savingsRate >= 0.3) { title = 'Spartanskt Geni'; emoji = '🧠'; borderColor = '#00ff87' }
        else if (savingsRate >= 0.2) { title = 'Balanserad Budgetör'; emoji = '⚖️'; borderColor = '#00f0ff' }
        else if (savingsRate >= 0.1) { title = 'Försiktig Utforskare'; emoji = '🧭'; borderColor = '#ffd93d' }
        else if (savingsRate >= 0) { title = 'Levande Livet'; emoji = '🎪'; borderColor = '#ff79c6' }
        else { title = 'Röda Riddaren'; emoji = '⚔️'; borderColor = '#ff6b6b' }

        const facts = []
        if (topCategory) facts.push(`${topCategory[0]} — ${topCategory[1].toFixed(0)}${symbol}`)
        if (expenseDays > 0) facts.push(`Handlade ${expenseDays} av ${daysInMonth} dagar`)
        if (avgPerExpenseDay > 0) facts.push(`Snitt ${avgPerExpenseDay.toFixed(0)}${symbol}/shoppingdag`)
        if (myExpenses.length > 0) facts.push(`${myExpenses.length} transaktioner totalt`)

        return (
          <div style={{
            background: `linear-gradient(135deg, ${borderColor}08, ${borderColor}03)`,
            border: `1px solid ${borderColor}25`,
            borderRadius: 20,
            padding: 16,
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
            }}>
              <span style={{ fontSize: 28, filter: `drop-shadow(0 0 8px ${borderColor})` }}>{emoji}</span>
              <div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 800,
                  color: borderColor, textShadow: `0 0 10px ${borderColor}40`,
                }}>{title}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1 }}>MÅNADSRAPPORT</div>
              </div>
            </div>
            <div style={{ background: 'rgba(2,6,23,0.5)', borderRadius: 10, padding: 10 }}>
              {facts.map((fact, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 0',
                  borderBottom: i < facts.length - 1 ? '1px solid rgba(30,41,59,0.5)' : 'none',
                }}>
                  <span style={{ fontSize: 9, color: borderColor }}>▸</span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{fact}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
