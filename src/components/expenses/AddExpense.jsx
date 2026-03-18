import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget, useExpenses } from '../../hooks/useExpenses'
import { useGamification } from '../../hooks/useGamification'
import { useCurrency } from '../../hooks/useCurrency'
import { DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES, getCurrentMonth } from '../../lib/constants'
import { useBudgetStatus } from '../../hooks/useBudgetStatus'

export default function AddExpense({ onExpenseAdded }) {
  const { user, profile } = useAuth()
  const { budget } = useBudget()
  const { expenses } = useExpenses()
  const { awardXP, updateStreak, checkExpenseCount } = useGamification()
  const { symbol } = useCurrency()
  const { budgetStatus } = useBudgetStatus()

  const [expenseType, setExpenseType] = useState('shared')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberCount, setMemberCount] = useState(1)
  const [splitMode, setSplitMode] = useState('full') // 'full' = jag betalade allt, 'mine' = redan min del
  const [budgetWarning, setBudgetWarning] = useState(null)

  useEffect(() => {
    if (profile?.household_id) {
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', profile.household_id)
        .then(({ count }) => setMemberCount(count || 1))
    }
  }, [profile?.household_id])

  const sharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const personalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const categories = expenseType === 'shared' ? sharedCats : expenseType === 'personal' ? personalCats : []

  // Beräkna spenderat per kategori för budget-varning
  const categorySpend = {}
  const currentMonth = getCurrentMonth()
  expenses.filter(e => e.date?.startsWith(currentMonth) && e.expense_type === expenseType).forEach(e => {
    // Personliga utgifter: räkna bara egna. Delade: räkna min andel av alla.
    if (expenseType === 'personal' && e.user_id !== user?.id) return
    const amt = e.expense_type === 'shared' ? Number(e.amount) / memberCount : Number(e.amount)
    categorySpend[e.category] = (categorySpend[e.category] || 0) + amt
  })

  const daysInMonth = new Date(
    parseInt(currentMonth.split('-')[0]),
    parseInt(currentMonth.split('-')[1]),
    0
  ).getDate()
  const currentDay = new Date().getDate()
  const daysLeft = daysInMonth - currentDay + 1

  const parsedAmount = parseFloat(amount) || 0
  // 'full' = beloppet är totalt, delas på alla. 'mine' = redan min del, totalt = belopp * memberCount
  const totalSharedAmount = expenseType === 'shared' && splitMode === 'mine' ? parsedAmount * memberCount : parsedAmount
  const myShare = memberCount > 1 && expenseType === 'shared'
    ? (splitMode === 'full' ? parsedAmount / memberCount : parsedAmount)
    : parsedAmount

  async function handleSubmit() {
    if (!amount) {
      setError('Fyll i belopp')
      return
    }
    if (expenseType !== 'income' && !category) {
      setError('Välj en kategori')
      return
    }
    const parsed = parseFloat(amount)
    if (isNaN(parsed) || parsed <= 0 || !isFinite(parsed)) {
      setError('Ogiltigt belopp')
      return
    }

    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (expenseType === 'income') {
        // Insert new income entry for current month
        const month = getCurrentMonth()
        const { error: incErr } = await supabase.from('income').insert({
          household_id: profile.household_id,
          user_id: user.id,
          month,
          amount: parsed,
          description: description || '',
        })
        if (incErr) throw incErr

        await awardXP(10)
        setSuccess(`Inkomst ${parsed.toFixed(0)} ${symbol} tillagd!`)
        setAmount('')
        setDescription('')
        if (onExpenseAdded) onExpenseAdded()
      } else {
        const today = new Date().toISOString().split('T')[0]
        // For shared expenses: always save the TOTAL amount so dashboard splits correctly
        const saveAmount = expenseType === 'shared' && splitMode === 'mine'
          ? parsed * memberCount
          : parsed
        // paid_amount = vad loggaren faktiskt betalade (för Pengapusslet)
        const paidAmount = expenseType === 'shared'
          ? (splitMode === 'full' ? saveAmount : parsed)
          : saveAmount
        const { error: insertErr } = await supabase.from('expenses').insert({
          household_id: profile.household_id,
          user_id: user.id,
          date: today,
          amount: saveAmount,
          paid_amount: paidAmount,
          description,
          category,
          expense_type: expenseType,
        })
        if (insertErr) throw insertErr

        await updateStreak()
        await awardXP(25)

        const { count } = await supabase
          .from('expenses')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
        await checkExpenseCount(count)

        setSuccess(`${parsed.toFixed(0)} ${symbol} loggad!`)
        setAmount('')
        setDescription('')

        // Check budget warning for this category
        if (budgetStatus?.categories) {
          const bc = budgetStatus.categories.find(c => c.category === category)
          if (bc) {
            const pctUsed = Number(bc.household_pct) || 0
            if (pctUsed >= 75) {
              const remaining = Number(bc.budget_amount) - Number(bc.household_spent)
              setBudgetWarning({
                category,
                pct: pctUsed,
                remaining,
                over: pctUsed >= 100,
              })
              setTimeout(() => setBudgetWarning(null), 3000)
            }
          }
        }

        setCategory('')
        if (onExpenseAdded) onExpenseAdded()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (success) setTimeout(() => setSuccess(''), 3000)
    }
  }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Type Toggle */}
      <div style={{
        display: 'flex',
        background: '#0b1120',
        borderRadius: 14,
        padding: 4,
        marginBottom: 20,
        border: '1px solid #1e293b',
      }}>
        {[
          { id: 'shared', label: '👥 Gemensam', color: '#ff79c6' },
          { id: 'personal', label: '👤 Personlig', color: '#00ff87' },
          { id: 'income', label: '💰 Inkomst', color: '#ffd93d' },
        ].map(type => (
          <button
            key={type.id}
            onClick={() => { setExpenseType(type.id); setCategory(''); setError(''); setSuccess('') }}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.2s',
              background: expenseType === type.id
                ? `linear-gradient(135deg, ${type.color}33, ${type.color}1a)`
                : 'transparent',
              color: expenseType === type.id ? type.color : '#64748b',
              boxShadow: expenseType === type.id
                ? `0 0 10px ${type.color}33`
                : 'none',
            }}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <div style={{
        background: '#0b1120',
        border: `2px solid ${amount
          ? expenseType === 'income' ? '#ffd93d' : '#00ff87'
          : '#1e293b'}`,
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: expenseType === 'shared' && memberCount > 1 && parsedAmount > 0 ? 8 : 20,
        transition: 'border-color 0.2s',
        boxShadow: amount
          ? expenseType === 'income'
            ? '0 0 20px rgba(255,217,61,0.15)'
            : '0 0 20px rgba(0,255,135,0.15)'
          : 'none',
      }}>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
          {expenseType === 'income' ? 'MÅNADSINKOMST (NETTO)' : 'BELOPP'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            aria-label="Belopp"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 36,
              fontWeight: 700,
              color: amount
                ? expenseType === 'income' ? '#ffd93d' : '#00ff87'
                : '#1e293b',
              textShadow: amount
                ? expenseType === 'income'
                  ? '0 0 15px rgba(255,217,61,0.6)'
                  : '0 0 15px rgba(0,255,135,0.6)'
                : 'none',
              transition: 'all 0.2s',
            }}
          />
          <span style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            color: '#64748b',
            flexShrink: 0,
          }}>{symbol}</span>
        </div>
      </div>

      {/* Split mode toggle for shared expenses */}
      {expenseType === 'shared' && memberCount > 1 && (
        <div style={{ marginBottom: parsedAmount > 0 ? 8 : 20 }}>
          <div style={{
            display: 'flex', background: '#0b1120', borderRadius: 10, padding: 3,
            border: '1px solid #1e293b',
          }}>
            {[
              { id: 'full', label: 'Jag betalade allt', icon: '💳' },
              { id: 'mine', label: 'Redan min del', icon: '✂️' },
            ].map(mode => (
              <button
                key={mode.id}
                onClick={() => setSplitMode(mode.id)}
                style={{
                  flex: 1, padding: '9px 6px', border: 'none', borderRadius: 8,
                  cursor: 'pointer', fontFamily: 'Outfit, sans-serif', fontWeight: 600,
                  fontSize: 12, transition: 'all 0.2s',
                  background: splitMode === mode.id
                    ? 'linear-gradient(135deg, rgba(255,121,198,0.2), rgba(255,121,198,0.1))'
                    : 'transparent',
                  color: splitMode === mode.id ? '#ff79c6' : '#475569',
                }}
              >
                {mode.icon} {mode.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Split result indicator */}
      {expenseType === 'shared' && memberCount > 1 && parsedAmount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,121,198,0.08), rgba(255,121,198,0.03))',
          border: '1px solid rgba(255,121,198,0.2)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 20,
        }}>
          {splitMode === 'full' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                💳 Totalt {parsedAmount.toFixed(0)} {symbol} delas på {memberCount}
              </span>
              <span style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700,
                color: '#ff79c6', textShadow: '0 0 8px rgba(255,121,198,0.5)',
              }}>
                Din del: {myShare.toFixed(0)} {symbol}
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                ✂️ Din del: {parsedAmount.toFixed(0)} {symbol}
              </span>
              <span style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700,
                color: '#475569',
              }}>
                Totalt: {totalSharedAmount.toFixed(0)} {symbol}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Income info */}
      {expenseType === 'income' && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,217,61,0.08), rgba(255,217,61,0.03))',
          border: '1px solid rgba(255,217,61,0.2)',
          borderRadius: 12,
          padding: '12px 14px',
          marginBottom: 20,
          fontSize: 13,
          color: '#94a3b8',
          lineHeight: 1.5,
        }}>
          💡 Lägg till inkomster för <strong style={{ color: '#ffd93d' }}>{getCurrentMonth()}</strong>. Du kan lägga till flera (lön, sidoinkomst, etc).
        </div>
      )}

      {/* Category Grid - only for expenses */}
      {expenseType !== 'income' && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 10 }}>
            KATEGORI
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id)}
                style={{
                  background: category === cat.id
                    ? expenseType === 'shared'
                      ? 'linear-gradient(135deg, rgba(255,121,198,0.2), rgba(255,121,198,0.1))'
                      : 'linear-gradient(135deg, rgba(0,255,135,0.2), rgba(0,255,135,0.1))'
                    : '#0b1120',
                  border: `1px solid ${category === cat.id
                    ? expenseType === 'shared' ? '#ff79c6' : '#00ff87'
                    : '#1e293b'}`,
                  borderRadius: 12,
                  padding: '14px 8px',
                  minHeight: 44,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: category === cat.id
                    ? expenseType === 'shared'
                      ? '0 0 10px rgba(255,121,198,0.3)'
                      : '0 0 10px rgba(0,255,135,0.3)'
                    : 'none',
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 4 }}>{cat.icon}</div>
                <div style={{
                  fontSize: 10,
                  color: category === cat.id
                    ? expenseType === 'shared' ? '#ff79c6' : '#00ff87'
                    : '#94a3b8',
                  fontWeight: category === cat.id ? 600 : 400,
                  lineHeight: 1.2,
                }}>
                  {cat.name}
                </div>
              </button>
            ))}
          </div>

          {/* Budget-varning för vald kategori */}
          {category && (() => {
            const selectedCat = categories.find(c => c.id === category)
            if (!selectedCat) return null
            const catBudget = expenseType === 'shared' ? selectedCat.budget / memberCount : selectedCat.budget
            const spent = categorySpend[category] || 0
            const pct = catBudget > 0 ? spent / catBudget : 0
            const remaining = catBudget - spent
            const wouldBeSpent = spent + myShare
            const wouldBePct = catBudget > 0 ? wouldBeSpent / catBudget : 0

            let barColor = '#00ff87'
            let icon = '✅'
            let msg = `${remaining.toFixed(0)}${symbol} kvar`
            if (pct >= 1) { barColor = '#ff6b6b'; icon = '🚨'; msg = `${Math.abs(remaining).toFixed(0)}${symbol} över budget!` }
            else if (pct >= 0.85) { barColor = '#ff6b6b'; icon = '⚠️'; msg = `Bara ${remaining.toFixed(0)}${symbol} kvar — ${daysLeft} dagar kvar` }
            else if (pct >= 0.65) { barColor = '#ffd93d'; icon = '💡'; msg = `${remaining.toFixed(0)}${symbol} kvar med ${daysLeft} dagar kvar` }

            return (
              <div style={{
                background: pct >= 0.85
                  ? 'rgba(255,107,107,0.08)'
                  : pct >= 0.65
                    ? 'rgba(255,217,61,0.08)'
                    : 'rgba(0,255,135,0.05)',
                border: `1px solid ${barColor}30`,
                borderRadius: 12,
                padding: '10px 14px',
                marginTop: 8,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                    {icon} {selectedCat.icon} {selectedCat.name}
                  </span>
                  <span style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 11, fontWeight: 700, color: barColor,
                  }}>
                    {spent.toFixed(0)}/{catBudget.toFixed(0)}{symbol}
                  </span>
                </div>
                <div style={{
                  height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginBottom: 6,
                }}>
                  <div style={{
                    height: '100%', width: `${Math.min(pct * 100, 100)}%`,
                    background: barColor, borderRadius: 2, transition: 'width 0.3s ease',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: barColor }}>{msg}</div>
                {parsedAmount > 0 && wouldBePct > 1 && pct <= 1 && (
                  <div style={{
                    fontSize: 11, color: '#ff6b6b', marginTop: 4,
                    fontWeight: 600,
                  }}>
                    ⚠️ Med detta köp hamnar du över budget!
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {/* Description */}
      <input
        type="text"
        placeholder={expenseType === 'income' ? 'T.ex. Lön, freelance, bonus...' : 'Beskrivning (valfritt)'}
        value={description}
        onChange={e => setDescription(e.target.value)}
        style={{
          width: '100%',
          background: '#0b1120',
          border: '1px solid #1e293b',
          borderRadius: 12,
          padding: '12px 16px',
          color: '#e2e8f0',
          fontFamily: 'Outfit, sans-serif',
          fontSize: 14,
          outline: 'none',
          marginBottom: 20,
        }}
        onFocus={e => e.target.style.borderColor = expenseType === 'income' ? '#ffd93d' : '#00f0ff'}
        onBlur={e => e.target.style.borderColor = '#1e293b'}
      />

      {error && (
        <div style={{
          background: 'rgba(255,107,107,0.1)',
          border: '1px solid #ff6b6b',
          borderRadius: 8,
          padding: '10px 14px',
          color: '#ff6b6b',
          fontSize: 13,
          marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          background: 'rgba(0,255,135,0.1)',
          border: '1px solid #00ff87',
          borderRadius: 8,
          padding: '10px 14px',
          color: '#00ff87',
          fontSize: 13,
          marginBottom: 12,
          textAlign: 'center',
        }}>
          {success}
        </div>
      )}

      {budgetWarning && (() => {
        const cat = categories.find(c => c.id === budgetWarning.category)
        const icon = budgetWarning.over ? '🚨' : '⚠️'
        const color = budgetWarning.over ? '#ff6b6b' : '#ff9f43'
        return (
          <div style={{
            background: `${color}12`,
            border: `1px solid ${color}40`,
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 12,
            animation: 'fadeIn 0.3s ease',
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 2 }}>
              {icon} {cat?.icon} {cat?.name || budgetWarning.category}: {budgetWarning.pct.toFixed(0)}% av budget
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>
              {budgetWarning.over
                ? `Över budget med ${Math.abs(budgetWarning.remaining).toFixed(0)}${symbol}!`
                : `Bara ${budgetWarning.remaining.toFixed(0)}${symbol} kvar`
              }
            </div>
          </div>
        )
      })()}

      {/* Submit */}
      {(() => {
        const isIncome = expenseType === 'income'
        const canSubmit = isIncome ? !!amount : (!!amount && !!category)
        const btnBg = !canSubmit
          ? '#1e293b'
          : isIncome
            ? 'linear-gradient(135deg, #ffd93d, #f0c020)'
            : expenseType === 'shared'
              ? 'linear-gradient(135deg, #ff79c6, #cc5ca0)'
              : 'linear-gradient(135deg, #00ff87, #00cc6a)'
        const btnShadow = !canSubmit
          ? 'none'
          : isIncome
            ? '0 0 20px rgba(255,217,61,0.3)'
            : expenseType === 'shared'
              ? '0 0 20px rgba(255,121,198,0.3)'
              : '0 0 20px rgba(0,255,135,0.3)'
        const btnLabel = isIncome
          ? '💰 Spara inkomst (+10 XP)'
          : '⚡ Logga utgift (+25 XP)'

        return (
          <button
            onClick={handleSubmit}
            disabled={loading || !canSubmit}
            style={{
              width: '100%',
              background: btnBg,
              border: 'none',
              borderRadius: 14,
              padding: '16px 0',
              color: !canSubmit ? '#94a3b8' : '#020617',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 700,
              fontSize: 16,
              cursor: !canSubmit ? 'default' : 'pointer',
              transition: 'all 0.2s',
              boxShadow: btnShadow,
            }}
          >
            {loading ? 'Sparar...' : btnLabel}
          </button>
        )
      })()}
    </div>
  )
}
