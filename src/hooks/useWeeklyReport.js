import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Sentry from '../lib/sentry'

function getMonday(offset = 0) {
  const d = new Date()
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday + offset * 7)
  return d.toISOString().split('T')[0]
}

function getISOWeekNumber(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function formatDateRange(weekStart) {
  const start = new Date(weekStart)
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const s = `${start.getDate()} ${start.toLocaleString('sv-SE', { month: 'short' })}`
  const e = `${end.getDate()} ${end.toLocaleString('sv-SE', { month: 'short' })} ${end.getFullYear()}`
  return `${s}–${e}`
}

const AI_SYSTEM_PROMPT = 'Du är en vänlig budget-coach för ett hushåll i Thailand. Ge en kort, personlig kommentar (2-3 meningar, på svenska) om veckans ekonomi. Var konkret och nämn specifika kategorier. Blanda humor med praktiska tips. Svara BARA med kommentaren, ingen inledning.'

async function fetchAiComment(reportData) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) return null

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system: AI_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(reportData) }],
      }),
    })
    if (!res.ok) {
      console.error('AI API error:', res.status)
      return null
    }
    const json = await res.json()
    return json.content?.[0]?.text || null
  } catch (err) {
    console.error('AI comment fetch error:', err)
    return null
  }
}

export function useWeeklyReport() {
  const { user, profile } = useAuth()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [weekOffset, setWeekOffset] = useState(-1)
  const [aiLoading, setAiLoading] = useState(false)

  const currentMonday = getMonday(weekOffset)
  const weekNumber = getISOWeekNumber(currentMonday)
  const dateRange = formatDateRange(currentMonday)

  const thisMondayStr = getMonday(0)
  const canGoForward = currentMonday < thisMondayStr && weekOffset < -1

  const generateReport = useCallback(async (weekStart) => {
    if (!profile?.household_id) return null
    setGenerating(true)
    try {
      const { data, error } = await supabase.rpc('generate_weekly_report', {
        target_week_start: weekStart,
      })
      if (error) {
        console.error('generate_weekly_report error:', error)
        Sentry.captureException(error)
        return null
      }
      return data
    } catch (err) {
      console.error('generate_weekly_report exception:', err)
      Sentry.captureException(err)
      return null
    } finally {
      setGenerating(false)
    }
  }, [profile?.household_id])

  const generateAiComment = useCallback(async (reportData, reportId) => {
    if (!reportData || !reportId) return
    setAiLoading(true)
    try {
      const comment = await fetchAiComment(reportData)
      if (!comment) return

      // Spara till DB
      await supabase
        .from('weekly_reports')
        .update({ ai_comment: comment })
        .eq('id', reportId)

      setReport(prev => prev ? { ...prev, ai_comment: comment } : prev)
    } catch (err) {
      console.error('AI comment error:', err)
    } finally {
      setAiLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user || !profile?.household_id) return
    let cancelled = false

    async function loadReport() {
      setLoading(true)
      const result = await generateReport(currentMonday)
      if (cancelled) return

      if (result) {
        setReport(result)
        if (!result.ai_comment && result.data?.expense_count > 0) {
          generateAiComment(result.data, result.id)
        }
      } else {
        setReport(null)
      }
      setLoading(false)
    }

    loadReport()
    return () => { cancelled = true }
  }, [user, profile?.household_id, currentMonday, generateReport, generateAiComment])

  function goBack() {
    setWeekOffset(prev => prev - 1)
  }

  function goForward() {
    if (canGoForward) setWeekOffset(prev => prev + 1)
  }

  return {
    report,
    loading: loading || generating,
    aiLoading,
    weekNumber,
    dateRange,
    weekOffset,
    canGoForward,
    goBack,
    goForward,
  }
}
