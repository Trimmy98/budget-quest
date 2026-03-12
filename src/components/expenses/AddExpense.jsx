import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../hooks/useExpenses'
import { useGamification } from '../../hooks/useGamification'

export default function AddExpense({ onExpenseAdded }) {
  const { user, profile } = useAuth()
  const { budget } = useBudget()
  const { awardXP, updateStreak, checkExpenseCount } = useGamification()

  const [expenseType, setExpenseType] = useState('shared')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const categories = expenseType === 'shared'
    ? (budget?.shared_categories || [])
    : (budget?.personal_categories || [])

  async function handleSubmit() {
    if (!amount || !category) {
      setError('Fyll i belopp och kategori')
      return
    }
    if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setError('Ogiltigt belopp')
      return
    }

    setLoading(true)
    setError('')

    try {
      const today = new Date().toISOString().split('T')[0]
      const { error: insertErr } = await supabase.from('expenses').insert({
        household_id: profile.household_id,
        user_id: user.id,
        date: today,
        amount: parseFloat(amount),
        description,
        category,
        expense_type: expenseType,
      })
      if (insertErr) throw insertErr

      await updateStreak()
      await awardXP(25)

      // Check expense count for achievements
      const { count } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
      await checkExpenseCount(count)

      setAmount('')
      setCategory('')
      setDescription('')
      if (onExpenseAdded) onExpenseAdded()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
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
        {['shared', 'personal'].map(type => (
          <button
            key={type}
            onClick={() => { setExpenseType(type); setCategory('') }}
            style={{
              flex: 1,
              padding: '10px 0',
              border: 'none',
              borderRadius: 10,
              cursor: 'pointer',
              fontFamily: 'Outfit, sans-serif',
              fontWeight: 600,
              fontSize: 14,
              transition: 'all 0.2s',
              background: expenseType === type
                ? type === 'shared'
                  ? 'linear-gradient(135deg, rgba(255,121,198,0.2), rgba(255,121,198,0.1))'
                  : 'linear-gradient(135deg, rgba(0,255,135,0.2), rgba(0,255,135,0.1))'
                : 'transparent',
              color: expenseType === type
                ? type === 'shared' ? '#ff79c6' : '#00ff87'
                : '#64748b',
              boxShadow: expenseType === type
                ? type === 'shared'
                  ? '0 0 10px rgba(255,121,198,0.2)'
                  : '0 0 10px rgba(0,255,135,0.2)'
                : 'none',
            }}
          >
            {type === 'shared' ? '👥 Gemensam' : '👤 Personlig'}
          </button>
        ))}
      </div>

      {/* Amount Input */}
      <div style={{
        background: '#0b1120',
        border: `2px solid ${amount ? '#00ff87' : '#1e293b'}`,
        borderRadius: 16,
        padding: '16px 20px',
        marginBottom: 20,
        transition: 'border-color 0.2s',
        boxShadow: amount ? '0 0 20px rgba(0,255,135,0.15)' : 'none',
      }}>
        <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
          BELOPP
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 36,
              fontWeight: 700,
              color: amount ? '#00ff87' : '#1e293b',
              textShadow: amount ? '0 0 15px rgba(0,255,135,0.6)' : 'none',
              transition: 'all 0.2s',
            }}
          />
          <span style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 20,
            color: '#64748b',
          }}>€</span>
        </div>
      </div>

      {/* Category Grid */}
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
                padding: '10px 8px',
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

      {/* Description */}
      <input
        type="text"
        placeholder="Beskrivning (valfritt)"
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
        onFocus={e => e.target.style.borderColor = '#00f0ff'}
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

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={loading || !amount || !category}
        style={{
          width: '100%',
          background: !amount || !category
            ? '#1e293b'
            : expenseType === 'shared'
              ? 'linear-gradient(135deg, #ff79c6, #cc5ca0)'
              : 'linear-gradient(135deg, #00ff87, #00cc6a)',
          border: 'none',
          borderRadius: 14,
          padding: '16px 0',
          color: !amount || !category ? '#64748b' : '#020617',
          fontFamily: 'Outfit, sans-serif',
          fontWeight: 700,
          fontSize: 16,
          cursor: !amount || !category ? 'default' : 'pointer',
          transition: 'all 0.2s',
          boxShadow: amount && category
            ? expenseType === 'shared'
              ? '0 0 20px rgba(255,121,198,0.3)'
              : '0 0 20px rgba(0,255,135,0.3)'
            : 'none',
        }}
      >
        {loading ? 'Loggar...' : `⚡ Logga utgift (+25 XP)`}
      </button>
    </div>
  )
}
