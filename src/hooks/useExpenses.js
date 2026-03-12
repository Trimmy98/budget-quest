import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { getCurrentMonth } from '../lib/constants'

export function useExpenses(month) {
  const { user, profile } = useAuth()
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const currentMonth = month || getCurrentMonth()

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchExpenses()
      const subscription = subscribeToExpenses()
      return () => subscription?.unsubscribe()
    }
  }, [user, profile, currentMonth])

  async function fetchExpenses() {
    setLoading(true)
    try {
      const startDate = `${currentMonth}-01`
      const [year, mon] = currentMonth.split('-').map(Number)
      const endDate = new Date(year, mon, 0).toISOString().split('T')[0]

      const { data } = await supabase
        .from('expenses')
        .select('*')
        .eq('household_id', profile.household_id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: false })

      setExpenses(data || [])
    } finally {
      setLoading(false)
    }
  }

  function subscribeToExpenses() {
    return supabase
      .channel('expenses-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'expenses',
        filter: `household_id=eq.${profile.household_id}`,
      }, () => {
        fetchExpenses()
      })
      .subscribe()
  }

  return { expenses, loading, refetch: fetchExpenses }
}

export function useBudget() {
  const { profile } = useAuth()
  const [budget, setBudget] = useState(null)

  useEffect(() => {
    if (profile?.household_id) fetchBudget()
  }, [profile])

  async function fetchBudget() {
    const { data } = await supabase
      .from('budgets')
      .select('*')
      .eq('household_id', profile.household_id)
      .single()
    setBudget(data)
  }

  return { budget, refetch: fetchBudget, setBudget }
}

export function useIncome(month) {
  const { user, profile } = useAuth()
  const [allIncome, setAllIncome] = useState([])
  const currentMonth = month || getCurrentMonth()

  useEffect(() => {
    if (user && profile?.household_id) fetchIncome()
  }, [user, profile, currentMonth])

  async function fetchIncome() {
    const { data } = await supabase
      .from('income')
      .select('*')
      .eq('household_id', profile.household_id)
      .eq('month', currentMonth)
    setAllIncome(data || [])
  }

  const myIncome = allIncome.find(i => i.user_id === user?.id)?.amount || 0
  const totalIncome = allIncome.reduce((sum, i) => sum + Number(i.amount), 0)

  return { allIncome, myIncome, totalIncome, refetch: fetchIncome }
}
