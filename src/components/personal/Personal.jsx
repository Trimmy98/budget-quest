import React, { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { getMonthGrade, getCurrentMonth } from '../../lib/constants'
import { useCurrency } from '../../hooks/useCurrency'
import ProgressBar from '../shared/ProgressBar'

export default function Personal({ selectedMonth }) {
  const { user, profile } = useAuth()
  const { expenses } = useExpenses(selectedMonth)
  const { budget } = useBudget()
  const { myIncome, refetch: refetchIncome } = useIncome(selectedMonth)
  const [incomeInput, setIncomeInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const { symbol } = useCurrency()
  const [simCut, setSimCut] = useState(0)
  const [simExtra, setSimExtra] = useState(0)

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
            {myIncome.toFixed(2)}{symbol}
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
              {mySaved >= 0 ? '+' : ''}{mySaved.toFixed(2)}{symbol} sparat
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
    </div>
  )
}
