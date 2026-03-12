import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ACHIEVEMENTS } from '../lib/constants'
import { useToast } from '../context/ToastContext'

export function useGamification() {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [gamification, setGamification] = useState(null)
  const [allGamification, setAllGamification] = useState([])

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchGamification()
    }
  }, [user, profile])

  async function fetchGamification() {
    const { data } = await supabase
      .from('gamification')
      .select('*')
      .eq('household_id', profile.household_id)
    if (data) {
      setAllGamification(data)
      const mine = data.find(g => g.user_id === user.id)
      setGamification(mine || null)
    }
  }

  async function awardXP(baseXP) {
    if (!gamification) return 0
    const streak = gamification.streak_current || 0
    let bonus = 0
    if (streak >= 14) bonus = 25
    else if (streak >= 7) bonus = 15
    const totalXP = baseXP + bonus

    const newXP = gamification.xp + totalXP
    const { data } = await supabase
      .from('gamification')
      .update({ xp: newXP })
      .eq('user_id', user.id)
      .select()
      .single()

    if (data) {
      setGamification(data)
      addToast(`+${totalXP} XP${bonus > 0 ? ` (🔥 +${bonus} streak bonus)` : ''}`, 'xp', '⚡')
    }
    return totalXP
  }

  async function updateStreak() {
    if (!gamification) return
    const today = new Date().toISOString().split('T')[0]
    const lastLog = gamification.streak_last_log

    let newStreak = gamification.streak_current
    if (!lastLog) {
      newStreak = 1
    } else {
      const lastDate = new Date(lastLog)
      const todayDate = new Date(today)
      const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24))
      if (diffDays === 0) return // already logged today
      if (diffDays === 1) newStreak = (gamification.streak_current || 0) + 1
      else newStreak = 1 // reset
    }

    const newBest = Math.max(newStreak, gamification.streak_best || 0)
    const { data } = await supabase
      .from('gamification')
      .update({
        streak_current: newStreak,
        streak_best: newBest,
        streak_last_log: today,
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (data) {
      setGamification(data)
      if (newStreak > (gamification.streak_current || 0)) {
        addToast(`🔥 ${newStreak} dagars streak!`, 'success', '🔥')
      }
      await checkStreakAchievements(data)
    }
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
      // award the achievement XP
      await supabase.from('gamification').update({ xp: data.xp + achievement.xp }).eq('user_id', user.id)
      setGamification(prev => prev ? { ...prev, xp: prev.xp + achievement.xp } : prev)
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
