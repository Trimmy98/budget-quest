import React, { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useBudget, useIncome } from '../../hooks/useExpenses'
import { getLevelInfo, getMonthGrade, getCurrentMonth, DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
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

  // Skuldsaldo: vem har lagt ut vad av gemensamma utgifter
  const memberPaid = {} // hur mycket varje person har BETALAT av gemensamma
  sharedExpenses.forEach(e => {
    memberPaid[e.user_id] = (memberPaid[e.user_id] || 0) + Number(e.amount)
  })
  const fairSharePerPerson = sharedTotal / memberCount
  // Saldo = vad personen betalat - vad de borde ha betalat (positivt = har lagt ut för andra)
  const memberBalances = members.map(m => ({
    id: m.id,
    name: m.display_name || 'Okänd',
    paid: memberPaid[m.id] || 0,
    fairShare: fairSharePerPerson,
    balance: (memberPaid[m.id] || 0) - fairSharePerPerson,
  })).filter(m => m.paid > 0 || fairSharePerPerson > 0)

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

  const topXP = leaderboard[0]?.xp || 0
  const weeklyChallenge = budget?.weekly_challenge
  const recentExpenses = expenses.slice(0, 5)
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
            { icon: '💰', value: `${perDay >= 0 ? '' : ''}${perDay.toFixed(0)}`, label: `${symbol}/dag kvar`, color: perDay >= 0 ? '#00ff87' : '#ff6b6b' },
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

      {/* ═══ PENGAPUSSLET ═══ */}
      {memberCount > 1 && sharedTotal > 0 && (() => {
        const debtors = memberBalances.filter(m => m.balance < -0.5)
        const creditors = memberBalances.filter(m => m.balance > 0.5)
        const myBalance = memberBalances.find(m => m.id === user?.id)
        const allEven = debtors.length === 0 && creditors.length === 0

        const settlements = []
        const dCopy = debtors.map(d => ({ ...d, remaining: Math.abs(d.balance) }))
        const cCopy = creditors.map(c => ({ ...c, remaining: c.balance }))
        for (const debtor of dCopy) {
          for (const creditor of cCopy) {
            if (debtor.remaining < 0.5 || creditor.remaining < 0.5) continue
            const amount = Math.min(debtor.remaining, creditor.remaining)
            settlements.push({ from: debtor, to: creditor, amount })
            debtor.remaining -= amount
            creditor.remaining -= amount
          }
        }

        // Fun messages
        const puzzleMsg = allEven
          ? 'Pusslet är komplett! Alla bitar passar.'
          : myBalance?.balance > 50
            ? `Någon har ett pusselbit-lån på ${Math.abs(myBalance.balance).toFixed(0)}${symbol}...`
            : myBalance?.balance < -50
              ? `Du har en liten pusselbit att lämna tillbaka...`
              : 'Nästan ihopsatt!'

        // Pick a fun emoji reaction
        const puzzleEmoji = allEven ? '🎉' : myBalance?.balance > 0 ? '🤑' : myBalance?.balance < -0.5 ? '😅' : '🧩'

        return (
          <div style={{
            background: allEven
              ? 'linear-gradient(135deg, rgba(0,255,135,0.06), rgba(0,240,255,0.03))'
              : 'linear-gradient(135deg, #0f172a, #15132a)',
            border: `1px solid ${allEven ? 'rgba(0,255,135,0.2)' : myBalance && Math.abs(myBalance.balance) > 0.5
              ? myBalance.balance > 0 ? 'rgba(0,255,135,0.2)' : 'rgba(255,121,198,0.2)'
              : '#1e293b'}`,
            borderRadius: 20, padding: 16, marginBottom: 14,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Floating puzzle pieces animation */}
            <div style={{
              position: 'absolute', top: 8, right: 12, fontSize: 28, opacity: 0.12,
              animation: 'puzzleFloat 4s ease-in-out infinite',
            }}>🧩</div>
            <div style={{
              position: 'absolute', bottom: 10, right: 50, fontSize: 18, opacity: 0.08,
              animation: 'puzzleFloat 5s ease-in-out infinite 1s',
            }}>🧩</div>
            <div style={{
              position: 'absolute', top: 30, left: -5, fontSize: 20, opacity: 0.06,
              animation: 'puzzleFloat 6s ease-in-out infinite 2s',
            }}>🧩</div>

            {/* Header with fun messaging */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, position: 'relative' }}>
              <div style={{
                fontSize: 32,
                animation: allEven ? 'puzzleCelebrate 1s ease-in-out infinite' : 'puzzleBounce 2s ease-in-out infinite',
                filter: allEven ? 'drop-shadow(0 0 8px rgba(0,255,135,0.6))' : 'none',
              }}>
                {puzzleEmoji}
              </div>
              <div>
                <div style={{
                  fontSize: 14, fontWeight: 800, fontFamily: 'Orbitron, sans-serif',
                  color: allEven ? '#00ff87' : '#e2e8f0',
                  textShadow: allEven ? '0 0 15px rgba(0,255,135,0.5)' : 'none',
                  letterSpacing: 1,
                }}>
                  PENGAPUSSLET
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {allEven ? 'Alla bitar på plats!' : `${settlements.length} bit${settlements.length !== 1 ? 'ar' : ''} saknas`}
                </div>
              </div>
            </div>

            {/* Per-member puzzle pieces */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, position: 'relative' }}>
              {memberBalances.map(m => {
                const isMe = m.id === user?.id
                const isPositive = m.balance > 0.5
                const isNegative = m.balance < -0.5
                const pieceFit = !isPositive && !isNegative

                return (
                  <div key={m.id} style={{
                    flex: 1, borderRadius: 14, padding: '12px 6px',
                    textAlign: 'center',
                    background: pieceFit
                      ? 'linear-gradient(135deg, rgba(0,255,135,0.08), rgba(0,255,135,0.03))'
                      : '#0b1120',
                    border: `1px solid ${pieceFit ? 'rgba(0,255,135,0.2)'
                      : isMe ? 'rgba(0,240,255,0.2)' : '#1e293b'}`,
                    transition: 'all 0.3s ease',
                  }}>
                    {/* Avatar with puzzle state */}
                    <div style={{ position: 'relative', display: 'inline-block', marginBottom: 6 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: isMe ? 'linear-gradient(135deg, #00f0ff, #0080ff)' : '#1e293b',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: isMe ? '#020617' : '#64748b',
                      }}>
                        {m.name[0]?.toUpperCase()}
                      </div>
                      {/* Status indicator */}
                      <div style={{
                        position: 'absolute', bottom: -2, right: -2,
                        fontSize: 12, lineHeight: 1,
                      }}>
                        {pieceFit ? '✅' : isPositive ? '📤' : '📥'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: isMe ? '#00f0ff' : '#e2e8f0', fontWeight: 600, marginBottom: 4 }}>
                      {m.name}
                    </div>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 15, fontWeight: 700,
                      color: pieceFit ? '#00ff87' : isPositive ? '#00ff87' : '#ff79c6',
                      animation: pieceFit ? 'none' : isNegative ? 'puzzleNudge 3s ease-in-out infinite' : 'none',
                    }}>
                      {pieceFit ? '0' : `${isPositive ? '+' : ''}${m.balance.toFixed(0)}`}{symbol}
                    </div>
                    <div style={{ fontSize: 8, color: '#475569', marginTop: 2 }}>
                      {pieceFit ? 'kvitt!' : isPositive ? 'lagt ut mer' : 'lagt ut mindre'}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Settlement: the missing pieces */}
            {settlements.length > 0 && (
              <div>
                <div style={{
                  fontSize: 9, color: '#64748b', fontFamily: 'Orbitron, sans-serif',
                  letterSpacing: 1, marginBottom: 8, textAlign: 'center',
                }}>
                  SÅ HÄR LÄGGER VI PUSSLET
                </div>
                {settlements.map((s, i) => {
                  const iOwe = s.from.id === user?.id
                  const iReceive = s.to.id === user?.id
                  const isMe = iOwe || iReceive

                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '12px 14px', marginBottom: 6,
                      background: isMe
                        ? iOwe ? 'rgba(255,121,198,0.08)' : 'rgba(0,255,135,0.08)'
                        : 'rgba(11,17,32,0.6)',
                      borderRadius: 14,
                      border: `1px solid ${isMe
                        ? iOwe ? 'rgba(255,121,198,0.2)' : 'rgba(0,255,135,0.2)'
                        : 'rgba(30,41,59,0.6)'}`,
                    }}>
                      <div style={{
                        fontSize: 20,
                        animation: 'puzzleBounce 2s ease-in-out infinite',
                      }}>
                        {iOwe ? '🫣' : iReceive ? '🤩' : '🧩'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
                          {s.from.id === user?.id ? 'Du' : s.from.name}
                          <span style={{ color: '#475569', fontWeight: 400 }}> skickar till </span>
                          {s.to.id === user?.id ? 'Dig' : s.to.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#475569' }}>
                          {iOwe ? 'Dags att swisha!' : iReceive ? 'Pengar på väg!' : 'Intern överf.'}
                        </div>
                      </div>
                      <div style={{
                        fontFamily: 'Orbitron, sans-serif', fontSize: 18, fontWeight: 900,
                        color: iOwe ? '#ff79c6' : '#00ff87',
                        textShadow: `0 0 12px ${iOwe ? 'rgba(255,121,198,0.5)' : 'rgba(0,255,135,0.5)'}`,
                      }}>
                        {s.amount.toFixed(0)}{symbol}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* All even celebration */}
            {allEven && (
              <div style={{
                textAlign: 'center', padding: '8px 0',
                animation: 'puzzleCelebrate 2s ease-in-out infinite',
              }}>
                <div style={{ fontSize: 28, marginBottom: 4 }}>🎊</div>
                <div style={{ fontSize: 13, color: '#00ff87', fontWeight: 700 }}>
                  Alla pusselbitar passar!
                </div>
                <div style={{ fontSize: 11, color: '#475569' }}>
                  Ingen behover swisha nagon
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Pengapusslet animations */}
      <style>{`
        @keyframes puzzleFloat {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(10deg); }
        }
        @keyframes puzzleBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        @keyframes puzzleCelebrate {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes puzzleNudge {
          0%, 85%, 100% { transform: translateX(0); }
          90% { transform: translateX(-3px); }
          95% { transform: translateX(3px); }
        }
      `}</style>

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
            const spent = categorySpend[cat.id] || 0
            const pct = cat.budget > 0 ? spent / cat.budget : 0
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
                      {spent.toFixed(0)}/{cat.budget}{symbol}
                    </span>
                    {isOver && <span style={{ fontSize: 10, color: '#ff6b6b' }}>⚠️</span>}
                  </div>
                </div>
                <ProgressBar value={spent} max={cat.budget} color={isOver ? '#ff6b6b' : '#00f0ff'} height={4} />
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
                  -{Number(expense.amount).toFixed(0)}{symbol}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ UTGIFTSMÖNSTER ═══ */}
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
            acc[name] = (acc[name] || 0) + Number(e.amount)
            return acc
          }, {})
        ).sort((a, b) => b[1] - a[1])[0]

        const expenseDays = [...new Set(myExpenses.map(e => e.date))].length
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
