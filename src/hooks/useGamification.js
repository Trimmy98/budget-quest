import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ACHIEVEMENTS } from '../lib/constants'
import { useToast } from '../context/ToastContext'
import Sentry from '../lib/sentry'

export function useGamification() {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [gamification, setGamification] = useState(null)
  const [allGamification, setAllGamification] = useState([])

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchGamification()
    }
  }, [user, profile?.household_id])

  async function fetchGamification() {
    const { data, error } = await supabase
      .from('gamification')
      .select('*')
      .eq('household_id', profile.household_id)
    if (error) { console.error('fetchGamification error:', error); Sentry.captureException(error) }
    if (data) {
      setAllGamification(data)
      const mine = data.find(g => g.user_id === user.id)
      setGamification(mine || { xp: 0, streak_current: 0, streak_best: 0, achievements: [] })
    }
  }

  async function awardXP(baseXP) {
    if (!gamification) return 0
    const streak = gamification.streak_current || 0
    let bonus = 0
    if (streak >= 14) bonus = 25
    else if (streak >= 7) bonus = 15
    const totalXP = baseXP + bonus

    const { data: newXP, error } = await supabase.rpc('add_xp', { amount: totalXP })
    if (error) {
      console.error('awardXP error:', error); Sentry.captureException(error)
      return 0
    }

    // add_xp returnerar 0 om daglig cap nådd, annars nya totala xp
    if (newXP === 0 && totalXP > 0) {
      addToast('Daglig XP-gräns nådd (200/dag)', 'info', '🛡️')
      return 0
    }

    setGamification(prev => prev ? { ...prev, xp: newXP } : prev)
    const awarded = totalXP // kan vara clampat av DB, men toast visar intent
    addToast(`+${awarded} XP${bonus > 0 ? ` (🔥 +${bonus} streak bonus)` : ''}`, 'xp', '⚡')
    return awarded
  }

  async function updateStreak() {
    if (!gamification) return
    const { data, error } = await supabase.rpc('update_streak')
    if (error) {
      console.error('updateStreak error:', error); Sentry.captureException(error)
      return
    }
    if (!data) return

    const { streak_days, streak_best, is_new_best } = data
    setGamification(prev => prev ? {
      ...prev,
      streak_current: streak_days,
      streak_best: streak_best,
      streak_last_log: new Date().toISOString().split('T')[0],
    } : prev)

    if (streak_days > (gamification.streak_current || 0)) {
      addToast(`🔥 ${streak_days} dagars streak!`, 'success', '🔥')
    }

    await checkStreakAchievements({ streak_current: streak_days })
  }

  async function checkAndUnlockAchievement(achievementId) {
    if (!gamification) return
    const current = gamification.achievements || []
    if (current.includes(achievementId)) return

    const achievement = ACHIEVEMENTS.find(a => a.id === achievementId)
    if (!achievement) return

    const newAchievements = [...current, achievementId]
    const { data } = await supabase
      .from('gamification')
      .update({ achievements: newAchievements })
      .eq('user_id', user.id)
      .select()
      .single()

    if (data) {
      setGamification(data)
      addToast(`${achievement.icon} Achievement: ${achievement.title}! +${achievement.xp} XP`, 'achievement', achievement.icon)
      // Atomisk XP-tillägg via RPC — ingen race condition
      await awardXP(achievement.xp)
    }
  }

  async function checkStreakAchievements(g) {
    if (g.streak_current >= 3) await checkAndUnlockAchievement('on_fire')
    if (g.streak_current >= 7) await checkAndUnlockAchievement('week_warrior')
    if (g.streak_current >= 14) await checkAndUnlockAchievement('fortnight_force')
    if (g.streak_current >= 30) await checkAndUnlockAchievement('monthly_master')
  }

  async function checkExpenseCount(count) {
    if (count >= 1) await checkAndUnlockAchievement('first_step')
    if (count >= 50) await checkAndUnlockAchievement('data_nerd')
    if (count >= 100) await checkAndUnlockAchievement('logging_machine')
  }

  return {
    gamification,
    allGamification,
    fetchGamification,
    awardXP,
    updateStreak,
    checkAndUnlockAchievement,
    checkExpenseCount,
  }
}
