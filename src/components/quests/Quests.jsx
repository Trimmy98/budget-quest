import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useExpenses, useIncome } from '../../hooks/useExpenses'
import { QUEST_MILESTONES, getMonthGrade, getCurrentMonth } from '../../lib/constants'
import { useCurrency } from '../../hooks/useCurrency'
import { useWeeklyChallenges } from '../../hooks/useWeeklyChallenges'
import ProgressBar from '../shared/ProgressBar'
import Sentry from '../../lib/sentry'

export default function Quests({ selectedMonth }) {
  const { user, profile } = useAuth()
  const { symbol } = useCurrency()
  const { expenses } = useExpenses(selectedMonth)
  const { allIncome, myIncome } = useIncome(selectedMonth)
  const [members, setMembers] = useState([])
  const [monthHistory, setMonthHistory] = useState([])
  const { challenges, weekStart, weekEnd, loading: challengesLoading } = useWeeklyChallenges()

  useEffect(() => {
    if (profile?.household_id) {
      fetchMembers().then(() => fetchMonthHistory())
    }
  }, [profile?.household_id])

  async function fetchMembers() {
    const { data, error } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
    if (error) { console.error('fetchMembers error:', error); Sentry.captureException(error) }
    setMembers(data || [])
  }

  async function fetchMonthHistory() {
    // Get last 6 months of income + expenses for history
    const months = []
    const now = new Date()
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    const results = await Promise.all(months.map(async (m) => {
      const startDate = `${m}-01`
      const [year, mon] = m.split('-').map(Number)
      const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

      const [expRes, incRes] = await Promise.all([
        supabase.from('expenses').select('*').eq('household_id', profile.household_id)
          .gte('date', startDate).lte('date', endDate),
        supabase.from('income').select('*').eq('household_id', profile.household_id).eq('month', m),
      ])
      if (expRes.error) { console.error(`fetchMonthHistory expenses ${m} error:`, expRes.error); Sentry.captureException(expRes.error) }
      if (incRes.error) { console.error(`fetchMonthHistory income ${m} error:`, incRes.error); Sentry.captureException(incRes.error) }
      const exps = expRes.data, inc = incRes.data

      const totalInc = (inc || []).reduce((s, i) => s + Number(i.amount), 0)
      const memberCount = members.length || 1
      const sharedTotal = (exps || []).filter(e => e.expense_type === 'shared').reduce((s, e) => s + Number(e.amount), 0)
      const personalTotal = (exps || []).filter(e => e.user_id === user.id && e.expense_type === 'personal').reduce((s, e) => s + Number(e.amount), 0)
      const myInc = (inc || []).filter(i => i.user_id === user.id).reduce((s, i) => s + Number(i.amount), 0)
      const mySaved = myInc - sharedTotal / memberCount - personalTotal
      const rate = myInc > 0 ? mySaved / myInc : 0

      return { month: m, saved: mySaved, rate, totalInc, grade: getMonthGrade(rate) }
    }))

    setMonthHistory(results)
  }

  // Calculate total household savings (cumulative)
  const memberCount = members.length || 1
  const sharedTotal = expenses.filter(e => e.expense_type === 'shared').reduce((sum, e) => sum + Number(e.amount), 0)
  const totalIncome = allIncome.reduce((sum, i) => sum + Number(i.amount), 0)
  const totalPersonal = expenses.filter(e => e.expense_type === 'personal').reduce((sum, e) => sum + Number(e.amount), 0)

  // Household total saved this month
  const householdSaved = totalIncome - sharedTotal - totalPersonal

  // My personal savings
  const myPersonalTotal = expenses.filter(e => e.user_id === user?.id && e.expense_type === 'personal').reduce((sum, e) => sum + Number(e.amount), 0)
  const myShareOfShared = sharedTotal / memberCount
  const mySaved = myIncome - myShareOfShared - myPersonalTotal

  // Cumulative (simplified - just using current month * 12 as estimate,
  // but we'll use this month's data for the map)
  const cumulativeSaved = Math.max(householdSaved, 0) // Use positive savings

  const maxMilestone = QUEST_MILESTONES[QUEST_MILESTONES.length - 1].amount

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Quest Map */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 16 }}>
          🗺️ QUEST MAP — HUSHÅLLSSPARANDE
        </div>

        <div style={{ position: 'relative' }}>
          {/* Vertical line */}
          <div style={{
            position: 'absolute',
            left: 20,
            top: 0,
            bottom: 0,
            width: 2,
            background: 'linear-gradient(180deg, #00f0ff, #1e293b)',
            zIndex: 0,
          }} />

          {QUEST_MILESTONES.map((milestone, i) => {
            const isReached = cumulativeSaved >= milestone.amount
            const isNext = !isReached && (i === 0 || cumulativeSaved >= QUEST_MILESTONES[i - 1].amount)
            const progress = isNext
              ? (cumulativeSaved - (i > 0 ? QUEST_MILESTONES[i - 1].amount : 0)) /
                (milestone.amount - (i > 0 ? QUEST_MILESTONES[i - 1].amount : 0))
              : isReached ? 1 : 0

            return (
              <div key={milestone.title} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                marginBottom: 24,
                position: 'relative',
                zIndex: 1,
              }}>
                {/* Node */}
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: isReached
                    ? 'linear-gradient(135deg, #00ff87, #00cc6a)'
                    : isNext
                      ? 'linear-gradient(135deg, #00f0ff33, #00f0ff11)'
                      : '#0b1120',
                  border: isReached
                    ? '2px solid #00ff87'
                    : isNext
                      ? '2px solid #00f0ff'
                      : '2px solid #1e293b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  flexShrink: 0,
                  boxShadow: isReached
                    ? '0 0 15px rgba(0,255,135,0.5)'
                    : isNext
                      ? '0 0 10px rgba(0,240,255,0.3)'
                      : 'none',
                  filter: !isReached && !isNext ? 'grayscale(1) opacity(0.5)' : 'none',
                }}>
                  {milestone.icon}
                </div>

                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isReached ? '#00ff87' : isNext ? '#e2e8f0' : '#64748b',
                    }}>
                      {milestone.title}
                    </span>
                    <span style={{
                      fontFamily: 'Orbitron, sans-serif',
                      fontSize: 12,
                      color: isReached ? '#00ff87' : '#64748b',
                    }}>
                      {milestone.amount.toLocaleString()}{symbol}
                    </span>
                  </div>
                  {isNext && (
                    <ProgressBar
                      value={cumulativeSaved}
                      max={milestone.amount}
                      color="#00f0ff"
                      height={4}
                    />
                  )}
                  {isReached && (
                    <div style={{ fontSize: 11, color: '#00ff87' }}>✓ Uppnådd!</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Weekly Challenges */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1 }}>
            🏅 VECKANS UTMANINGAR
          </div>
          <div style={{ fontSize: 11, color: '#475569' }}>
            {weekStart} — {weekEnd}
          </div>
        </div>

        {challengesLoading ? (
          <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 12 }}>Laddar...</div>
        ) : challenges.length === 0 ? (
          <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: 12 }}>Inga utmaningar denna vecka</div>
        ) : (
          challenges.map(ch => {
            const pct = ch.target > 0 ? Math.min(ch.progress / ch.target, 1) : 0
            const isDone = ch.completed
            return (
              <div key={ch.id} style={{
                padding: '12px 0',
                borderBottom: '1px solid #1e293b',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      fontSize: 16,
                      filter: isDone ? 'none' : 'grayscale(0.3)',
                    }}>
                      {isDone ? '✅' : '🎯'}
                    </span>
                    <span style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isDone ? '#00ff87' : '#e2e8f0',
                    }}>
                      {ch.title}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'Orbitron, sans-serif',
                    fontSize: 11,
                    color: isDone ? '#00ff87' : '#ffd93d',
                  }}>
                    {isDone ? `+${ch.xp} XP ✓` : `${ch.xp} XP`}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginBottom: 6, paddingLeft: 24 }}>
                  {ch.description}
                </div>
                <div style={{ paddingLeft: 24 }}>
                  <ProgressBar
                    value={ch.progress}
                    max={ch.target}
                    color={isDone ? '#00ff87' : '#ffd93d'}
                    height={4}
                  />
                  <div style={{
                    fontSize: 10,
                    color: '#475569',
                    marginTop: 2,
                    textAlign: 'right',
                    fontFamily: 'Orbitron, sans-serif',
                  }}>
                    {ch.progress}/{ch.target}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Individual Savings */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
        marginBottom: 12,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          INDIVIDUELLT SPARANDE
        </div>
        {members.map(member => {
          const memberIncome = allIncome.filter(i => i.user_id === member.id).reduce((s, i) => s + Number(i.amount), 0)
          const memberPersonal = expenses.filter(e => e.user_id === member.id && e.expense_type === 'personal').reduce((s, e) => s + Number(e.amount), 0)
          const memberSaved = memberIncome - myShareOfShared - memberPersonal
          const memberRate = memberIncome > 0 ? memberSaved / memberIncome : 0
          const { grade, color } = getMonthGrade(memberRate)

          return (
            <div key={member.id} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid #1e293b',
            }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: `linear-gradient(135deg, ${color}33, ${color}11)`,
                border: `1px solid ${color}60`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 14,
                fontWeight: 900,
                color,
              }}>
                {grade}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{member.display_name}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>{(memberRate * 100).toFixed(1)}% sparkvot</div>
              </div>
              <div style={{
                fontFamily: 'Orbitron, sans-serif',
                fontSize: 14,
                color: memberSaved >= 0 ? '#00ff87' : '#ff6b6b',
              }}>
                {memberSaved >= 0 ? '+' : ''}{memberSaved.toFixed(0)}{symbol}
              </div>
            </div>
          )
        })}
      </div>

      {/* Month History */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: 20,
        padding: 16,
      }}>
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1, marginBottom: 12 }}>
          MÅNADSHISTORIK
        </div>
        {monthHistory.map(mh => (
          <div key={mh.month} style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 0',
            borderBottom: '1px solid #1e293b',
          }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `linear-gradient(135deg, ${mh.grade.color}22, ${mh.grade.color}11)`,
              border: `1px solid ${mh.grade.color}40`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 13,
              fontWeight: 900,
              color: mh.grade.color,
            }}>
              {mh.grade.grade}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#e2e8f0' }}>{mh.month}</div>
              <ProgressBar value={Math.max(mh.rate, 0)} max={0.35} color={mh.grade.color} height={3} />
            </div>
            <div style={{
              fontFamily: 'Orbitron, sans-serif',
              fontSize: 12,
              color: mh.saved >= 0 ? '#00ff87' : '#ff6b6b',
            }}>
              {mh.saved >= 0 ? '+' : ''}{mh.saved.toFixed(0)}{symbol}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
