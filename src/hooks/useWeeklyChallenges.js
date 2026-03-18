import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { WEEKLY_CHALLENGES } from '../lib/constants'
import { useToast } from '../context/ToastContext'
import Sentry from '../lib/sentry'

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1 // monday = 0 offset
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + 6)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function pickRandom(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

export function useWeeklyChallenges() {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [weekData, setWeekData] = useState(null)
  const [loading, setLoading] = useState(true)

  const weekStart = getWeekStart()
  const weekEnd = getWeekEnd(weekStart)

  useEffect(() => {
    if (user && profile?.household_id) {
      loadOrCreateWeek()
    }
  }, [user, profile?.household_id])

  async function loadOrCreateWeek() {
    setLoading(true)
    try {
      // Try to fetch existing row for this week
      const { data, error } = await supabase
        .from('weekly_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .maybeSingle()

      if (error) {
        console.error('loadWeeklyChallenges error:', error); Sentry.captureException(error)
        return
      }

      if (data) {
        setWeekData(data)
        await updateProgress(data)
      } else {
        // Pick 3 random challenges and create
        const picked = pickRandom(WEEKLY_CHALLENGES, 3)
        const challenges = picked.map(c => ({
          id: c.id,
          title: c.title,
          description: c.description,
          xp: c.xp,
          type: c.type,
          category: c.category || null,
          target: c.target,
          progress: 0,
          completed: false,
          xp_awarded: false,
        }))

        const { data: created, error: createErr } = await supabase
          .from('weekly_challenges')
          .insert({
            user_id: user.id,
            household_id: profile.household_id,
            week_start: weekStart,
            challenges,
          })
          .select()
          .single()

        if (createErr) {
          // Could be a race — another tab created it
          if (createErr.code === '23505') {
            const { data: existing } = await supabase
              .from('weekly_challenges')
              .select('*')
              .eq('user_id', user.id)
              .eq('week_start', weekStart)
              .single()
            if (existing) {
              setWeekData(existing)
              await updateProgress(existing)
            }
          } else {
            console.error('createWeeklyChallenges error:', createErr); Sentry.captureException(createErr)
          }
          return
        }

        setWeekData(created)
        await updateProgress(created)
      }
    } finally {
      setLoading(false)
    }
  }

  async function updateProgress(row) {
    // Fetch this week's expenses
    const { data: expenses, error: expErr } = await supabase
      .from('expenses')
      .select('*')
      .eq('household_id', profile.household_id)
      .gte('date', weekStart)
      .lte('date', weekEnd)

    if (expErr) {
      console.error('fetchWeekExpenses error:', expErr); Sentry.captureException(expErr)
      return
    }

    // Fetch members for team challenges
    const { data: members } = await supabase
      .from('profiles')
      .select('id')
      .eq('household_id', profile.household_id)

    const myExpenses = (expenses || []).filter(e => e.user_id === user.id)
    const memberIds = (members || []).map(m => m.id)
    const weekDays = []
    const d = new Date(weekStart)
    for (let i = 0; i < 7; i++) {
      weekDays.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      d.setDate(d.getDate() + 1)
    }

    let changed = false
    const updatedChallenges = row.challenges.map(ch => {
      if (ch.completed) return ch

      const def = WEEKLY_CHALLENGES.find(w => w.id === ch.id)
      if (!def) return ch

      const newProgress = computeProgress(def, myExpenses, expenses || [], memberIds, weekDays)
      if (newProgress !== ch.progress) changed = true

      return { ...ch, progress: newProgress }
    })

    if (!changed) return

    // Check for newly completed
    const toComplete = []
    const finalChallenges = updatedChallenges.map(ch => {
      if (!ch.completed && ch.progress >= ch.target) {
        toComplete.push(ch)
        return { ...ch, completed: true }
      }
      return ch
    })

    // Save updated progress
    const { data: updated, error: upErr } = await supabase
      .from('weekly_challenges')
      .update({ challenges: finalChallenges })
      .eq('id', row.id)
      .select()
      .single()

    if (upErr) {
      console.error('updateWeeklyChallenges error:', upErr); Sentry.captureException(upErr)
      return
    }

    setWeekData(updated)

    // Award XP for newly completed challenges
    for (const ch of toComplete) {
      if (!ch.xp_awarded) {
        const { data: newXP, error: xpErr } = await supabase.rpc('add_xp', { amount: ch.xp })
        if (!xpErr && newXP !== 0) {
          addToast(`Utmaning klar: ${ch.title}! +${ch.xp} XP`, 'achievement', '🏅')
        }
        // Mark xp_awarded in DB
        const marked = updated.challenges.map(c =>
          c.id === ch.id ? { ...c, xp_awarded: true } : c
        )
        await supabase
          .from('weekly_challenges')
          .update({ challenges: marked })
          .eq('id', row.id)
        setWeekData(prev => prev ? { ...prev, challenges: marked } : prev)
      }
    }
  }

  function computeProgress(def, myExpenses, allExpenses, memberIds, weekDays) {
    switch (def.type) {
      case 'zero_category_days': {
        // Count days where user has no expenses in the given category
        let zeroDays = 0
        const today = new Date().toISOString().split('T')[0]
        for (const day of weekDays) {
          if (day > today) break // don't count future days
          const dayExps = myExpenses.filter(e => e.date === day && e.category === def.category)
          if (dayExps.length === 0) zeroDays++
        }
        return zeroDays
      }

      case 'category_under': {
        // Progress = 1 if category total is under target (only evaluable at week end or now)
        const catTotal = myExpenses
          .filter(e => e.category === def.category)
          .reduce((s, e) => s + Number(e.amount), 0)
        return catTotal <= def.target ? 1 : 0
      }

      case 'log_days': {
        // Count distinct days user logged expenses
        const days = new Set(myExpenses.map(e => e.date))
        return days.size
      }

      case 'all_under_budget': {
        // Simplified: 1 if user has logged expenses (need budget data for full check)
        // This will be enhanced when budget data is passed in
        return myExpenses.length > 0 ? 1 : 0
      }

      case 'savings_rate': {
        // Can't fully compute without income — mark 0, will be computed when income is available
        return 0
      }

      case 'expenses_with_desc': {
        return myExpenses.filter(e => e.description && e.description.trim() !== '').length
      }

      case 'zero_expense_day': {
        const today = new Date().toISOString().split('T')[0]
        for (const day of weekDays) {
          if (day > today) break
          const dayExps = myExpenses.filter(e => e.date === day)
          if (dayExps.length === 0) return 1
        }
        return 0
      }

      case 'all_members_log': {
        // Check if every member has at least 1 expense this week
        const usersWithExp = new Set(allExpenses.map(e => e.user_id))
        const allLogged = memberIds.every(id => usersWithExp.has(id))
        return allLogged ? 1 : 0
      }

      default:
        return 0
    }
  }

  return {
    weekData,
    challenges: weekData?.challenges || [],
    loading,
    weekStart,
    weekEnd,
    refreshChallenges: loadOrCreateWeek,
  }
}
