import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { getMonthGrade, getCurrentMonth, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
import { useCurrency } from '../../hooks/useCurrency'
import { useSavingsGoals } from '../../hooks/useSavingsGoals'
import { useBalance } from '../../hooks/useBalance'
import ProgressBar from '../shared/ProgressBar'
import Sentry from '../../lib/sentry'

export default function Personal({ selectedMonth }) {
  const { user, profile } = useAuth()
  const { expenses } = useExpenses(selectedMonth)
  const { budget } = useBudget()
  const { myIncome, refetch: refetchIncome } = useIncome(selectedMonth)
  const [incomeInput, setIncomeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { symbol } = useCurrency()
  const { goals, addGoal, deleteGoal } = useSavingsGoals()
  const bal = useBalance()
  const [balanceInput, setBalanceInput] = useState('')
  const adjCount = bal.adjustmentCount || 0
  const [simCut, setSimCut] = useState(0)
  const [simExtra, setSimExtra] = useState(0)
  const [members, setMembers] = useState([])
  const [savingsGoalInput, setSavingsGoalInput] = useState('')
  const [goalNameInput, setGoalNameInput] = useState('')
  const [goalSaved, setGoalSaved] = useState(false)

  useEffect(() => {
    if (profile?.household_id) {
      supabase.from('profiles').select('id').eq('household_id', profile.household_id)
        .then(({ data, error }) => {
          if (error) { console.error('fetchMembers error:', error); Sentry.captureException(error) }
          setMembers(data || [])
        })
    }
  }, [profile?.household_id])

  // Primärt sparmål (första i listan)
  const primaryGoal = goals[0] || null
  const savingsGoal = primaryGoal ? String(primaryGoal.target_amount) : ''

  const personalCategories = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const myPersonalExpenses = expenses.filter(e => e.user_id === user?.id && e.expense_type === 'personal')

  const categorySpend = {}
  myPersonalExpenses.forEach(e => {
    categorySpend[e.category] = (categorySpend[e.category] || 0) + Number(e.amount)
  })

  const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
  const householdMemberCount = members.length || 1
  const myShareOfShared = sharedExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / householdMemberCount
  const myPersonalTotal = myPersonalExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const mySaved = myIncome - myShareOfShared - myPersonalTotal
  const savingsRate = myIncome > 0 ? mySaved / myIncome : 0

  const { grade, color: gradeColor } = getMonthGrade(savingsRate)

  async function handleSaveIncome() {
    if (!incomeInput) return
    setSaving(true)
    try {
      const { error } = await supabase.from('income').insert({
        household_id: profile.household_id,
        user_id: user.id,
        month: selectedMonth,
        amount: parseFloat(incomeInput),
      })
      if (error) {
        console.error('handleSaveIncome error:', error); Sentry.captureException(error)
        return
      }
      await refetchIncome()
      setSaved(true)
      setIncomeInput('')
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const milestones = [
    { label: 'Bas', pct: 0, color: '#ff6b6b' },
    { label: '10%', pct: 0.1, color: '#ffd93d' },
    { label: '20%', pct: 0.2, color: '#00ff87' },
    { label: '30%', pct: 0.3, color: '#00f0ff' },
  ]

  // Saldo-graf (inline SVG)
  function BalanceChart({ dailyData, startBalance }) {
    if (!dailyData || dailyData.length < 2) return null
    const W = 320, H = 120, PX = 8, PY = 12
    const balances = dailyData.map(d => Number(d.balance))
    const minB = Math.min(...balances, 0)
    const maxB = Math.max(...balances, startBalance)
    const range = maxB - minB || 1

    const points = dailyData.map((d, i) => ({
      x: PX + (i / (dailyData.length - 1)) * (W - PX * 2),
      y: PY + (1 - (Number(d.balance) - minB) / range) * (H - PY * 2),
    }))
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ')

    // Noll-linje
    const zeroY = minB < 0 ? PY + (1 - (0 - minB) / range) * (H - PY * 2) : null

    // Prognoslinje: snitt-burn per dag → projicera 7 dagar
    const lastBal = balances[balances.length - 1]
    const totalBurn = Number(startBalance) - lastBal
    const days = dailyData.length
    const avgBurn = days > 1 ? totalBurn / (days - 1) : 0
    const projDays = 7
    const projEnd = lastBal - avgBurn * projDays
    const projEndY = PY + (1 - (projEnd - minB) / Math.max(maxB - Math.min(minB, projEnd), 1)) * (H - PY * 2)
    const lastPoint = points[points.length - 1]

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
        {/* Gradient fill under line */}
        <defs>
          <linearGradient id="balFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00f0ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${pathD} L${points[points.length - 1].x},${H - PY} L${points[0].x},${H - PY} Z`} fill="url(#balFill)" />
        <path d={pathD} fill="none" stroke="#00f0ff" strokeWidth="2" strokeLinejoin="round" />

        {/* Zero line */}
        {zeroY != null && zeroY > PY && zeroY < H - PY && (
          <line x1={PX} y1={zeroY} x2={W - PX} y2={zeroY} stroke="#ff6b6b" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
        )}

        {/* Prognos */}
        {avgBurn > 0 && (
          <line x1={lastPoint.x} y1={lastPoint.y} x2={W - PX} y2={Math.min(Math.max(projEndY, PY), H - PY)}
            stroke="#64748b" strokeWidth="1.5" strokeDasharray="4 3" />
        )}

        {/* Start och slut-dot */}
        <circle cx={points[0].x} cy={points[0].y} r="3" fill="#00f0ff" />
        <circle cx={lastPoint.x} cy={lastPoint.y} r="3" fill={lastBal >= 0 ? '#00ff87' : '#ff6b6b'} />

        {/* Labels */}
        <text x={points[0].x} y={points[0].y - 6} fill="#64748b" fontSize="8" textAnchor="start">{Number(startBalance).toFixed(0)}</text>
        <text x={lastPoint.x} y={lastPoint.y - 6} fill={lastBal >= 0 ? '#00ff87' : '#ff6b6b'} fontSize="8" textAnchor="end" fontWeight="700">{lastBal.toFixed(0)}</text>
      </svg>
    )
  }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* ═══ SALDO ═══ */}
      {!bal.loading && (
        bal.isSet ? (() => {
          const b = bal.balance
          const curBal = Number(b.current_balance)
          const isNeg = curBal < 0
          const startDate = new Date(b.starting_balance_date)
          const startStr = `${startDate.getDate()} ${startDate.toLocaleString('sv-SE', { month: 'short' })}`
          const topCats = {}
          // Bygg top cats från daily_data (approximate) — we show from the hook data
          const sharedPart = Number(b.shared_expenses_since)
          const personalPart = Number(b.personal_expenses_since)

          return (
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #15132a)',
              border: `1px solid ${isNeg ? 'rgba(255,107,107,0.3)' : '#1e293b'}`,
              borderRadius: 20, padding: 16, marginBottom: 14,
            }}>
              {/* Saldo */}
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 4 }}>
                  KONTOSALDO
                </div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 36, fontWeight: 900,
                  color: isNeg ? '#ff6b6b' : '#00ff87',
                  textShadow: isNeg ? '0 0 20px rgba(255,107,107,0.5)' : '0 0 20px rgba(0,255,135,0.5)',
                }}>
                  {curBal.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}
                </div>
                <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
                  Startsaldo {Number(b.starting_balance).toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol} den {startStr}
                </div>
              </div>

              {/* Inkomst / Utgifter */}
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8, marginBottom: 12,
                fontSize: 12,
              }}>
                <span style={{ color: '#00ff87' }}>
                  Inkomst: +{Number(b.income_since).toFixed(0)}{symbol}
                </span>
                <span style={{ color: '#ff6b6b' }}>
                  Utgifter: −{Number(b.expenses_since).toFixed(0)}{symbol}
                </span>
              </div>

              {isNeg && (
                <div style={{
                  background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.2)',
                  borderRadius: 10, padding: '8px 12px', marginBottom: 12, textAlign: 'center',
                  fontSize: 12, color: '#ff6b6b', fontWeight: 600,
                }}>
                  ⚠️ Negativt saldo — du spenderar mer än du har!
                </div>
              )}

              {/* Graf */}
              {b.daily_data?.length >= 2 && (
                <div style={{ marginBottom: 12 }}>
                  <BalanceChart dailyData={b.daily_data} startBalance={Number(b.starting_balance)} />
                </div>
              )}

              {/* Uppdelning */}
              <div style={{
                display: 'flex', gap: 6, marginBottom: 8,
              }}>
                <div style={{
                  flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px',
                  border: '1px solid #1e293b', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 8, color: '#64748b', marginBottom: 2 }}>Gemensamt (din del)</div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#ff79c6' }}>
                    {sharedPart.toFixed(0)}{symbol}
                  </div>
                </div>
                <div style={{
                  flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px',
                  border: '1px solid #1e293b', textAlign: 'center',
                }}>
                  <div style={{ fontSize: 8, color: '#64748b', marginBottom: 2 }}>Personligt</div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>
                    {personalPart.toFixed(0)}{symbol}
                  </div>
                </div>
              </div>

              {/* Länk till Settings */}
              <div style={{ fontSize: 10, color: '#475569', fontFamily: 'Outfit, sans-serif', marginTop: 2 }}>
                {adjCount > 0 && (
                  <span style={{ color: '#a78bfa' }}>{adjCount} justering{adjCount !== 1 ? 'ar' : ''} · </span>
                )}
                <span>Hantera i Inställningar →</span>
              </div>
            </div>
          )
        })() : (
          /* Setup-UI: sätt startsaldo */
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #15132a)',
            border: '1px solid rgba(0,240,255,0.2)',
            borderRadius: 20, padding: 20, marginBottom: 14, textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>💰</div>
            <div style={{
              fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif',
              color: '#e2e8f0', letterSpacing: 1, marginBottom: 6,
            }}>
              SÄTT DITT STARTSALDO
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 16 }}>
              Hur mycket har du på kontot just nu?
            </div>
            <div style={{ display: 'flex', gap: 8, maxWidth: 280, margin: '0 auto' }}>
              <input
                type="number"
                autoFocus
                placeholder="0"
                value={balanceInput}
                onChange={e => setBalanceInput(e.target.value)}
                style={{
                  flex: 1, background: '#0b1120', border: '2px solid #1e293b',
                  borderRadius: 12, padding: '12px 14px',
                  color: '#00f0ff', fontFamily: 'Orbitron, sans-serif', fontSize: 20,
                  fontWeight: 700, outline: 'none', textAlign: 'center',
                }}
                onFocus={e => e.target.style.borderColor = '#00f0ff'}
                onBlur={e => e.target.style.borderColor = '#1e293b'}
              />
              <span style={{
                display: 'flex', alignItems: 'center', color: '#64748b',
                fontFamily: 'Orbitron, sans-serif', fontSize: 18,
              }}>{symbol}</span>
            </div>
            <button
              onClick={async () => {
                const amt = parseFloat(balanceInput)
                if (isNaN(amt)) return
                await bal.setStartingBalance(amt)
                setBalanceInput('')
              }}
              disabled={!balanceInput || bal.saving}
              style={{
                marginTop: 12, padding: '12px 32px',
                background: balanceInput ? 'linear-gradient(135deg, #00f0ff, #0080ff)' : '#1e293b',
                border: 'none', borderRadius: 12, cursor: balanceInput ? 'pointer' : 'default',
                color: balanceInput ? '#020617' : '#475569',
                fontFamily: 'Outfit, sans-serif', fontWeight: 700, fontSize: 14,
                boxShadow: balanceInput ? '0 0 20px rgba(0,240,255,0.3)' : 'none',
              }}
            >
              {bal.saving ? 'Sparar...' : 'Spara startsaldo'}
            </button>
          </div>
        )
      )}

      {/* Income Input */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 20,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          MÅNADSINKOMST ({selectedMonth})
        </div>
        {myIncome > 0 && (
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 28,
            fontWeight: 700,
            color: '#00ff87',
            textShadow: '0 0 15px rgba(0,255,135,0.5)',
            marginBottom: 12,
          }}>
            {myIncome.toFixed(0)}{symbol}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            aria-label="Månadsinkomst"
            placeholder={myIncome > 0 ? 'Uppdatera...' : 'Ange inkomst...'}
            value={incomeInput}
            onChange={e => setIncomeInput(e.target.value)}
            style={{
              flex: 1,
              background: '#0b1120',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: '12px 14px',
              color: '#e2e8f0',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 16,
              outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = '#00ff87'}
            onBlur={e => e.target.style.borderColor = '#1e293b'}
          />
          <button
            onClick={handleSaveIncome}
            disabled={!incomeInput || saving}
            style={{
              background: saved ? '#00ff87' : 'linear-gradient(135deg, #00ff87, #00cc6a)',
              border: 'none',
              borderRadius: 10,
              padding: '0 16px',
              color: '#020617',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: '0 0 15px rgba(0,255,135,0.3)',
              opacity: !incomeInput || saving ? 0.5 : 1,
            }}
          >
            {saved ? '✓' : saving ? '...' : 'Spara'}
          </button>
        </div>
      </div>

      {/* Save First Rule */}
      {myIncome > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid #ffd93d40',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: '#ffd93d', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 10 }}>
            💡 SPARA FÖRST-REGELN
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Inkomst</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, color: '#e2e8f0' }}>{myIncome.toFixed(0)}{symbol}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#ffd93d' }}>Spara 20% först</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, color: '#ffd93d' }}>−{(myIncome * 0.2).toFixed(0)}{symbol}</div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Din del av gemensamt</div>
            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, color: '#e2e8f0' }}>−{myShareOfShared.toFixed(0)}{symbol}</div>
          </div>
          <div style={{
            borderTop: '1px solid #1e293b',
            paddingTop: 8,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div style={{ fontSize: 13, color: '#00ff87', fontWeight: 600 }}>Kvar att röra dig med</div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 20,
              fontWeight: 700,
              color: (myIncome * 0.8 - myShareOfShared) > 0 ? '#00ff87' : '#ff6b6b',
              textShadow: '0 0 10px rgba(0,255,135,0.4)',
            }}>
              {(myIncome * 0.8 - myShareOfShared).toFixed(0)}{symbol}
            </div>
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 1.4 }}>
            Ekonomer rekommenderar att spara minst 20% av inkomsten innan du spenderar.
            {savingsRate >= 0.2
              ? <span style={{ color: '#00ff87' }}> Du klarar detta! 🎉</span>
              : <span style={{ color: '#ffd93d' }}> Du sparar {(savingsRate * 100).toFixed(0)}% just nu – fortsätt kämpa!</span>
            }
          </div>
        </div>
      )}

      {/* Savings Rate */}
      <div style={{
        background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
        border: `1px solid ${gradeColor}40`,
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
          SPARKVOT
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
          <div style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 36,
            fontWeight: 900,
            color: gradeColor,
            textShadow: `0 0 20px ${gradeColor}`,
          }}>
            {grade}
          </div>
          <div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 24,
              fontWeight: 700,
              color: gradeColor,
            }}>
              {(savingsRate * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {mySaved >= 0 ? '+' : ''}{mySaved.toFixed(0)}{symbol} sparat
            </div>
          </div>
        </div>
        {/* Milestone markers */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <ProgressBar value={Math.max(savingsRate, 0)} max={0.35} color={gradeColor} height={8} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            {milestones.map(m => (
              <div key={m.label} style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  fontSize: 9,
                  color: savingsRate >= m.pct ? m.color : '#1e293b',
                  fontFamily: 'Orbitron, sans-serif',
                }}>
                  {m.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Personal Budget Categories */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          PERSONLIG BUDGET
        </div>
        {personalCategories.map(cat => {
          const spent = categorySpend[cat.id] || 0
          const isOver = spent > cat.budget
          return (
            <div key={cat.id} style={{ marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                <span style={{
                  fontSize: 12,
                  fontFamily: 'Orbitron, sans-serif',
                  color: isOver ? '#ff6b6b' : '#00ff87',
                }}>
                  {spent.toFixed(0)}/{cat.budget}{symbol}
                </span>
              </div>
              <ProgressBar value={spent} max={cat.budget} color={isOver ? '#ff6b6b' : '#00ff87'} height={5} />
              <div style={{ fontSize: 10, color: isOver ? '#ff6b6b' : '#64748b', marginTop: 2, textAlign: 'right' }}>
                {isOver
                  ? `${(spent - cat.budget).toFixed(0)}${symbol} över budget`
                  : `${(cat.budget - spent).toFixed(0)}${symbol} kvar`}
              </div>
            </div>
          )
        })}
      </div>

      {/* What-If Simulator */}
      {myIncome > 0 && (() => {
        const currentMonthlySaved = mySaved
        const simMonthlySaved = currentMonthlySaved + simCut + simExtra
        const simSavingsRate = myIncome > 0 ? simMonthlySaved / myIncome : 0
        const simGrade = getMonthGrade(simSavingsRate)
        const currentGrade = getMonthGrade(savingsRate)

        const projections = [
          { label: '3 mån', months: 3 },
          { label: '6 mån', months: 6 },
          { label: '1 år', months: 12 },
          { label: '5 år', months: 60 },
        ]

        const gradeImproved = simGrade.grade !== currentGrade.grade && simSavingsRate > savingsRate

        return (
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid rgba(160,120,255,0.3)',
            borderRadius: 20,
            padding: 16,
            marginTop: 12,
          }}>
            <div style={{ fontSize: 13, color: '#a78bfa', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 14 }}>
              🔮 WHAT-IF SIMULATOR
            </div>

            {/* Cut spending slider */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Skär ner utgifter</span>
                <span style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                  color: simCut > 0 ? '#ff79c6' : '#475569',
                }}>
                  -{simCut}{symbol}/mån
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.max(Math.round(myPersonalTotal + myShareOfShared), 500)}
                step={50}
                value={simCut}
                onChange={e => setSimCut(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#ff79c6',
                  height: 6,
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569' }}>
                <span>0{symbol}</span>
                <span>{Math.max(Math.round(myPersonalTotal + myShareOfShared), 500)}{symbol}</span>
              </div>
            </div>

            {/* Extra income slider */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>Extra inkomst / sidoinkomst</span>
                <span style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 13,
                  fontWeight: 700,
                  color: simExtra > 0 ? '#00ff87' : '#475569',
                }}>
                  +{simExtra}{symbol}/mån
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={Math.round(myIncome * 0.5)}
                step={50}
                value={simExtra}
                onChange={e => setSimExtra(Number(e.target.value))}
                style={{
                  width: '100%',
                  accentColor: '#00ff87',
                  height: 6,
                  cursor: 'pointer',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#475569' }}>
                <span>0{symbol}</span>
                <span>{Math.round(myIncome * 0.5)}{symbol}</span>
              </div>
            </div>

            {/* Result comparison */}
            {(simCut > 0 || simExtra > 0) && (
              <>
                <div style={{
                  background: '#0b112080',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>NU</div>
                      <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 28,
                        fontWeight: 900,
                        color: currentGrade.color,
                        textShadow: `0 0 15px ${currentGrade.color}60`,
                      }}>
                        {currentGrade.grade}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>
                        {(savingsRate * 100).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 11, color: currentMonthlySaved >= 0 ? '#00ff87' : '#ff6b6b' }}>
                        {currentMonthlySaved >= 0 ? '+' : ''}{currentMonthlySaved.toFixed(0)}{symbol}/mån
                      </div>
                    </div>
                    <div style={{
                      fontSize: 24,
                      color: gradeImproved ? '#ffd93d' : '#a78bfa',
                      padding: '0 12px',
                    }}>
                      {gradeImproved ? '⬆' : '→'}
                    </div>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 9, color: '#a78bfa', marginBottom: 4 }}>SIMULERAT</div>
                      <div style={{
                        fontFamily: 'Orbitron, sans-serif',
                        fontSize: 28,
                        fontWeight: 900,
                        color: simGrade.color,
                        textShadow: `0 0 15px ${simGrade.color}60`,
                      }}>
                        {simGrade.grade}
                      </div>
                      <div style={{ fontSize: 11, color: '#a78bfa' }}>
                        {(simSavingsRate * 100).toFixed(0)}%
                      </div>
                      <div style={{ fontSize: 11, color: simMonthlySaved >= 0 ? '#00ff87' : '#ff6b6b' }}>
                        {simMonthlySaved >= 0 ? '+' : ''}{simMonthlySaved.toFixed(0)}{symbol}/mån
                      </div>
                    </div>
                  </div>

                  {gradeImproved && (
                    <div style={{
                      textAlign: 'center',
                      fontSize: 12,
                      color: '#ffd93d',
                      padding: '6px 0 0',
                      borderTop: '1px solid #1e293b',
                    }}>
                      🎉 Betyg uppgraderat! {currentGrade.grade} → {simGrade.grade}
                    </div>
                  )}
                </div>

                {/* Projections */}
                <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
                  PROJICERAT SPARANDE
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {projections.map(p => {
                    const projected = simMonthlySaved * p.months
                    return (
                      <div key={p.label} style={{
                        flex: 1,
                        background: '#0b1120',
                        borderRadius: 10,
                        padding: '10px 4px',
                        textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>{p.label}</div>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif',
                          fontSize: 12,
                          fontWeight: 700,
                          color: projected >= 0 ? '#00ff87' : '#ff6b6b',
                        }}>
                          {projected >= 0 ? '+' : ''}{projected >= 1000 || projected <= -1000
                            ? `${(projected / 1000).toFixed(1)}k`
                            : projected.toFixed(0)
                          }
                        </div>
                        <div style={{ fontSize: 8, color: '#475569' }}>{symbol}</div>
                      </div>
                    )
                  })}
                </div>

                {/* Motivational nudge */}
                <div style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  background: `${simGrade.color}10`,
                  border: `1px solid ${simGrade.color}30`,
                  borderRadius: 10,
                  fontSize: 12,
                  color: '#cbd5e1',
                  lineHeight: 1.4,
                  textAlign: 'center',
                }}>
                  {simMonthlySaved * 12 >= 10000
                    ? `🏆 På ett år: ${(simMonthlySaved * 12).toFixed(0)}${symbol} – det är en resa, en nödfond, eller en investering!`
                    : simMonthlySaved * 12 >= 5000
                      ? `✈️ ${(simMonthlySaved * 12).toFixed(0)}${symbol} på ett år – det räcker till en riktigt fin semester!`
                      : simMonthlySaved * 12 >= 1000
                        ? `🛡️ ${(simMonthlySaved * 12).toFixed(0)}${symbol} på ett år – en bra start på en nödfond!`
                        : simMonthlySaved > 0
                          ? `🌱 Varje krona räknas! ${(simMonthlySaved * 12).toFixed(0)}${symbol} på ett år.`
                          : `😬 Fortfarande minus – prova att dra ner lite mer!`
                  }
                </div>
              </>
            )}

            {simCut === 0 && simExtra === 0 && (
              <div style={{ textAlign: 'center', padding: '8px 0', fontSize: 12, color: '#64748b' }}>
                Dra i reglagen ovan för att se hur din ekonomi förändras! 🎮
              </div>
            )}
          </div>
        )
      })()}

      {/* ═══ SPARMÅL MED TIDSLINJE ═══ */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a, #1e293b)',
        border: '1px solid rgba(255,217,61,0.2)',
        borderRadius: 20,
        padding: 16,
        marginTop: 12,
      }}>
        <div style={{ fontSize: 11, color: '#ffd93d', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          🎯 SPARMÅL
        </div>

        {/* Mål-input */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Namn (t.ex. Semester)"
              value={goalNameInput}
              onChange={e => setGoalNameInput(e.target.value)}
              style={{
                flex: 1, background: '#0b1120', border: '1px solid #1e293b',
                borderRadius: 10, padding: '10px 14px', color: '#e2e8f0',
                fontFamily: 'Outfit, sans-serif', fontSize: 13, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#ffd93d'}
              onBlur={e => e.target.style.borderColor = '#1e293b'}
            />
            <input
              type="number"
              placeholder={`Belopp (${symbol})`}
              value={savingsGoalInput}
              onChange={e => setSavingsGoalInput(e.target.value)}
              style={{
                width: 120, background: '#0b1120', border: '1px solid #1e293b',
                borderRadius: 10, padding: '10px 14px', color: '#e2e8f0',
                fontFamily: 'Orbitron, sans-serif', fontSize: 14, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = '#ffd93d'}
              onBlur={e => e.target.style.borderColor = '#1e293b'}
            />
            <button
              onClick={async () => {
                if (savingsGoalInput) {
                  await addGoal({
                    name: goalNameInput.trim() || 'Mitt sparmål',
                    target_amount: parseFloat(savingsGoalInput),
                  })
                  setSavingsGoalInput('')
                  setGoalNameInput('')
                  setGoalSaved(true)
                  setTimeout(() => setGoalSaved(false), 2000)
                }
              }}
              disabled={!savingsGoalInput}
              style={{
                background: goalSaved ? '#ffd93d' : 'linear-gradient(135deg, #ffd93d, #f0c020)',
                border: 'none', borderRadius: 10, padding: '0 14px',
                color: '#020617', fontFamily: 'Outfit, sans-serif', fontWeight: 700,
                fontSize: 13, cursor: 'pointer',
                boxShadow: '0 0 10px rgba(255,217,61,0.2)',
                opacity: !savingsGoalInput ? 0.5 : 1,
              }}
            >
              {goalSaved ? '✓' : '🎯'}
            </button>
          </div>
        </div>

        {/* Tidslinje och progress per mål */}
        {goals.length > 0 && myIncome > 0 && goals.map(goalObj => {
          const goal = Number(goalObj.target_amount)
          if (!goal || goal <= 0) return null
          const monthlySavings = mySaved
          const remaining = goal - Number(goalObj.current_amount)
          const monthsToGoal = monthlySavings > 0 ? Math.ceil(remaining / monthlySavings) : null
          const progressPct = goal > 0 ? Number(goalObj.current_amount) / goal : 0

          const allMilestones = [
            { months: 1, label: '1 mån' },
            { months: 3, label: '3 mån' },
            { months: 6, label: '6 mån' },
            { months: 12, label: '1 år' },
            { months: 24, label: '2 år' },
            { months: 60, label: '5 år' },
          ]
          const milestones = monthsToGoal
            ? allMilestones.filter(m => m.months <= Math.max(monthsToGoal * 1.5, 6)).slice(0, 5)
            : allMilestones.slice(0, 4)

          return (
            <div key={goalObj.id} style={{ marginBottom: goals.length > 1 ? 14 : 0 }}>
              {/* Mål-display */}
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0b112080', borderRadius: 12, padding: '12px 14px', marginBottom: 12,
              }}>
                <div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{goalObj.name}</div>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                    color: '#ffd93d', textShadow: '0 0 15px rgba(255,217,61,0.4)',
                  }}>
                    {goal.toLocaleString()}{symbol}
                  </div>
                  {goalObj.deadline && (
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      Deadline: {goalObj.deadline}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Månadssparande</div>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 700,
                    color: monthlySavings > 0 ? '#00ff87' : '#ff6b6b',
                  }}>
                    {monthlySavings >= 0 ? '+' : ''}{monthlySavings.toFixed(0)}{symbol}
                  </div>
                </div>
              </div>

              {/* Saved progress bar */}
              {Number(goalObj.current_amount) > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>Sparat hittills</span>
                    <span style={{ fontSize: 11, color: '#ffd93d', fontFamily: 'Orbitron, sans-serif' }}>
                      {Number(goalObj.current_amount).toLocaleString()}/{goal.toLocaleString()}{symbol}
                    </span>
                  </div>
                  <ProgressBar value={Number(goalObj.current_amount)} max={goal} color="#ffd93d" height={6} />
                </div>
              )}

              {/* Tidslinje-resultat */}
              {monthlySavings > 0 ? (
                <>
                  <div style={{
                    textAlign: 'center', marginBottom: 14,
                    background: 'rgba(255,217,61,0.06)', borderRadius: 12, padding: '12px 14px',
                    border: '1px solid rgba(255,217,61,0.15)',
                  }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                      Vid nuvarande takt når du målet om
                    </div>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900,
                      color: '#ffd93d', textShadow: '0 0 20px rgba(255,217,61,0.5)',
                    }}>
                      {monthsToGoal <= 12
                        ? `${monthsToGoal} mån`
                        : `${(monthsToGoal / 12).toFixed(1)} år`
                      }
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      {(() => {
                        const targetDate = new Date()
                        targetDate.setMonth(targetDate.getMonth() + monthsToGoal)
                        return `🗓️ ~${targetDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })}`
                      })()}
                    </div>
                  </div>

                  {/* Visuell tidslinje */}
                  <div style={{ position: 'relative', padding: '0 8px', marginBottom: 8 }}>
                    <div style={{
                      height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', width: `${Math.min((1 / monthsToGoal) * 100, 100)}%`,
                        background: 'linear-gradient(90deg, #ffd93d, #f0c020)',
                        borderRadius: 3, transition: 'width 0.5s ease',
                        boxShadow: '0 0 8px rgba(255,217,61,0.4)',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                      <div style={{ fontSize: 9, color: '#ffd93d' }}>Nu</div>
                      <div style={{ fontSize: 9, color: '#64748b' }}>
                        🎯 {goal.toLocaleString()}{symbol}
                      </div>
                    </div>
                  </div>

                  {/* Ackumulerat sparande per tidsperiod */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 10 }}>
                    {milestones.map(m => {
                      const accumulated = Number(goalObj.current_amount) + monthlySavings * m.months
                      const reachedGoal = accumulated >= goal
                      return (
                        <div key={m.label} style={{
                          flex: 1, background: reachedGoal ? 'rgba(255,217,61,0.1)' : '#0b1120',
                          borderRadius: 8, padding: '8px 4px', textAlign: 'center',
                          border: `1px solid ${reachedGoal ? 'rgba(255,217,61,0.3)' : '#1e293b'}`,
                        }}>
                          <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>{m.label}</div>
                          <div style={{
                            fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 700,
                            color: reachedGoal ? '#ffd93d' : '#94a3b8',
                          }}>
                            {accumulated >= 1000
                              ? `${(accumulated / 1000).toFixed(1)}k`
                              : accumulated.toFixed(0)
                            }
                          </div>
                          <div style={{ fontSize: 7, color: '#334155' }}>{symbol}</div>
                          {reachedGoal && <div style={{ fontSize: 8, marginTop: 2 }}>🎯</div>}
                        </div>
                      )
                    })}
                  </div>

                  {/* Motivationsmeddelande */}
                  <div style={{
                    marginTop: 12, padding: '8px 12px', textAlign: 'center',
                    fontSize: 12, color: '#cbd5e1', lineHeight: 1.4,
                    background: 'rgba(0,255,135,0.05)', borderRadius: 10,
                    border: '1px solid rgba(0,255,135,0.1)',
                  }}>
                    {monthsToGoal <= 3
                      ? '🚀 Du är supersnabb! Nästan framme!'
                      : monthsToGoal <= 6
                        ? '💪 Starkt tempo! Halvåret är ditt!'
                        : monthsToGoal <= 12
                          ? '🎯 Inom ett år — varje månad räknas!'
                          : monthsToGoal <= 24
                            ? '🌱 Tålamod lönar sig. Du bygger något stort!'
                            : '🏔️ Stort mål = stor belöning. Steg för steg!'
                    }
                  </div>
                </>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '12px 0',
                  fontSize: 12, color: '#ff6b6b', lineHeight: 1.4,
                }}>
                  😬 Just nu sparar du ingenting — öka inkomsten eller minska utgifterna för att nå målet!
                </div>
              )}

              {/* Ta bort mål */}
              <button
                onClick={() => deleteGoal(goalObj.id)}
                style={{
                  width: '100%', marginTop: 10, padding: '6px 0',
                  background: 'transparent', border: '1px solid #1e293b',
                  borderRadius: 8, color: '#475569', fontSize: 11,
                  cursor: 'pointer', fontFamily: 'Outfit, sans-serif',
                }}
              >
                Ta bort {goalObj.name}
              </button>
            </div>
          )
        })}

        {goals.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4px 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
            Sätt ett sparmål för att se hur lång tid det tar att nå dit! 💰
          </div>
        )}
      </div>
    </div>
  )
}
