import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Sentry from '../lib/sentry'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [household, setHousehold] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    // Only use onAuthStateChange – it fires INITIAL_SESSION on mount
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (!session?.user) {
          setUser(null)
          setProfile(null)
          setHousehold(null)
          setLoading(false)
          return
        }

        setUser(session.user)

        // Use setTimeout to avoid Supabase deadlock on the auth lock
        // This lets the auth state change complete before we make DB calls
        setTimeout(() => {
          if (mounted) fetchProfile(session.user.id)
        }, 0)
      }
    )

    // Safety fallback – never stay on loading screen forever
    const safety = setTimeout(() => {
      if (mounted) setLoading(false)
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(safety)
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId, attempt = 1) {
    const MAX_RETRIES = 3
    const isRetry = attempt > 1

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      // PGRST116 = "no rows" — genuint ny användare, ingen retry
      if (error && error.code === 'PGRST116') {
        setProfile(null)
        setHousehold(null)
        setLoading(false)
        return
      }

      // Nätverksfel / AbortError / timeout — retry med backoff
      if (error) {
        console.error(`fetchProfile error (${attempt}/${MAX_RETRIES}):`, error)
        if (attempt < MAX_RETRIES) {
          setTimeout(() => fetchProfile(userId, attempt + 1), attempt * 1000)
          return
        }
        Sentry.captureException(error)
        setLoading(false)
        return
      }

      if (!data) {
        setProfile(null)
        setHousehold(null)
        setLoading(false)
        return
      }

      setProfile(data)

      if (data.household_id) {
        const { data: hh, error: hhError } = await supabase
          .from('households')
          .select('*')
          .eq('id', data.household_id)
          .single()

        if (hhError && attempt < MAX_RETRIES) {
          console.error(`fetchHousehold error (${attempt}/${MAX_RETRIES}):`, hhError)
          setTimeout(() => fetchProfile(userId, attempt + 1), attempt * 1000)
          return
        }
        setHousehold(hh ?? null)
      } else {
        setHousehold(null)
      }

      setLoading(false)
    } catch (err) {
      console.error(`fetchProfile exception (${attempt}/${MAX_RETRIES}):`, err)
      if (attempt < MAX_RETRIES) {
        setTimeout(() => fetchProfile(userId, attempt + 1), attempt * 1000)
        return
      }
      Sentry.captureException(err)
      setLoading(false)
    }
  }

  async function refreshProfile() {
    if (user) await fetchProfile(user.id)
  }

  return (
    <AuthContext.Provider value={{ user, profile, household, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
