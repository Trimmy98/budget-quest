import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('fetchProfile error:', error)
      }

      if (!data) {
        // No profile yet – could be new user or deleted user
        setProfile(null)
        setHousehold(null)
        setLoading(false)
        return
      }

      setProfile(data)

      if (data.household_id) {
        const { data: hh } = await supabase
          .from('households')
          .select('*')
          .eq('id', data.household_id)
          .single()
        setHousehold(hh ?? null)
      } else {
        setHousehold(null)
      }
    } catch (err) {
      console.error('fetchProfile exception:', err)
    } finally {
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
