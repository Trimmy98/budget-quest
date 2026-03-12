import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { getMonthGrade, getCurrentMonth } from '../../lib/constants'
import ProgressBar from '../shared/ProgressBar'

export default function Personal({ selectedMonth }) {
  const { user, profile } = useAuth()
  const { expenses } = useExpenses(selectedMonth)
  const { budget } = useBudget()
  const { myIncome, refetch: refetchIncome } = useIncome(selectedMonth)
  const [incomeInput, setIncomeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const personalCategories = budget?.personal_categories || []
  const myPersonalExpenses = expenses.filter(e => e.user_id === user?.id && e.expense_type === 'personal')
  const memberCount = 1 // personal section shows individual

  const categorySpend = {}
  myPersonalExpenses.forEach(e => {
    categorySpend[e.category] = (categorySpend[e.category] || 0) + Number(e.amount)
  })

  const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
  const householdMemberCount = new Set(expenses.map(e => e.user_id)).size || 1
  const myShareOfShared = sharedExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / householdMemberCount
  const myPersonalTotal = myPersonalExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const mySaved = myIncome - myShareOfShared - myPersonalTotal
  const savingsRate = myIncome > 0 ? mySaved / myIncome : 0

  const { grade, color: gradeColor } = getMonthGrade(savingsRate)

  async function handleSaveIncome() {
    if (!incomeInput) return
    setSaving(true)
    try {
      await supabase.from('income').upsert({
        household_id: profile.household_id,
        user_id: user.id,
        month: selectedMonth,
        amount: parseFloat(incomeInput),
      }, { onConflict: 'user_id,month' })
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

  return (
    <div style={{ padding: '16px 16px 24px' }}>
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
            {myIncome.toFixed(2)}€
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
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
              {mySaved >= 0 ? '+' : ''}{mySaved.toFixed(2)}€ sparat
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
                  {spent.toFixed(0)}/{cat.budget}€
                </span>
              </div>
              <ProgressBar value={spent} max={cat.budget} color={isOver ? '#ff6b6b' : '#00ff87'} height={5} />
              <div style={{ fontSize: 10, color: isOver ? '#ff6b6b' : '#64748b', marginTop: 2, textAlign: 'right' }}>
                {isOver
                  ? `${(spent - cat.budget).toFixed(0)}€ över budget`
                  : `${(cat.budget - spent).toFixed(0)}€ kvar`}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
