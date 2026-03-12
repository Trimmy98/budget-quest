import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

export default function JoinPage() {
  const { code } = useParams()
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState('loading')
  const [household, setHousehold] = useState(null)

  useEffect(() => {
    async function handleJoin() {
      try {
        const { data: hh, error } = await supabase
          .from('households')
          .select('*')
          .eq('invite_code', code)
          .single()
        if (error) throw new Error('Ogiltig inbjudningslänk')
        setHousehold(hh)

        if (!user) {
          // Store invite code and redirect to auth
          sessionStorage.setItem('pending_invite', code)
          navigate('/?invite=' + code)
          return
        }

        if (profile?.household_id) {
          setStatus('already_member')
          return
        }

        const { count } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .eq('household_id', hh.id)
        if (count >= hh.max_members) throw new Error('Hushållet är fullt')

        // Check if profile exists
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('id', user.id)
          .single()

        if (existingProfile) {
          // Update existing profile
          await supabase.from('profiles').update({
            household_id: hh.id,
            role: 'member',
            onboarding_complete: true,
          }).eq('id', user.id)
        } else {
          // Create new profile with all required fields
          await supabase.from('profiles').insert({
            id: user.id,
            display_name: user.email?.split('@')[0] || 'Medlem',
            household_id: hh.id,
            role: 'member',
            onboarding_complete: true,
          })
        }

        await supabase.from('gamification').upsert({
          user_id: user.id,
          household_id: hh.id,
        }, { onConflict: 'user_id' })

        await refreshProfile()
        setStatus('joined')
        setTimeout(() => navigate('/'), 2000)
      } catch (err) {
        setStatus('error')
      }
    }

    handleJoin()
  }, [code, user])

  const statusMessages = {
    loading: { text: 'Laddar...', color: '#00f0ff' },
    joined: { text: `Du har gått med i ${household?.name}! 🎉`, color: '#00ff87' },
    already_member: { text: 'Du är redan med i ett hushåll', color: '#ffd93d' },
    error: { text: 'Ogiltig eller utgången länk', color: '#ff6b6b' },
  }

  const msg = statusMessages[status]

  return (
    <div style={{
      minHeight: '100vh',
      background: '#020617',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div style={{
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 24,
        color: msg?.color,
        textShadow: `0 0 20px ${msg?.color}80`,
        textAlign: 'center',
        padding: '0 24px',
      }}>
        {msg?.text}
      </div>
      {status === 'joined' && (
        <div style={{ color: '#64748b', fontSize: 14 }}>Omdirigerar...</div>
      )}
    </div>
  )
}
