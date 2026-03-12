import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../hooks/useExpenses'
import { useCurrency } from '../../hooks/useCurrency'
import { ACHIEVEMENTS, getMonthGrade, getCurrentMonth, DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
import ProgressBar from '../shared/ProgressBar'

export default function History({ gamification, selectedMonth }) {
  const { user, profile } = useAuth()
  const { budget } = useBudget()
  const { symbol } = useCurrency()
  const [tab, setTab] = useState('history')
  const [monthData, setMonthData] = useState([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [expandedMonth, setExpandedMonth] = useState(null)

  const sharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const personalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const allCats = [...sharedCats, ...personalCats]

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchMembers().then(() => fetchHistory())
    }
  }, [user, profile])

  async function fetchMembers() {
    const { data } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
    setMembers(data || [])
    return data || []
  }

  async function fetchHistory() {
    setLoading(true)
    try {
      const months = []
      const now = new Date()
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const results = await Promise.all(months.map(async (m) => {
        const startDate = `${m}-01`
        const [year, mon] = m.split('-').map(Number)
        const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

        const [{ data: exps }, { data: inc }] = await Promise.all([
          supabase.from('expenses').select('*').eq('household_id', profile.household_id)
            .gte('date', startDate).lte('date', endDate),
          supabase.from('income').select('*').eq('household_id', profile.household_id).eq('month', m),
        ])

        const expenses = exps || []
        const income = inc || []
        const memCount = Math.max(new Set(expenses.map(e => e.user_id)).size, 1)

        const myIncome = income.find(i => i.user_id === user.id)?.amount || 0
        const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
        const myPersonalExpenses = expenses.filter(e => e.user_id === user.id && e.expense_type === 'personal')
        const sharedTotal = sharedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        const myPersonal = myPersonalExpenses.reduce((s, e) => s + Number(e.amount), 0)
        const myShare = memCount > 0 ? sharedTotal / memCount : 0
        const totalSpent = myShare + myPersonal
        const saved = myIncome - totalSpent
        const rate = myIncome > 0 ? saved / myIncome : 0
        const myExpenses = expenses.filter(e => e.user_id === user.id)

        // Category breakdown
        const categoryBreakdown = {}
        sharedExpenses.forEach(e => {
          if (!categoryBreakdown[e.category]) categoryBreakdown[e.category] = { shared: 0, personal: 0, total: 0, type: 'shared' }
          categoryBreakdown[e.category].shared += Number(e.amount) / memCount
          categoryBreakdown[e.category].total += Number(e.amount) / memCount
        })
        myPersonalExpenses.forEach(e => {
          if (!categoryBreakdown[e.category]) categoryBreakdown[e.category] = { shared: 0, personal: 0, total: 0, type: 'personal' }
          categoryBreakdown[e.category].personal += Number(e.amount)
          categoryBreakdown[e.category].total += Number(e.amount)
        })

        // Top category
        const sortedCats = Object.entries(categoryBreakdown).sort((a, b) => b[1].total - a[1].total)
        const topCat = sortedCats[0]

        // Spending by day of week
        const dayOfWeekSpend = [0, 0, 0, 0, 0, 0, 0]
        myExpenses.forEach(e => {
          const day = new Date(e.date).getDay()
          dayOfWeekSpend[day] += Number(e.amount)
        })
        const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

        return {
          month: m,
          income: myIncome,
          spent: totalSpent,
          sharedShare: myShare,
          personal: myPersonal,
          saved,
          rate,
          grade: getMonthGrade(rate),
          expenseCount: myExpenses.length,
          hasData: myIncome > 0 || myExpenses.length > 0,
          categoryBreakdown,
          sortedCats,
          topCat,
          dayOfWeekSpend,
          dayNames,
        }
      }))

      setMonthData(results)
    } finally {
      setLoading(false)
    }
  }

  const unlocked = gamification?.achievements || []
  const xp = gamification?.xp || 0
  const monthsWithData = monthData.filter(m => m.hasData)
  const currentMonth = getCurrentMonth()

  const recentMonths = monthsWithData.slice(0, 2)
  const trend = recentMonths.length >= 2
    ? { diff: recentMonths[0].rate - recentMonths[1].rate, improving: recentMonths[0].rate > recentMonths[1].rate }
    : null

  const monthNames = {
    '01': 'Januari', '02': 'Februari', '03': 'Mars', '04': 'April',
    '05': 'Maj', '06': 'Juni', '07': 'Juli', '08': 'Augusti',
    '09': 'September', '10': 'Oktober', '11': 'November', '12': 'December',
  }

  function formatMonth(m) {
    const [year, mon] = m.split('-')
    return `${monthNames[mon]} ${year}`
  }

  function getCatInfo(catId) {
    return allCats.find(c => c.id === catId) || { icon: '📦', name: catId, budget: 0 }
  }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Tab Toggle */}
      <div style={{
        display: 'flex',
        background: '#0b1120',
        borderRadius: 14,
        padding: 4,
        marginBottom: 16,
        border: '1px solid #1e293b',
      }}>
        {[
          { id: 'history', label: '📈 Historik' },
          { id: 'badges', label: '🏆 Badges' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
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
              background: tab === t.id
                ? 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))'
                : 'transparent',
              color: tab === t.id ? '#00f0ff' : '#64748b',
              boxShadow: tab === t.id ? '0 0 10px rgba(0,240,255,0.2)' : 'none',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && (
        <>
          {/* Trend Summary */}
          {monthsWithData.length > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, #0f172a, #1e293b)',
              border: '1px solid rgba(0,240,255,0.2)',
              borderRadius: 20,
              padding: 16,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 10 }}>
                TREND
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  {
                    label: 'Snitt sparkvot',
                    value: `${(monthsWithData.reduce((s, m) => s + m.rate, 0) / monthsWithData.length * 100).toFixed(0)}%`,
                    color: '#00f0ff',
                  },
                  {
                    label: 'Bästa månad',
                    value: getMonthGrade(Math.max(...monthsWithData.map(m => m.rate))).grade,
                    color: '#ffd93d',
                  },
                  {
                    label: 'Tot. sparat',
                    value: `${monthsWithData.reduce((s, m) => s + Math.max(m.saved, 0), 0).toFixed(0)}`,
                    sub: symbol,
                    color: '#00ff87',
                  },
                  {
                    label: 'Riktning',
                    value: trend ? (trend.improving ? '📈' : '📉') : '–',
                    sub: trend ? `${trend.diff > 0 ? '+' : ''}${(trend.diff * 100).toFixed(0)}%` : '',
                    color: trend?.improving ? '#00ff87' : '#ff6b6b',
                  },
                ].map(s => (
                  <div key={s.label} style={{
                    flex: 1,
                    background: '#0b1120',
                    borderRadius: 10,
                    padding: '10px 4px',
                    textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 8, color: '#64748b', marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 15, fontWeight: 700, color: s.color }}>
                      {s.value}
                    </div>
                    {s.sub && <div style={{ fontSize: 9, color: s.color }}>{s.sub}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sparkline */}
          {monthsWithData.length >= 2 && (
            <div style={{
              background: '#0f172a',
              border: '1px solid #1e293b',
              borderRadius: 20,
              padding: 16,
              marginBottom: 12,
            }}>
              <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 10 }}>
                SPARKVOT ÖVER TID
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
                {[...monthsWithData].reverse().map(m => {
                  const pct = Math.max(0, Math.min(m.rate * 100, 50))
                  const height = (pct / 50) * 100
                  const isCurrent = m.month === currentMonth
                  return (
                    <div key={m.month} style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', height: '100%', justifyContent: 'flex-end',
                    }}>
                      <div style={{ fontSize: 8, color: m.grade.color, fontFamily: 'Orbitron, sans-serif', marginBottom: 2 }}>
                        {m.grade.grade}
                      </div>
                      <div style={{
                        width: '100%',
                        height: `${Math.max(height, 4)}%`,
                        background: isCurrent ? `linear-gradient(180deg, ${m.grade.color}, ${m.grade.color}60)` : m.grade.color,
                        borderRadius: '4px 4px 0 0',
                        opacity: isCurrent ? 1 : 0.6,
                        boxShadow: isCurrent ? `0 0 8px ${m.grade.color}60` : 'none',
                      }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {[...monthsWithData].reverse().map(m => (
                  <div key={m.month} style={{
                    flex: 1, textAlign: 'center', fontSize: 8,
                    color: m.month === currentMonth ? '#e2e8f0' : '#475569',
                  }}>
                    {monthNames[m.month.split('-')[1]]?.substring(0, 3)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly Cards */}
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Laddar historik...</div>
          ) : monthsWithData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              Ingen data ännu. Börja logga utgifter och ange din inkomst!
            </div>
          ) : (
            monthsWithData.map((m, i) => {
              const prev = monthsWithData[i + 1]
              const rateDiff = prev ? m.rate - prev.rate : null
              const isCurrent = m.month === currentMonth
              const isExpanded = expandedMonth === m.month
              const maxCatSpend = m.sortedCats.length > 0 ? m.sortedCats[0][1].total : 0

              return (
                <div key={m.month} style={{
                  background: isCurrent
                    ? `linear-gradient(135deg, ${m.grade.color}10, ${m.grade.color}05)`
                    : '#0f172a',
                  border: `1px solid ${isCurrent ? `${m.grade.color}40` : '#1e293b'}`,
                  borderRadius: 20,
                  padding: 16,
                  marginBottom: 10,
                }}>
                  {/* Header – clickable to expand */}
                  <div
                    onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                          {formatMonth(m.month)}
                          {isCurrent && <span style={{ fontSize: 11, color: '#00f0ff', marginLeft: 8 }}>pågående</span>}
                        </div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>
                          {m.expenseCount} utgifter • Tryck för {isExpanded ? 'mindre' : 'detaljer'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900,
                          color: m.grade.color, textShadow: `0 0 15px ${m.grade.color}60`, lineHeight: 1,
                        }}>
                          {m.grade.grade}
                        </div>
                        <div style={{ fontSize: 10, color: m.grade.color }}>
                          {(m.rate * 100).toFixed(0)}%
                          {rateDiff !== null && (
                            <span style={{ color: rateDiff >= 0 ? '#00ff87' : '#ff6b6b', marginLeft: 4 }}>
                              {rateDiff >= 0 ? '▲' : '▼'}{Math.abs(rateDiff * 100).toFixed(0)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Summary row */}
                    <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                      {[
                        { label: 'Inkomst', value: m.income, color: '#00ff87' },
                        { label: 'Utgifter', value: m.spent, color: '#ff79c6' },
                        { label: 'Sparat', value: m.saved, color: m.saved >= 0 ? '#00f0ff' : '#ff6b6b' },
                      ].map(s => (
                        <div key={s.label} style={{
                          flex: 1, background: '#0b112080', borderRadius: 10, padding: '8px 4px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>{s.label}</div>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color: s.color }}>
                            {Math.abs(s.value).toFixed(0)}{symbol}
                          </div>
                        </div>
                      ))}
                    </div>

                    <ProgressBar value={Math.max(m.rate, 0)} max={0.3} color={m.grade.color} height={5} />
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div style={{ marginTop: 14, borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                      {/* Shared vs Personal split */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                        <div style={{ flex: 1, background: '#0b1120', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>👥 Gemensamt (din del)</div>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#ff79c6' }}>
                            {m.sharedShare.toFixed(0)}{symbol}
                          </div>
                        </div>
                        <div style={{ flex: 1, background: '#0b1120', borderRadius: 10, padding: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>👤 Personligt</div>
                          <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>
                            {m.personal.toFixed(0)}{symbol}
                          </div>
                        </div>
                      </div>

                      {/* Category breakdown */}
                      {m.sortedCats.length > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 8 }}>
                            KATEGORI FÖR KATEGORI
                          </div>
                          {m.sortedCats.map(([catId, data]) => {
                            const cat = getCatInfo(catId)
                            const catBudget = cat.budget || 0
                            const isOver = catBudget > 0 && data.total > catBudget
                            return (
                              <div key={catId} style={{ marginBottom: 10 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 12, color: '#94a3b8' }}>
                                    {cat.icon} {cat.name}
                                  </span>
                                  <span style={{
                                    fontSize: 11, fontFamily: 'Orbitron, sans-serif',
                                    color: isOver ? '#ff6b6b' : '#e2e8f0',
                                  }}>
                                    {data.total.toFixed(0)}{symbol}
                                    {catBudget > 0 && (
                                      <span style={{ color: '#475569' }}> / {catBudget}{symbol}</span>
                                    )}
                                  </span>
                                </div>
                                {catBudget > 0 && (
                                  <ProgressBar
                                    value={data.total}
                                    max={catBudget}
                                    color={isOver ? '#ff6b6b' : data.type === 'shared' ? '#ff79c6' : '#a78bfa'}
                                    height={4}
                                  />
                                )}
                                {catBudget === 0 && maxCatSpend > 0 && (
                                  <div style={{
                                    height: 4, borderRadius: 4, background: '#1e293b', overflow: 'hidden',
                                  }}>
                                    <div style={{
                                      width: `${(data.total / maxCatSpend) * 100}%`,
                                      height: '100%',
                                      background: data.type === 'shared' ? '#ff79c6' : '#a78bfa',
                                      borderRadius: 4,
                                    }} />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </>
                      )}

                      {/* Day of week spending */}
                      {m.expenseCount > 0 && (
                        <>
                          <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginTop: 14, marginBottom: 8 }}>
                            VECKODAG-MÖNSTER
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50 }}>
                            {m.dayOfWeekSpend.map((spend, dayIdx) => {
                              const maxDay = Math.max(...m.dayOfWeekSpend)
                              const h = maxDay > 0 ? (spend / maxDay) * 100 : 0
                              const isWeekend = dayIdx === 0 || dayIdx === 6
                              return (
                                <div key={dayIdx} style={{
                                  flex: 1, display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', height: '100%', justifyContent: 'flex-end',
                                }}>
                                  <div style={{
                                    width: '100%',
                                    height: `${Math.max(h, 4)}%`,
                                    background: isWeekend ? '#ff79c6' : '#00f0ff',
                                    borderRadius: '3px 3px 0 0',
                                    opacity: spend > 0 ? 0.8 : 0.2,
                                  }} />
                                  <div style={{ fontSize: 8, color: '#475569', marginTop: 3 }}>
                                    {m.dayNames[dayIdx]}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 2, background: '#00f0ff' }} />
                              <span style={{ fontSize: 8, color: '#475569' }}>Vardag</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                              <div style={{ width: 6, height: 6, borderRadius: 2, background: '#ff79c6' }} />
                              <span style={{ fontSize: 8, color: '#475569' }}>Helg</span>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Fun fact for this month */}
                      {m.topCat && (
                        <div style={{
                          marginTop: 12, background: '#0b112060', borderRadius: 10, padding: 10,
                          fontSize: 12, color: '#94a3b8', textAlign: 'center',
                        }}>
                          Största kategorin: <strong style={{ color: '#e2e8f0' }}>
                            {getCatInfo(m.topCat[0]).icon} {getCatInfo(m.topCat[0]).name}
                          </strong> ({m.topCat[1].total.toFixed(0)}{symbol})
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </>
      )}

      {tab === 'badges' && (
        <>
          <div style={{
            background: 'linear-gradient(135deg, #0f172a, #1e293b)',
            border: '1px solid rgba(255,217,61,0.2)',
            borderRadius: 20, padding: 16, marginBottom: 16,
            display: 'flex', justifyContent: 'space-around',
          }}>
            {[
              { label: 'Upplåsta', value: `${unlocked.length}/${ACHIEVEMENTS.length}`, color: '#ffd93d' },
              { label: 'Total XP', value: xp, color: '#00f0ff' },
              { label: 'Streak', value: `${gamification?.streak_current || 0}🔥`, color: '#ff79c6' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                  color: stat.color, textShadow: `0 0 10px ${stat.color}80`,
                }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {ACHIEVEMENTS.map(achievement => {
              const isUnlocked = unlocked.includes(achievement.id)
              return (
                <div key={achievement.id} style={{
                  background: isUnlocked
                    ? 'linear-gradient(135deg, rgba(255,217,61,0.15), rgba(255,217,61,0.05))' : '#0f172a',
                  border: `1px solid ${isUnlocked ? 'rgba(255,217,61,0.4)' : '#1e293b'}`,
                  borderRadius: 16, padding: 16,
                  boxShadow: isUnlocked ? '0 0 15px rgba(255,217,61,0.1)' : 'none',
                  filter: isUnlocked ? 'none' : 'grayscale(0.8) opacity(0.5)',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{achievement.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isUnlocked ? '#ffd93d' : '#64748b', marginBottom: 4, lineHeight: 1.2 }}>
                    {achievement.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 8 }}>
                    {achievement.description}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'Orbitron, sans-serif', color: isUnlocked ? '#00ff87' : '#1e293b' }}>
                    {isUnlocked ? `✓ +${achievement.xp} XP` : `${achievement.xp} XP`}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
