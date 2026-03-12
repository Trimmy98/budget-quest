import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { getLevelInfo, getMonthGrade, getCurrentMonth, ACHIEVEMENTS } from '../../lib/constants'
import { useCurrency } from '../../hooks/useCurrency'
import ProgressRing from '../shared/ProgressRing'
import ProgressBar from '../shared/ProgressBar'

export default function Dashboard({ gamification, allGamification, selectedMonth }) {
  const { user, profile, household } = useAuth()
  const { expenses } = useExpenses(selectedMonth)
  const { budget } = useBudget()
  const { allIncome, myIncome, totalIncome } = useIncome(selectedMonth)
  const { symbol } = useCurrency()
  const [members, setMembers] = useState([])

  useEffect(() => {
    if (profile?.household_id) fetchMembers()
  }, [profile])

  async function fetchMembers() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('household_id', profile.household_id)
    setMembers(data || [])
  }

  const memberCount = members.length || 1
  const myExpenses = expenses.filter(e => e.user_id === user?.id)
  const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
  const personalExpenses = myExpenses.filter(e => e.expense_type === 'personal')

  const myShareOfShared = sharedExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / memberCount
  const myPersonalTotal = personalExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
  const mySaved = myIncome - myShareOfShared - myPersonalTotal
  const savingsRate = myIncome > 0 ? mySaved / myIncome : 0

  const { grade, color: gradeColor } = getMonthGrade(savingsRate)
  const levelInfo = gamification ? getLevelInfo(gamification.xp) : null

  const today = new Date().toISOString().split('T')[0]
  const daysInMonth = new Date(
    parseInt(selectedMonth.split('-')[0]),
    parseInt(selectedMonth.split('-')[1]),
    0
  ).getDate()
  const currentDay = new Date().getDate()
  const daysLeft = daysInMonth - currentDay + 1
  const remainingBudget = (budget?.shared_categories || []).reduce((sum, c) => sum + c.budget, 0) / memberCount +
    (budget?.personal_categories || []).reduce((sum, c) => sum + c.budget, 0) - myShareOfShared - myPersonalTotal
  const perDay = daysLeft > 0 ? remainingBudget / daysLeft : 0

  // Leaderboard
  const leaderboard = allGamification
    .map(g => {
      const member = members.find(m => m.id === g.user_id)
      const memberIncome = allIncome.find(i => i.user_id === g.user_id)?.amount || 0
      const memberShared = sharedExpenses.reduce((sum, e) => sum + Number(e.amount), 0) / memberCount
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

  const topXP = leaderboard[0]?.xp || 0

  // Category spending
  const sharedCategories = budget?.shared_categories || []
  const categorySpend = {}
  sharedExpenses.forEach(e => {
    categorySpend[e.category] = (categorySpend[e.category] || 0) + Number(e.amount)
  })

  const recentExpenses = expenses.slice(0, 5)

  const weeklyChallenge = budget?.weekly_challenge

  const badgeCount = gamification?.achievements?.length || 0

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Level Card */}
      {levelInfo && (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a, #1e293b)',
          border: '1px solid rgba(0,240,255,0.2)',
          borderRadius: 20,
          padding: 20,
          marginBottom: 12,
          boxShadow: '0 0 20px rgba(0,240,255,0.08)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <ProgressRing progress={levelInfo.progress} size={72} strokeWidth={5} color="#00f0ff">
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 18,
                  fontWeight: 900,
                  color: '#00f0ff',
                  textShadow: '0 0 10px rgba(0,240,255,0.8)',
                }}>
                  {levelInfo.level}
                </div>
              </div>
            </ProgressRing>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1 }}>
                LVL {levelInfo.level}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0', marginBottom: 6 }}>
                {levelInfo.title}
              </div>
              <ProgressBar value={levelInfo.xpInLevel} max={levelInfo.xpNeeded} color="#00f0ff" height={4} />
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                {levelInfo.xpInLevel} / {levelInfo.xpNeeded} XP
                {levelInfo.nextLevel && <span> till {levelInfo.nextLevel.title}</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: 'Streak', value: `${gamification?.streak_current || 0}🔥`, color: '#ff79c6' },
          { label: 'Kvar/dag', value: `${perDay.toFixed(0)}${symbol}`, color: perDay >= 0 ? '#00ff87' : '#ff6b6b' },
          { label: 'Badges', value: `${badgeCount}🏅`, color: '#ffd93d' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 14,
            padding: '12px 10px',
            textAlign: 'center',
          }}>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 16,
              fontWeight: 700,
              color: stat.color,
              textShadow: `0 0 8px ${stat.color}60`,
            }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Monthly Grade */}
      <div style={{
        background: `linear-gradient(135deg, ${gradeColor}15, ${gradeColor}05)`,
        border: `1px solid ${gradeColor}40`,
        borderRadius: 20,
        padding: 20,
        marginBottom: 12,
        textAlign: 'center',
        boxShadow: `0 0 20px ${gradeColor}15`,
      }}>
        <div style={{ fontSize: 11, color: '#64748b', letterSpacing: 1, fontFamily: 'Orbitron, sans-serif', marginBottom: 4 }}>
          MÅNADSBETYG
        </div>
        <div style={{
          fontFamily: 'Orbitron, sans-serif',
          fontSize: 56,
          fontWeight: 900,
          color: gradeColor,
          textShadow: `0 0 30px ${gradeColor}`,
          lineHeight: 1,
        }}>
          {grade}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 6 }}>
          {(savingsRate * 100).toFixed(1)}% sparkvot
        </div>
      </div>

      {/* Monthly Report with Personality */}
      {myIncome > 0 && (() => {
        const totalSpent = myShareOfShared + myPersonalTotal
        const spendRatio = totalSpent / myIncome
        const topCategory = Object.entries(
          myExpenses.reduce((acc, e) => {
            const cat = [...(budget?.shared_categories || []), ...(budget?.personal_categories || [])]
              .find(c => c.id === e.category)
            const name = cat ? `${cat.icon} ${cat.name}` : e.category
            acc[name] = (acc[name] || 0) + Number(e.amount)
            return acc
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]

        const expenseDays = [...new Set(myExpenses.map(e => e.date))].length
        const avgPerExpenseDay = expenseDays > 0 ? totalSpent / expenseDays : 0

        // Personality based on savings rate and patterns
        let title, subtitle, emoji, borderColor
        if (savingsRate >= 0.3) {
          title = 'Spartanskt Geni'
          subtitle = 'Du sparar som en mästare. Pengarna böjer sig inför din vilja.'
          emoji = '🧠'
          borderColor = '#00ff87'
        } else if (savingsRate >= 0.2) {
          title = 'Balanserad Budgetör'
          subtitle = 'Stabilt sparande och kontrollerat spenderande. Du har koll!'
          emoji = '⚖️'
          borderColor = '#00f0ff'
        } else if (savingsRate >= 0.1) {
          title = 'Försiktig Utforskare'
          subtitle = 'Du är på rätt väg, men det finns mer att hämta. Fortsätt kämpa!'
          emoji = '🧭'
          borderColor = '#ffd93d'
        } else if (savingsRate >= 0) {
          title = 'Levande Livet'
          subtitle = 'Du njuter av stunden! Men lite sparande gör framtiden roligare.'
          emoji = '🎪'
          borderColor = '#ff79c6'
        } else {
          title = 'Röda Riddaren'
          subtitle = 'Utgifterna har tagit överhanden. Dags att slå tillbaka!'
          emoji = '⚔️'
          borderColor = '#ff6b6b'
        }

        // Fun facts
        const facts = []
        if (topCategory) {
          facts.push(`Mest pengar gick till ${topCategory[0]} (${topCategory[1].toFixed(0)}${symbol})`)
        }
        if (expenseDays > 0) {
          facts.push(`Du handlade ${expenseDays} av ${daysInMonth} dagar`)
        }
        if (avgPerExpenseDay > 0) {
          facts.push(`Snitt ${avgPerExpenseDay.toFixed(0)}${symbol} per shoppingdag`)
        }
        if (myExpenses.length > 0) {
          facts.push(`Totalt ${myExpenses.length} transaktioner`)
        }

        return (
          <div style={{
            background: `linear-gradient(135deg, ${borderColor}10, ${borderColor}05)`,
            border: `1px solid ${borderColor}40`,
            borderRadius: 20,
            padding: 20,
            marginBottom: 12,
          }}>
            <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 10 }}>
              MÅNADSRAPPORT
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                fontSize: 40,
                lineHeight: 1,
                filter: `drop-shadow(0 0 10px ${borderColor})`,
              }}>
                {emoji}
              </div>
              <div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 18,
                  fontWeight: 800,
                  color: borderColor,
                  textShadow: `0 0 15px ${borderColor}60`,
                  marginBottom: 4,
                }}>
                  {title}
                </div>
                <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.4 }}>
                  {subtitle}
                </div>
              </div>
            </div>

            {/* Fun facts */}
            <div style={{
              background: '#0b112080',
              borderRadius: 12,
              padding: 12,
            }}>
              {facts.map((fact, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '5px 0',
                  borderBottom: i < facts.length - 1 ? '1px solid #1e293b' : 'none',
                }}>
                  <span style={{ fontSize: 10, color: borderColor }}>▸</span>
                  <span style={{ fontSize: 12, color: '#cbd5e1' }}>{fact}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
            LEADERBOARD
          </div>
          {leaderboard.map((member, i) => (
            <div key={member.user_id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 0',
              borderBottom: i < leaderboard.length - 1 ? '1px solid #1e293b' : 'none',
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: i === 0 ? 'linear-gradient(135deg, #ffd93d, #ff9500)' :
                  i === 1 ? 'linear-gradient(135deg, #94a3b8, #64748b)' :
                  'linear-gradient(135deg, #cd7c3a, #9a5c28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#020617',
                fontFamily: 'Orbitron, sans-serif',
                flexShrink: 0,
              }}>
                {i + 1}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                    {member.displayName}
                  </span>
                  {member.xp === topXP && leaderboard.length > 1 && (
                    <span style={{ fontSize: 12 }}>👑</span>
                  )}
                </div>
                <div style={{ fontSize: 10, color: '#64748b' }}>
                  Lv.{member.level} {member.title} • {member.streak_current || 0}🔥
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 12,
                  color: '#00f0ff',
                }}>
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
          ))}
        </div>
      )}

      {/* Weekly Challenge */}
      {weeklyChallenge && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,121,198,0.1), rgba(255,121,198,0.05))',
          border: '1px solid rgba(255,121,198,0.3)',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 11, color: '#ff79c6', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
            ⚔️ VECKOUTMANING
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
            {weeklyChallenge.title}
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>
            {weeklyChallenge.description}
          </div>
          <div style={{ fontSize: 12, color: '#ffd93d' }}>
            🏆 {weeklyChallenge.xp} XP belöning
          </div>
        </div>
      )}

      {/* Personal Summary */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          MIN MÅNADSÖVERSIKT
        </div>
        {[
          { label: 'Inkomst', value: myIncome, color: '#00ff87', sign: '+' },
          { label: 'Gemensamt (min andel)', value: -myShareOfShared, color: '#ff6b6b', sign: '-' },
          { label: 'Personligt', value: -myPersonalTotal, color: '#ff79c6', sign: '-' },
        ].map(row => (
          <div key={row.label} style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid #1e293b',
          }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>{row.label}</span>
            <span style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 13,
              color: row.color,
            }}>
              {row.sign}{Math.abs(row.value).toFixed(2)}{symbol}
            </span>
          </div>
        ))}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 0 0',
        }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0' }}>SPARAT</span>
          <span style={{
            fontFamily: 'Orbitron, sans-serif',
            fontSize: 16,
            fontWeight: 700,
            color: mySaved >= 0 ? '#00ff87' : '#ff6b6b',
            textShadow: mySaved >= 0 ? '0 0 10px rgba(0,255,135,0.5)' : '0 0 10px rgba(255,107,107,0.5)',
          }}>
            {mySaved >= 0 ? '+' : ''}{mySaved.toFixed(2)}{symbol}
          </span>
        </div>
      </div>

      {/* Budget Progress */}
      {sharedCategories.length > 0 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
            GEMENSAM BUDGET
          </div>
          {sharedCategories.map(cat => {
            const spent = categorySpend[cat.id] || 0
            const isOver = spent > cat.budget
            return (
              <div key={cat.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.icon} {cat.name}</span>
                  <span style={{
                    fontSize: 12,
                    fontFamily: 'Orbitron, sans-serif',
                    color: isOver ? '#ff6b6b' : '#00f0ff',
                  }}>
                    {spent.toFixed(0)}/{cat.budget}{symbol}
                  </span>
                </div>
                <ProgressBar
                  value={spent}
                  max={cat.budget}
                  color={isOver ? '#ff6b6b' : '#00f0ff'}
                  height={5}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Recent Expenses */}
      {recentExpenses.length > 0 && (
        <div style={{
          background: '#0f172a',
          border: '1px solid #1e293b',
          borderRadius: 20,
          padding: 16,
          marginBottom: 12,
        }}>
          <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
            SENASTE UTGIFTER
          </div>
          {recentExpenses.map(expense => {
            const cat = [...(budget?.shared_categories || []), ...(budget?.personal_categories || [])]
              .find(c => c.id === expense.category)
            return (
              <div key={expense.id} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid #0f172a',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{cat?.icon || '📦'}</span>
                  <div>
                    <div style={{ fontSize: 13, color: '#e2e8f0' }}>
                      {expense.description || cat?.name || expense.category}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                      {expense.date} • {expense.expense_type === 'shared' ? '👥' : '👤'}
                    </div>
                  </div>
                </div>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif',
                  fontSize: 14,
                  color: expense.expense_type === 'shared' ? '#ff79c6' : '#ff6b6b',
                  fontWeight: 700,
                }}>
                  -{expense.amount}{symbol}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Spending Pattern – bar chart by day */}
      {(() => {
        const dailySpend = {}
        expenses.forEach(e => {
          const day = parseInt(e.date?.split('-')[2])
          if (day) dailySpend[day] = (dailySpend[day] || 0) + Number(e.amount)
        })
        const days = Object.keys(dailySpend).map(Number).sort((a, b) => a - b)
        if (days.length === 0) return null
        const maxSpend = Math.max(...Object.values(dailySpend))
        const topDay = days.find(d => dailySpend[d] === maxSpend)
        const avgSpend = Object.values(dailySpend).reduce((a, b) => a + b, 0) / days.length
        const activeDays = days.length
        const quietDays = daysInMonth - activeDays

        return (
          <div style={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 20,
            padding: 16,
          }}>
            <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
              UTGIFTSMÖNSTER
            </div>

            {/* Summary stats */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[
                { label: 'Dyraste dag', value: `Dag ${topDay}`, sub: `${maxSpend.toFixed(0)}${symbol}`, color: '#ff6b6b' },
                { label: 'Snitt/dag', value: `${avgSpend.toFixed(0)}${symbol}`, sub: `${activeDays} aktiva`, color: '#00f0ff' },
                { label: 'Lugna dagar', value: `${quietDays}`, sub: 'inga köp', color: '#00ff87' },
              ].map(s => (
                <div key={s.label} style={{
                  flex: 1,
                  background: '#0b1120',
                  borderRadius: 10,
                  padding: '8px 6px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 9, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: 9, color: '#475569' }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Bar chart */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 2,
              height: 80,
              padding: '0 2px',
            }}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                const spend = dailySpend[day] || 0
                const height = maxSpend > 0 ? (spend / maxSpend) * 100 : 0
                const isToday = day === currentDay && selectedMonth === getCurrentMonth()
                const barColor = spend === maxSpend && spend > 0
                  ? '#ff6b6b'
                  : spend > avgSpend
                    ? '#ffd93d'
                    : spend > 0
                      ? '#00f0ff'
                      : '#1e293b'
                return (
                  <div key={day} style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}>
                    <div style={{
                      width: '100%',
                      height: `${Math.max(height, 3)}%`,
                      background: barColor,
                      borderRadius: '3px 3px 0 0',
                      opacity: spend > 0 ? 1 : 0.3,
                      boxShadow: spend === maxSpend ? `0 0 6px ${barColor}` : 'none',
                      transition: 'height 0.3s ease',
                    }} />
                    {isToday && (
                      <div style={{
                        width: 4,
                        height: 4,
                        borderRadius: '50%',
                        background: '#00ff87',
                        marginTop: 2,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Day labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ fontSize: 9, color: '#475569' }}>1</span>
              <span style={{ fontSize: 9, color: '#475569' }}>{Math.floor(daysInMonth / 2)}</span>
              <span style={{ fontSize: 9, color: '#475569' }}>{daysInMonth}</span>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, marginTop: 10, justifyContent: 'center' }}>
              {[
                { color: '#ff6b6b', label: 'Högst' },
                { color: '#ffd93d', label: 'Över snitt' },
                { color: '#00f0ff', label: 'Under snitt' },
              ].map(l => (
                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                  <span style={{ fontSize: 9, color: '#64748b' }}>{l.label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
