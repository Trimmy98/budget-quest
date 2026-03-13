import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../hooks/useExpenses'
import { useGamification } from '../../hooks/useGamification'
import { useCurrency } from '../../hooks/useCurrency'
import { DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES, getCurrentMonth } from '../../lib/constants'

export default function AddExpense({ onExpenseAdded }) {
  const { user, profile } = useAuth()
  const { budget } = useBudget()
  const { awardXP, updateStreak, checkExpenseCount } = useGamification()
  const { symbol } = useCurrency()

  const [expenseType, setExpenseType] = useState('shared')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [memberCount, setMemberCount] = useState(1)
  const [splitMode, setSplitMode] = useState('full') // 'full' = jag betalade allt, 'mine' = redan min del

  useEffect(() => {
    if (profile?.household_id) {
      supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('household_id', profile.household_id)
        .then(({ count }) => setMemberCount(count || 1))
    }
  }, [profile])

  const sharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const personalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const categories = expenseType === 'shared' ? sharedCats : expenseType === 'personal' ? personalCats : []

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
      setError('Fyll i belopp och kategori')
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
          description: description || null,
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
        setCategory('')
        setDescription('')
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
