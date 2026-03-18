import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sentry from '../lib/sentry'

export function useBalance() {
  const { user, profile } = useAuth()
  const [balance, setBalance] = useState(undefined) // undefined = loading, null = not set
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchBalance = useCallback(async () => {
    if (!user || !profile?.household_id) return
    try {
      const { data, error } = await supabase.rpc('get_my_balance')
      if (error) {
        if (error.message?.includes('inget hushåll')) return
        console.error('get_my_balance error:', error)
        Sentry.captureException(error)
        return
      }
      setBalance(data) // null if not set, object if set
    } catch (err) {
      console.error('get_my_balance exception:', err)
      Sentry.captureException(err)
    } finally {
      setLoading(false)
    }
  }, [user, profile?.household_id])

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchBalance()

      // Lyssna på ändringar i expenses, income och balance_events
      const channel = supabase
        .channel(`balance-${user.id}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'expenses',
          filter: `household_id=eq.${profile.household_id}`,
        }, () => fetchBalance())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'income',
          filter: `household_id=eq.${profile.household_id}`,
        }, () => fetchBalance())
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'balance_events',
          filter: `user_id=eq.${user.id}`,
        }, () => fetchBalance())
        .subscribe()

      return () => supabase.removeChannel(channel)
    }
  }, [user, profile?.household_id, fetchBalance])

  async function addEvent(type, amount, note) {
    if (!user || !profile?.household_id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('balance_events').insert({
        user_id: user.id,
        household_id: profile.household_id,
        type,
        amount,
        note: note || null,
      })
      if (error) throw error
      await fetchBalance()
    } catch (err) {
      console.error('addEvent error:', err)
      Sentry.captureException(err)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function deleteEvent(eventId) {
    if (!user) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('balance_events')
        .delete()
        .eq('id', eventId)
        .eq('user_id', user.id)
      if (error) throw error
      await fetchBalance()
    } catch (err) {
      console.error('deleteEvent error:', err)
      Sentry.captureException(err)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function setStartingBalance(amount) {
    if (!user || !profile?.household_id) return
    setSaving(true)
    try {
      // Om det redan finns events: lägg till en correction
      // correction_amount = önskat_saldo - nuvarande_beräknade_starting_balance
      if (balance && balance.events?.length > 0) {
        const currentSum = balance.events.reduce((s, e) => s + Number(e.amount), 0)
        const correctionAmount = amount - currentSum
        if (correctionAmount !== 0) {
          await addEvent('correction', correctionAmount, `Korrigerat till ${amount}`)
        }
      } else {
        // Första gången: skapa initial event
        await addEvent('initial', amount, 'Initialt startsaldo')
      }
    } catch (err) {
      console.error('setStartingBalance error:', err)
      Sentry.captureException(err)
      throw err
    } finally {
      setSaving(false)
    }
  }

  async function resetBalance() {
    if (!user) return
    setSaving(true)
    try {
      // Radera alla balance_events
      const { error } = await supabase
        .from('balance_events')
        .delete()
        .eq('user_id', user.id)
      if (error) throw error
      // Nollställ profiles-cache
      await supabase
        .from('profiles')
        .update({ starting_balance: null, starting_balance_date: null })
        .eq('id', user.id)
      setBalance(null)
    } catch (err) {
      console.error('resetBalance error:', err)
      Sentry.captureException(err)
      throw err
    } finally {
      setSaving(false)
    }
  }

  return {
    balance,
    loading,
    saving,
    isSet: balance !== null && balance !== undefined,
    events: balance?.events || [],
    adjustmentCount: balance?.adjustment_count || 0,
    setStartingBalance,
    resetBalance,
    addEvent,
    deleteEvent,
    refetch: fetchBalance,
  }
}
