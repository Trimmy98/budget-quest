import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import Sentry from '../lib/sentry'

export function useSavingsGoals() {
  const { user, profile } = useAuth()
  const { addToast } = useToast()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user && profile?.household_id) {
      loadGoals()
    }
  }, [user, profile?.household_id])

  async function loadGoals() {
    setLoading(true)
    try {
      // Migrate from localStorage if needed
      await migrateFromLocalStorage()

      const { data, error } = await supabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('loadSavingsGoals error:', error); Sentry.captureException(error)
        return
      }
      setGoals(data || [])
    } finally {
      setLoading(false)
    }
  }

  async function migrateFromLocalStorage() {
    const key = `savings_goal_${user.id}`
    const stored = localStorage.getItem(key)
    if (!stored) return

    const amount = parseFloat(stored)
    if (!amount || amount <= 0) {
      localStorage.removeItem(key)
      return
    }

    // Check if already migrated (any goal exists)
    const { count } = await supabase
      .from('savings_goals')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (count > 0) {
      // Already has goals in DB, just clean up localStorage
      localStorage.removeItem(key)
      return
    }

    const { error } = await supabase
      .from('savings_goals')
      .insert({
        user_id: user.id,
        household_id: profile.household_id,
        name: 'Mitt sparmål',
        target_amount: amount,
        current_amount: 0,
      })

    if (error) {
      console.error('migrateSavingsGoal error:', error); Sentry.captureException(error)
      return
    }

    localStorage.removeItem(key)
    addToast('Dina sparmål har synkats till molnet', 'success', '☁️')
  }

  async function addGoal({ name, target_amount, deadline }) {
    const { data, error } = await supabase
      .from('savings_goals')
      .insert({
        user_id: user.id,
        household_id: profile.household_id,
        name,
        target_amount,
        current_amount: 0,
        deadline: deadline || null,
      })
      .select()
      .single()

    if (error) {
      console.error('addSavingsGoal error:', error); Sentry.captureException(error)
      return null
    }
    setGoals(prev => [...prev, data])
    return data
  }

  async function updateGoal(id, updates) {
    const { data, error } = await supabase
      .from('savings_goals')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('updateSavingsGoal error:', error); Sentry.captureException(error)
      return null
    }
    setGoals(prev => prev.map(g => g.id === id ? data : g))
    return data
  }

  async function deleteGoal(id) {
    const { error } = await supabase
      .from('savings_goals')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('deleteSavingsGoal error:', error); Sentry.captureException(error)
      return false
    }
    setGoals(prev => prev.filter(g => g.id !== id))
    return true
  }

  return {
    goals,
    loading,
    addGoal,
    updateGoal,
    deleteGoal,
    refetch: loadGoals,
  }
}
