import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCurrentMonth } from '../lib/constants'
import Sentry from '../lib/sentry'

export function useBudgetStatus(month) {
  const { user, profile } = useAuth()
  const [budgetStatus, setBudgetStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const targetMonth = month || getCurrentMonth()

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchStatus()
      // Subscribe to expense changes to refresh
      const channel = supabase
        .channel(`budget-status-${profile.household_id}-${targetMonth}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'expenses',
          filter: `household_id=eq.${profile.household_id}`,
        }, () => fetchStatus())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'monthly_budgets',
          filter: `household_id=eq.${profile.household_id}`,
        }, () => fetchStatus())
        .subscribe()
      return () => supabase.removeChannel(channel)
    }
  }, [user, profile?.household_id, targetMonth])

  async function fetchStatus() {
    try {
      const { data, error } = await supabase.rpc('get_budget_status', { target_month: targetMonth })
      if (error) {
        // No budgets set yet — not an error
        if (error.message?.includes('inget hushåll')) return
        console.error('get_budget_status error:', error)
        Sentry.captureException(error)
        return
      }
      setBudgetStatus(data)
    } catch (err) {
      console.error('useBudgetStatus exception:', err)
      Sentry.captureException(err)
    } finally {
      setLoading(false)
    }
  }

  return { budgetStatus, loading, refetch: fetchStatus }
}

export function useMonthlyBudgets(month) {
  const { user, profile } = useAuth()
  const [budgets, setBudgets] = useState([])
  const [defaults, setDefaults] = useState(null)
  const [loading, setLoading] = useState(true)
  const targetMonth = month || getCurrentMonth()

  useEffect(() => {
    if (profile?.household_id) {
      fetchAll()
    }
  }, [profile?.household_id, targetMonth])

  async function fetchAll() {
    setLoading(true)
    try {
      const [budgetRes, defaultRes] = await Promise.all([
        supabase.from('monthly_budgets')
          .select('*')
          .eq('household_id', profile.household_id)
          .eq('month', targetMonth),
        supabase.from('budget_defaults')
          .select('*')
          .eq('household_id', profile.household_id)
          .single(),
      ])

      if (budgetRes.error) { console.error('fetchMonthlyBudgets error:', budgetRes.error); Sentry.captureException(budgetRes.error) }
      if (defaultRes.error && defaultRes.error.code !== 'PGRST116') { console.error('fetchDefaults error:', defaultRes.error); Sentry.captureException(defaultRes.error) }

      setBudgets(budgetRes.data || [])
      setDefaults(defaultRes.data?.defaults || null)
    } finally {
      setLoading(false)
    }
  }

  async function saveBudgets(categoryAmounts) {
    // categoryAmounts = { "housing": 1200, "groceries": 700, ... }
    const entries = Object.entries(categoryAmounts).filter(([, amt]) => amt > 0)

    // Delete existing for this month, then insert fresh
    await supabase.from('monthly_budgets')
      .delete()
      .eq('household_id', profile.household_id)
      .eq('month', targetMonth)

    if (entries.length > 0) {
      const rows = entries.map(([category, budget_amount]) => ({
        household_id: profile.household_id,
        month: targetMonth,
        category,
        budget_amount,
        created_by: user.id,
      }))
      const { error } = await supabase.from('monthly_budgets').insert(rows)
      if (error) { console.error('saveBudgets error:', error); Sentry.captureException(error); throw error }
    }

    await fetchAll()
  }

  async function saveDefaults(categoryAmounts) {
    const { error } = await supabase.from('budget_defaults')
      .upsert({
        household_id: profile.household_id,
        defaults: categoryAmounts,
      }, { onConflict: 'household_id' })
    if (error) { console.error('saveDefaults error:', error); Sentry.captureException(error); throw error }
    setDefaults(categoryAmounts)
  }

  async function copyFromDefaults() {
    if (!defaults) return false
    await saveBudgets(defaults)
    return true
  }

  async function copyFromPrevMonth() {
    const [y, m] = targetMonth.split('-').map(Number)
    const prevDate = new Date(y, m - 2, 1)
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

    const { data } = await supabase.from('monthly_budgets')
      .select('category, budget_amount')
      .eq('household_id', profile.household_id)
      .eq('month', prevMonth)

    if (!data || data.length === 0) return false
    const amounts = {}
    data.forEach(row => { amounts[row.category] = Number(row.budget_amount) })
    await saveBudgets(amounts)
    return true
  }

  return { budgets, defaults, loading, saveBudgets, saveDefaults, copyFromDefaults, copyFromPrevMonth, refetch: fetchAll }
}
