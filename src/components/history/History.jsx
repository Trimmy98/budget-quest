import React, { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useBudget } from '../../hooks/useExpenses'
import { useCurrency } from '../../hooks/useCurrency'
import Sentry from '../../lib/sentry'
import { ACHIEVEMENTS, getMonthGrade, getCurrentMonth, DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from '../../lib/constants'
import ProgressBar from '../shared/ProgressBar'

export default function History({ gamification, selectedMonth }) {
  const { user, profile } = useAuth()
  const { budget } = useBudget()
  const { symbol } = useCurrency()
  const [tab, setTab] = useState('expenses')
  const [monthData, setMonthData] = useState([])
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState([])
  const [expandedMonth, setExpandedMonth] = useState(null)

  // Period-översikt state
  const [periodMode, setPeriodMode] = useState('month') // 'day' | 'week' | 'month'
  const [periodOffset, setPeriodOffset] = useState(0) // 0 = current, -1 = previous, etc.
  const [periodExpenses, setPeriodExpenses] = useState([])
  const [periodLoading, setPeriodLoading] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [filterCategory, setFilterCategory] = useState(null) // null = alla
  const [filterPerson, setFilterPerson] = useState(null) // null = alla

  const sharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const personalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const allCats = [...sharedCats, ...personalCats]

  useEffect(() => {
    if (user && profile?.household_id) {
      fetchMembers().then(() => fetchHistory())
    }
  }, [user, profile?.household_id])

  async function fetchMembers() {
    const { data, error } = await supabase.from('profiles').select('*').eq('household_id', profile.household_id)
    if (error) { console.error('fetchMembers error:', error); Sentry.captureException(error) }
    setMembers(data || [])
    return data || []
  }

  async function fetchHistory() {
    setLoading(true)
    try {
      const months = []
      const now = new Date()
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
      }

      const results = await Promise.all(months.map(async (m) => {
        const startDate = `${m}-01`
        const [year, mon] = m.split('-').map(Number)
        const endDate = new Date(year, mon, 0).toISOString().split('T')[0]
        const daysInMonth = new Date(year, mon, 0).getDate()

        const [expRes, incRes] = await Promise.all([
          supabase.from('expenses').select('*').eq('household_id', profile.household_id)
            .gte('date', startDate).lte('date', endDate),
          supabase.from('income').select('*').eq('household_id', profile.household_id).eq('month', m),
        ])
        if (expRes.error) { console.error(`fetchHistory expenses ${m} error:`, expRes.error); Sentry.captureException(expRes.error) }
        if (incRes.error) { console.error(`fetchHistory income ${m} error:`, incRes.error); Sentry.captureException(incRes.error) }

        const expenses = expRes.data || []
        const income = incRes.data || []
        const activeUserIds = new Set(expenses.map(e => e.user_id))
        income.forEach(i => activeUserIds.add(i.user_id))
        const memCount = Math.max(activeUserIds.size, 1)

        // Sum ALL income entries for user (not just first)
        const myIncome = income.filter(i => i.user_id === user.id).reduce((s, i) => s + Number(i.amount), 0)
        const totalHouseholdIncome = income.reduce((s, i) => s + Number(i.amount), 0)

        const sharedExpenses = expenses.filter(e => e.expense_type === 'shared')
        const myPersonalExpenses = expenses.filter(e => e.user_id === user.id && e.expense_type === 'personal')
        const myExpenses = expenses.filter(e => e.user_id === user.id)
        const sharedTotal = sharedExpenses.reduce((s, e) => s + Number(e.amount), 0)
        const myPersonal = myPersonalExpenses.reduce((s, e) => s + Number(e.amount), 0)
        const myShare = memCount > 0 ? sharedTotal / memCount : 0
        const totalSpent = myShare + myPersonal
        const saved = myIncome - totalSpent
        const rate = myIncome > 0 ? saved / myIncome : 0

        // Category breakdown with budget comparison
        const categoryBreakdown = {}
        sharedExpenses.forEach(e => {
          if (!categoryBreakdown[e.category]) categoryBreakdown[e.category] = { shared: 0, personal: 0, total: 0, type: 'shared' }
          categoryBreakdown[e.category].shared += Number(e.amount) / memCount
          categoryBreakdown[e.category].total += Number(e.amount) / memCount
        })
        myPersonalExpenses.forEach(e => {
          if (!categoryBreakdown[e.category]) categoryBreakdown[e.category] = { shared: 0, personal: 0, total: 0, type: 'personal' }
          categoryBreakdown[e.category].personal += Number(e.amount)
          categoryBreakdown[e.category].total += Number(e.amount)
        })
        const sortedCats = Object.entries(categoryBreakdown).sort((a, b) => b[1].total - a[1].total)
        const topCat = sortedCats[0]

        // Day-of-week spending (dela gemensamma på antal medlemmar)
        const dayOfWeekSpend = [0, 0, 0, 0, 0, 0, 0]
        const dayOfWeekCount = [0, 0, 0, 0, 0, 0, 0]
        myExpenses.forEach(e => {
          const day = new Date(e.date).getDay()
          const amt = e.expense_type === 'shared' ? Number(e.amount) / memCount : Number(e.amount)
          dayOfWeekSpend[day] += amt
          dayOfWeekCount[day]++
        })

        // Daily spending for burn rate (dela gemensamma på antal medlemmar)
        const dailySpend = {}
        myExpenses.forEach(e => {
          const day = parseInt(e.date?.split('-')[2])
          const amt = e.expense_type === 'shared' ? Number(e.amount) / memCount : Number(e.amount)
          if (day) dailySpend[day] = (dailySpend[day] || 0) + amt
        })
        const activeDays = Object.keys(dailySpend).length
        const avgDailySpend = activeDays > 0 ? totalSpent / activeDays : 0
        const budgetedDaily = myIncome > 0 ? myIncome / daysInMonth : 0

        // Per-member breakdown
        const memberBreakdown = {}
        expenses.forEach(e => {
          if (!memberBreakdown[e.user_id]) memberBreakdown[e.user_id] = { shared: 0, personal: 0 }
          if (e.expense_type === 'shared') {
            memberBreakdown[e.user_id].shared += Number(e.amount)
          } else {
            memberBreakdown[e.user_id].personal += Number(e.amount)
          }
        })

        // Budget adherence score (how well you stayed within budget)
        let budgetScore = 0
        let budgetCatCount = 0
        allCats.forEach(cat => {
          const spent = categoryBreakdown[cat.id]?.total || 0
          if (cat.budget > 0) {
            budgetCatCount++
            const ratio = spent / cat.budget
            if (ratio <= 1) budgetScore += 1
            else if (ratio <= 1.1) budgetScore += 0.7
            else if (ratio <= 1.25) budgetScore += 0.4
            else budgetScore += 0
          }
        })
        const budgetAdherence = budgetCatCount > 0 ? (budgetScore / budgetCatCount) * 100 : 0

        return {
          month: m,
          income: myIncome,
          totalHouseholdIncome,
          spent: totalSpent,
          sharedShare: myShare,
          sharedTotal,
          personal: myPersonal,
          saved,
          rate,
          grade: getMonthGrade(rate),
          expenseCount: myExpenses.length,
          totalExpenseCount: expenses.length,
          hasData: myIncome > 0 || myExpenses.length > 0,
          categoryBreakdown,
          sortedCats,
          topCat,
          dayOfWeekSpend,
          dayOfWeekCount,
          dailySpend,
          activeDays,
          avgDailySpend,
          budgetedDaily,
          daysInMonth,
          memCount,
          memberBreakdown,
          budgetAdherence,
        }
      }))

      setMonthData(results)
    } finally {
      setLoading(false)
    }
  }

  // ── Period-översikt: beräkna tidsspan och hämta data ──
  function getPeriodRange(mode, offset) {
    const now = new Date()
    if (mode === 'month') {
      const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
      const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0)
      const end = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
      return { start, end }
    }
    if (mode === 'week') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const dayOfWeek = today.getDay() // 0=sun
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const monday = new Date(today)
      monday.setDate(today.getDate() + mondayOffset + offset * 7)
      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      return { start: fmt(monday), end: fmt(sunday) }
    }
    // day
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    const fmt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return { start: fmt, end: fmt }
  }

  function formatPeriodLabel(mode, offset) {
    const { start, end } = getPeriodRange(mode, offset)
    const mNames = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
    const mNamesShort = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    if (mode === 'month') {
      const [y, m] = start.split('-').map(Number)
      return `${mNames[m - 1].charAt(0).toUpperCase() + mNames[m - 1].slice(1)} ${y}`
    }
    if (mode === 'week') {
      const sd = new Date(start + 'T00:00:00')
      const ed = new Date(end + 'T00:00:00')
      // ISO week number
      const jan4 = new Date(sd.getFullYear(), 0, 4)
      const weekNum = Math.ceil(((sd - jan4) / 86400000 + jan4.getDay() + 1) / 7)
      return `V.${weekNum} (${sd.getDate()} ${mNamesShort[sd.getMonth()]}–${ed.getDate()} ${mNamesShort[ed.getMonth()]})`
    }
    const d = new Date(start + 'T00:00:00')
    return `${d.getDate()} ${mNames[d.getMonth()]} ${d.getFullYear()}`
  }

  useEffect(() => {
    if (user && profile?.household_id && tab === 'expenses') {
      fetchPeriodExpenses()
    }
  }, [user, profile?.household_id, tab, periodMode, periodOffset])

  async function fetchPeriodExpenses() {
    if (!profile?.household_id) return
    setPeriodLoading(true)
    try {
      // Always fetch current + previous period for comparison
      const prevRange = getPeriodRange(periodMode, periodOffset - 1)
      const currRange = getPeriodRange(periodMode, periodOffset)
      const start = prevRange.start < currRange.start ? prevRange.start : currRange.start
      const end = currRange.end
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('household_id', profile.household_id)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false })
      if (error) { console.error('fetchPeriodExpenses error:', error); Sentry.captureException(error) }
      setPeriodExpenses(data || [])
    } finally {
      setPeriodLoading(false)
    }
  }

  function groupExpenses(filtered, mode) {
    if (mode === 'day') {
      const { start } = getPeriodRange(mode, periodOffset)
      return [{ key: start, label: formatPeriodLabel(mode, periodOffset), expenses: filtered }]
    }
    if (mode === 'week') {
      const groups = {}
      const mNames = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']
      filtered.forEach(e => {
        const key = e.date
        if (!groups[key]) {
          const d = new Date(e.date + 'T00:00:00')
          groups[key] = { key, label: `${d.getDate()} ${mNames[d.getMonth()]}`, expenses: [] }
        }
        groups[key].expenses.push(e)
      })
      return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
    }
    // month — group by week
    const groups = {}
    filtered.forEach(e => {
      const d = new Date(e.date + 'T00:00:00')
      const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1
      const monday = new Date(d)
      monday.setDate(d.getDate() - dayOfWeek)
      const key = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
      if (!groups[key]) {
        const sun = new Date(monday)
        sun.setDate(monday.getDate() + 6)
        const mNamesShort = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
        groups[key] = {
          key,
          label: `${monday.getDate()} ${mNamesShort[monday.getMonth()]}–${sun.getDate()} ${mNamesShort[sun.getMonth()]}`,
          expenses: [],
        }
      }
      groups[key].expenses.push(e)
    })
    return Object.values(groups).sort((a, b) => b.key.localeCompare(a.key))
  }

  const unlocked = gamification?.achievements || []
  const xp = gamification?.xp || 0
  const monthsWithData = monthData.filter(m => m.hasData)
  const currentMonth = getCurrentMonth()
  const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

  const monthNames = {
    '01': 'Januari', '02': 'Februari', '03': 'Mars', '04': 'April',
    '05': 'Maj', '06': 'Juni', '07': 'Juli', '08': 'Augusti',
    '09': 'September', '10': 'Oktober', '11': 'November', '12': 'December',
  }

  function formatMonth(m) {
    const [year, mon] = m.split('-')
    return `${monthNames[mon]} ${year}`
  }
  function shortMonth(m) {
    return monthNames[m.split('-')[1]]?.substring(0, 3) || m
  }
  function getCatInfo(catId) {
    return allCats.find(c => c.id === catId) || { icon: '📦', name: catId, budget: 0 }
  }

  // Aggregated stats
  const totalSavedAllTime = monthsWithData.reduce((s, m) => s + m.saved, 0)
  const avgSavingsRate = monthsWithData.length > 0
    ? monthsWithData.reduce((s, m) => s + m.rate, 0) / monthsWithData.length : 0
  const bestMonth = monthsWithData.length > 0
    ? monthsWithData.reduce((best, m) => m.rate > best.rate ? m : best, monthsWithData[0]) : null
  const worstMonth = monthsWithData.length > 0
    ? monthsWithData.reduce((worst, m) => m.rate < worst.rate ? m : worst, monthsWithData[0]) : null
  const cumulativeSaved = [...monthsWithData].reverse().reduce((acc, m) => {
    const prev = acc.length > 0 ? acc[acc.length - 1].cumulative : 0
    acc.push({ month: m.month, cumulative: prev + m.saved, saved: m.saved })
    return acc
  }, [])

  // Recent trend (last 2 months with data)
  const recentMonths = monthsWithData.slice(0, 2)
  const trend = recentMonths.length >= 2
    ? { diff: recentMonths[0].rate - recentMonths[1].rate, improving: recentMonths[0].rate > recentMonths[1].rate }
    : null

  // Category trends across months
  function getCategoryTrend(catId) {
    const recent = monthsWithData.slice(0, 3)
    return recent.map(m => m.categoryBreakdown[catId]?.total || 0)
  }

  const labelStyle = { fontSize: 10, color: '#64748b', fontFamily: 'Orbitron, sans-serif', letterSpacing: 1.5 }
  const cardStyle = { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 20, padding: 16, marginBottom: 14 }

  return (
    <div style={{ padding: '16px 16px 24px' }}>
      {/* Tab Toggle */}
      <div style={{
        display: 'flex', background: '#0b1120', borderRadius: 14, padding: 4,
        marginBottom: 16, border: '1px solid #1e293b',
      }}>
        {[
          { id: 'expenses', label: '📋 Utgifter' },
          { id: 'history', label: '📊 Statistik' },
          { id: 'badges', label: '🏆 Badges' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '10px 0', border: 'none', borderRadius: 10, cursor: 'pointer',
            fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
            background: tab === t.id ? 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))' : 'transparent',
            color: tab === t.id ? '#00f0ff' : '#64748b',
            boxShadow: tab === t.id ? '0 0 10px rgba(0,240,255,0.2)' : 'none',
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ PERIOD-ÖVERSIKT (Utgifter-tab) ═══ */}
      {tab === 'expenses' && (() => {
        const { start, end } = getPeriodRange(periodMode, periodOffset)
        const prevRange = getPeriodRange(periodMode, periodOffset - 1)

        // Apply filters to a set of expenses
        const applyFilters = (exps) => exps.filter(e =>
          (!filterCategory || e.category === filterCategory) &&
          (!filterPerson || e.user_id === filterPerson)
        )

        const allInPeriod = periodExpenses.filter(e => e.date >= start && e.date <= end)
        const allFiltered = applyFilters(allInPeriod)
        const prevInPeriod = periodExpenses.filter(e => e.date >= prevRange.start && e.date <= prevRange.end)
        const prevFiltered = applyFilters(prevInPeriod)

        const periodTotal = allFiltered.reduce((s, e) => s + Number(e.amount), 0)
        const prevTotal = prevFiltered.reduce((s, e) => s + Number(e.amount), 0)
        const sharedTotal = allFiltered.filter(e => e.expense_type === 'shared').reduce((s, e) => s + Number(e.amount), 0)
        const personalTotal = allFiltered.filter(e => e.expense_type === 'personal').reduce((s, e) => s + Number(e.amount), 0)
        const memCount = members.length || 1

        // Per-member totals for proportional bar
        const memberTotals = {}
        allFiltered.forEach(e => {
          memberTotals[e.user_id] = (memberTotals[e.user_id] || 0) + Number(e.amount)
        })

        // Top 3 categories
        const catTotals = {}
        allFiltered.forEach(e => {
          catTotals[e.category] = (catTotals[e.category] || 0) + Number(e.amount)
        })
        const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 3)

        // Comparison: category that changed most
        const prevCatTotals = {}
        prevFiltered.forEach(e => {
          prevCatTotals[e.category] = (prevCatTotals[e.category] || 0) + Number(e.amount)
        })
        const allCatIds = new Set([...Object.keys(catTotals), ...Object.keys(prevCatTotals)])
        let biggestIncrease = null
        let biggestDecrease = null
        allCatIds.forEach(catId => {
          const curr = catTotals[catId] || 0
          const prev = prevCatTotals[catId] || 0
          const diff = curr - prev
          if (!biggestIncrease || diff > biggestIncrease.diff) biggestIncrease = { catId, diff }
          if (!biggestDecrease || diff < biggestDecrease.diff) biggestDecrease = { catId, diff }
        })

        // Available filter options (from all unfiltered expenses in period)
        const availableCategories = [...new Set(allInPeriod.map(e => e.category))].sort()
        const availablePersons = [...new Set(allInPeriod.map(e => e.user_id))]

        // Grouping uses filtered data
        const groups = groupExpenses(allFiltered.length > 0 ? allFiltered : [], periodMode)

        const periodLabel = periodMode === 'month' ? 'månaden' : periodMode === 'week' ? 'veckan' : 'dagen'

        return (
          <>
            {/* Dag/Vecka/Månad toggle */}
            <div style={{
              display: 'flex', background: '#0b1120', borderRadius: 10, padding: 3,
              marginBottom: 10, border: '1px solid #1e293b',
            }}>
              {[
                { id: 'day', label: 'Dag' },
                { id: 'week', label: 'Vecka' },
                { id: 'month', label: 'Månad' },
              ].map(m => (
                <button key={m.id} onClick={() => { setPeriodMode(m.id); setPeriodOffset(0); setExpandedGroup(null) }} style={{
                  flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, cursor: 'pointer',
                  fontFamily: 'Outfit, sans-serif', fontWeight: 600, fontSize: 13, transition: 'all 0.2s',
                  background: periodMode === m.id ? 'linear-gradient(135deg, rgba(0,240,255,0.2), rgba(0,240,255,0.1))' : 'transparent',
                  color: periodMode === m.id ? '#00f0ff' : '#64748b',
                }}>
                  {m.label}
                </button>
              ))}
            </div>

            {/* Filter */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {/* Kategori-filter */}
              <select
                value={filterCategory || ''}
                onChange={e => setFilterCategory(e.target.value || null)}
                style={{
                  background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8,
                  padding: '6px 10px', color: filterCategory ? '#00f0ff' : '#64748b',
                  fontSize: 12, fontFamily: 'Outfit, sans-serif', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="">Alla kategorier</option>
                {availableCategories.map(catId => {
                  const cat = getCatInfo(catId)
                  return <option key={catId} value={catId}>{cat.icon} {cat.name}</option>
                })}
              </select>
              {/* Person-filter */}
              <select
                value={filterPerson || ''}
                onChange={e => setFilterPerson(e.target.value || null)}
                style={{
                  background: '#0b1120', border: '1px solid #1e293b', borderRadius: 8,
                  padding: '6px 10px', color: filterPerson ? '#00f0ff' : '#64748b',
                  fontSize: 12, fontFamily: 'Outfit, sans-serif', cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="">Alla personer</option>
                {availablePersons.map(uid => {
                  const member = members.find(m => m.id === uid)
                  return <option key={uid} value={uid}>{uid === user?.id ? 'Du' : member?.display_name || 'Okänd'}</option>
                })}
              </select>
              {/* Aktiva filter-pills */}
              {filterCategory && (
                <button onClick={() => setFilterCategory(null)} style={{
                  background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)',
                  borderRadius: 8, padding: '4px 10px', color: '#00f0ff', fontSize: 11,
                  fontFamily: 'Outfit, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {getCatInfo(filterCategory).icon} {getCatInfo(filterCategory).name} ✕
                </button>
              )}
              {filterPerson && (
                <button onClick={() => setFilterPerson(null)} style={{
                  background: 'rgba(0,240,255,0.1)', border: '1px solid rgba(0,240,255,0.3)',
                  borderRadius: 8, padding: '4px 10px', color: '#00f0ff', fontSize: 11,
                  fontFamily: 'Outfit, sans-serif', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  {filterPerson === user?.id ? 'Du' : members.find(m => m.id === filterPerson)?.display_name || 'Okänd'} ✕
                </button>
              )}
            </div>

            {/* Navigation */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 14,
            }}>
              <button onClick={() => { setPeriodOffset(periodOffset - 1); setExpandedGroup(null) }} style={{
                background: 'none', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 14px',
                color: '#94a3b8', fontSize: 16, cursor: 'pointer',
              }}>
                ←
              </button>
              <div style={{
                fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700,
                color: '#e2e8f0', textAlign: 'center',
              }}>
                {formatPeriodLabel(periodMode, periodOffset)}
              </div>
              <button onClick={() => { if (periodOffset < 0) { setPeriodOffset(periodOffset + 1); setExpandedGroup(null) } }} style={{
                background: 'none', border: '1px solid #1e293b', borderRadius: 10, padding: '8px 14px',
                color: periodOffset < 0 ? '#94a3b8' : '#1e293b', fontSize: 16,
                cursor: periodOffset < 0 ? 'pointer' : 'default',
              }}>
                →
              </button>
            </div>

            {periodLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Laddar...</div>
            ) : allFiltered.length === 0 ? (
              <div style={{
                ...cardStyle, textAlign: 'center', padding: '30px 16px', color: '#475569',
              }}>
                {allInPeriod.length > 0 ? 'Inga utgifter matchar filtret' : 'Inga utgifter denna period'}
              </div>
            ) : (
              <>
                {/* Period-sammanfattning */}
                <div style={{
                  background: 'linear-gradient(135deg, #0f172a, #15132a)',
                  border: '1px solid #1e293b', borderRadius: 20, padding: 16, marginBottom: 14,
                }}>
                  {/* Total */}
                  <div style={{ marginBottom: 4 }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>Totalt</div>
                    <div style={{
                      fontFamily: 'Orbitron, sans-serif', fontSize: 28, fontWeight: 900,
                      color: '#e2e8f0',
                    }}>
                      {periodTotal.toLocaleString('sv-SE', { maximumFractionDigits: 0 })}{symbol}
                    </div>
                  </div>

                  {/* Jämförelse med förra perioden */}
                  <div style={{ marginBottom: 12 }}>
                    {prevFiltered.length === 0 ? (
                      <div style={{ fontSize: 11, color: '#475569' }}>Ingen data för förra {periodLabel}</div>
                    ) : (() => {
                      const diff = periodTotal - prevTotal
                      const pctChange = prevTotal > 0 ? ((diff / prevTotal) * 100) : 0
                      const isMore = diff > 0
                      return (
                        <div>
                          <div style={{ fontSize: 12, color: isMore ? '#ff6b6b' : '#00ff87', fontWeight: 600 }}>
                            {isMore ? '↑' : '↓'} {Math.abs(pctChange).toFixed(0)}% {isMore ? 'mer' : 'mindre'} än förra {periodLabel}
                            <span style={{ color: '#64748b', fontWeight: 400, marginLeft: 6 }}>
                              ({isMore ? '+' : ''}{diff.toFixed(0)}{symbol})
                            </span>
                          </div>
                          {/* Största ökning/minskning per kategori */}
                          {(biggestIncrease?.diff > 0 || biggestDecrease?.diff < 0) && (
                            <div style={{ fontSize: 10, color: '#64748b', marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {biggestIncrease && biggestIncrease.diff > 0 && (
                                <span>
                                  <span style={{ color: '#ff6b6b' }}>{getCatInfo(biggestIncrease.catId).icon} {getCatInfo(biggestIncrease.catId).name} +{biggestIncrease.diff.toFixed(0)}{symbol}</span>
                                </span>
                              )}
                              {biggestDecrease && biggestDecrease.diff < 0 && biggestDecrease.catId !== biggestIncrease?.catId && (
                                <span>
                                  <span style={{ color: '#00ff87' }}>{getCatInfo(biggestDecrease.catId).icon} {getCatInfo(biggestDecrease.catId).name} {biggestDecrease.diff.toFixed(0)}{symbol}</span>
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Proportionell bar: vem lade ut vad */}
                  {memCount > 1 && periodTotal > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ borderRadius: 8, overflow: 'hidden', height: 24, display: 'flex', background: '#0b1120' }}>
                        {Object.entries(memberTotals).map(([uid, total]) => {
                          const member = members.find(m => m.id === uid)
                          const pct = (total / periodTotal) * 100
                          const isMe = uid === user?.id
                          return (
                            <div key={uid} style={{
                              width: `${pct}%`, height: '100%',
                              background: isMe ? 'linear-gradient(135deg, #00f0ff, #0080ff)' : 'linear-gradient(135deg, #ff79c6, #ff5599)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 10, fontWeight: 700, color: '#020617',
                              overflow: 'hidden', whiteSpace: 'nowrap',
                              transition: 'width 0.3s ease',
                            }}>
                              {pct > 15 && `${member?.display_name || 'Okänd'} ${total.toFixed(0)}${symbol}`}
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                        {Object.entries(memberTotals).map(([uid, total]) => {
                          const member = members.find(m => m.id === uid)
                          const isMe = uid === user?.id
                          return (
                            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ width: 8, height: 8, borderRadius: 2, background: isMe ? '#00f0ff' : '#ff79c6' }} />
                              <span style={{ fontSize: 10, color: '#94a3b8' }}>
                                {member?.display_name || 'Okänd'}: {total.toFixed(0)}{symbol}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Gemensamt vs personligt */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <div style={{
                      flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px',
                      border: '1px solid #1e293b', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>Gemensamt</div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#ff79c6' }}>
                        {sharedTotal.toFixed(0)}{symbol}
                      </div>
                    </div>
                    <div style={{
                      flex: 1, background: '#0b1120', borderRadius: 10, padding: '8px 10px',
                      border: '1px solid #1e293b', textAlign: 'center',
                    }}>
                      <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>Personligt</div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>
                        {personalTotal.toFixed(0)}{symbol}
                      </div>
                    </div>
                  </div>

                  {/* Topp 3 kategorier */}
                  {topCats.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 6 }}>Topp kategorier</div>
                      {topCats.map(([catId, total]) => {
                        const cat = getCatInfo(catId)
                        return (
                          <div key={catId} style={{
                            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4,
                          }}>
                            <span style={{ fontSize: 14 }}>{cat.icon}</span>
                            <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{cat.name}</span>
                            <span style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color: '#e2e8f0' }}>
                              {total.toFixed(0)}{symbol}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Grupperade utgifter */}
                {groups.map(group => {
                  const groupTotal = group.expenses.reduce((s, e) => s + Number(e.amount), 0)
                  const isMonth = periodMode === 'month'
                  const isExpanded = !isMonth || expandedGroup === group.key
                  const visibleExpenses = isExpanded ? group.expenses : []

                  return (
                    <div key={group.key} style={{
                      background: '#0f172a', border: '1px solid #1e293b',
                      borderRadius: 16, padding: 14, marginBottom: 10,
                    }}>
                      {/* Group header */}
                      <div
                        onClick={() => isMonth && setExpandedGroup(expandedGroup === group.key ? null : group.key)}
                        style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          cursor: isMonth ? 'pointer' : 'default',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
                            {group.label}
                          </div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>
                            {group.expenses.length} utgift{group.expenses.length !== 1 ? 'er' : ''}
                            {isMonth && (isExpanded ? ' ▲' : ' ▼')}
                          </div>
                        </div>
                        <div style={{
                          fontFamily: 'Orbitron, sans-serif', fontSize: 16, fontWeight: 900, color: '#e2e8f0',
                        }}>
                          {groupTotal.toFixed(0)}{symbol}
                        </div>
                      </div>

                      {/* Expense list */}
                      {visibleExpenses.length > 0 && (
                        <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                          {visibleExpenses.map(e => {
                            const member = members.find(m => m.id === e.user_id)
                            const isShared = e.expense_type === 'shared'
                            return (
                              <div key={e.id} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '6px 0', borderBottom: '1px solid rgba(30,41,59,0.4)',
                              }}>
                                <span style={{ fontSize: 14, flexShrink: 0 }}>
                                  {getCatInfo(e.category).icon}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {e.description || '(ingen beskrivning)'}
                                  </div>
                                  <div style={{ fontSize: 10, color: '#475569' }}>
                                    {e.user_id === user?.id ? 'Du' : member?.display_name || 'Okänd'}
                                    <span style={{
                                      marginLeft: 6, fontSize: 9, padding: '1px 5px', borderRadius: 4,
                                      background: isShared ? 'rgba(255,121,198,0.12)' : 'rgba(167,139,250,0.12)',
                                      color: isShared ? '#ff79c6' : '#a78bfa',
                                    }}>
                                      {isShared ? 'gemensam' : 'personlig'}
                                    </span>
                                  </div>
                                </div>
                                <div style={{
                                  fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700,
                                  color: '#e2e8f0', flexShrink: 0,
                                }}>
                                  {Number(e.amount).toFixed(0)}{symbol}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </>
        )
      })()}

      {tab === 'history' && (
        <>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Laddar statistik...</div>
          ) : monthsWithData.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
              Ingen data ännu. Börja logga utgifter och inkomster!
            </div>
          ) : (
            <>
              {/* ═══ NYCKELTAL ═══ */}
              <div style={{
                background: 'linear-gradient(145deg, #0f172a 0%, #1a1040 50%, #0f172a 100%)',
                border: '1px solid rgba(0,240,255,0.15)', borderRadius: 24,
                padding: '18px 14px', marginBottom: 14,
                boxShadow: '0 4px 30px rgba(0,240,255,0.06)',
              }}>
                <div style={{ ...labelStyle, marginBottom: 14 }}>NYCKELTAL</div>

                {/* Big cumulative saved */}
                <div style={{ textAlign: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 9, color: '#475569', marginBottom: 3 }}>Totalt sparat ({monthsWithData.length} mån)</div>
                  <div style={{
                    fontFamily: 'Orbitron, sans-serif', fontSize: 34, fontWeight: 900,
                    color: totalSavedAllTime >= 0 ? '#00ff87' : '#ff6b6b',
                    textShadow: totalSavedAllTime >= 0 ? '0 0 25px rgba(0,255,135,0.4)' : '0 0 25px rgba(255,107,107,0.4)',
                    lineHeight: 1,
                  }}>
                    {totalSavedAllTime >= 0 ? '+' : ''}{totalSavedAllTime.toFixed(0)}{symbol}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { label: 'Snitt sparkvot', value: `${(avgSavingsRate * 100).toFixed(1)}%`, color: avgSavingsRate >= 0.2 ? '#00ff87' : avgSavingsRate >= 0.1 ? '#ffd93d' : '#ff6b6b' },
                    { label: 'Bästa månad', value: bestMonth ? shortMonth(bestMonth.month) : '–', sub: bestMonth ? `${(bestMonth.rate * 100).toFixed(0)}%` : '', color: '#ffd93d' },
                    { label: 'Sämsta månad', value: worstMonth ? shortMonth(worstMonth.month) : '–', sub: worstMonth ? `${(worstMonth.rate * 100).toFixed(0)}%` : '', color: '#ff6b6b' },
                    { label: 'Trend', value: trend ? (trend.improving ? '↑' : '↓') : '–', sub: trend ? `${trend.diff > 0 ? '+' : ''}${(trend.diff * 100).toFixed(0)}%` : '', color: trend?.improving ? '#00ff87' : '#ff6b6b' },
                  ].map(s => (
                    <div key={s.label} style={{
                      flex: 1, background: 'rgba(2,6,23,0.6)', borderRadius: 12,
                      padding: '8px 4px', textAlign: 'center', border: '1px solid rgba(30,41,59,0.6)',
                    }}>
                      <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>{s.label}</div>
                      <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 15, fontWeight: 700, color: s.color, lineHeight: 1 }}>
                        {s.value}
                      </div>
                      {s.sub && <div style={{ fontSize: 9, color: s.color, marginTop: 1 }}>{s.sub}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* ═══ SPARANDE ÖVER TID (cumulative) ═══ */}
              {cumulativeSaved.length >= 2 && (
                <div style={cardStyle}>
                  <div style={{ ...labelStyle, marginBottom: 12 }}>SPARANDE ÖVER TID</div>
                  {(() => {
                    const maxCum = Math.max(...cumulativeSaved.map(c => Math.abs(c.cumulative)), 1)
                    const hasNegative = cumulativeSaved.some(c => c.cumulative < 0)
                    const chartHeight = 90
                    const zeroLine = hasNegative ? chartHeight * 0.6 : chartHeight

                    return (
                      <>
                        <div style={{ position: 'relative', height: chartHeight, marginBottom: 4 }}>
                          {/* Zero line */}
                          {hasNegative && (
                            <div style={{
                              position: 'absolute', top: zeroLine, left: 0, right: 0,
                              height: 1, background: '#334155',
                            }} />
                          )}
                          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: '100%' }}>
                            {cumulativeSaved.map((c, i) => {
                              const isPositive = c.cumulative >= 0
                              const barH = (Math.abs(c.cumulative) / maxCum) * (hasNegative ? zeroLine : chartHeight)
                              const monthGained = c.saved >= 0

                              return (
                                <div key={c.month} style={{
                                  flex: 1, display: 'flex', flexDirection: 'column',
                                  alignItems: 'center', height: '100%',
                                  justifyContent: isPositive ? 'flex-end' : 'flex-start',
                                }}>
                                  {/* Monthly delta indicator */}
                                  <div style={{
                                    fontSize: 8, fontFamily: 'Orbitron, sans-serif', marginBottom: 2,
                                    color: monthGained ? '#00ff87' : '#ff6b6b',
                                  }}>
                                    {monthGained ? '+' : ''}{c.saved.toFixed(0)}
                                  </div>
                                  <div style={{
                                    width: '100%',
                                    height: Math.max(barH, 3),
                                    background: isPositive
                                      ? `linear-gradient(180deg, #00ff87, #00ff8740)`
                                      : `linear-gradient(0deg, #ff6b6b, #ff6b6b40)`,
                                    borderRadius: isPositive ? '4px 4px 0 0' : '0 0 4px 4px',
                                    boxShadow: i === cumulativeSaved.length - 1 ? `0 0 8px ${isPositive ? '#00ff8740' : '#ff6b6b40'}` : 'none',
                                    transition: 'height 0.4s ease',
                                  }} />
                                </div>
                              )
                            })}
                          </div>
                        </div>
                        {/* Month labels */}
                        <div style={{ display: 'flex', gap: 3 }}>
                          {cumulativeSaved.map(c => (
                            <div key={c.month} style={{
                              flex: 1, textAlign: 'center', fontSize: 8,
                              color: c.month === currentMonth ? '#e2e8f0' : '#475569',
                              fontWeight: c.month === currentMonth ? 700 : 400,
                            }}>
                              {shortMonth(c.month)}
                            </div>
                          ))}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* ═══ SPARKVOT PER MÅNAD ═══ */}
              {monthsWithData.length >= 2 && (
                <div style={cardStyle}>
                  <div style={{ ...labelStyle, marginBottom: 12 }}>SPARKVOT PER MÅNAD</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 70 }}>
                    {[...monthsWithData].reverse().map((m, i, arr) => {
                      const pct = Math.max(0, Math.min(m.rate * 100, 50))
                      const height = (pct / 50) * 100
                      const isCurrent = m.month === currentMonth
                      return (
                        <div key={m.month} style={{
                          flex: 1, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', height: '100%', justifyContent: 'flex-end',
                        }}>
                          <div style={{
                            fontSize: 8, color: m.grade.color, fontFamily: 'Orbitron, sans-serif',
                            marginBottom: 2, fontWeight: 700,
                          }}>
                            {m.grade.grade}
                          </div>
                          <div style={{
                            width: '100%',
                            height: `${Math.max(height, 4)}%`,
                            background: isCurrent
                              ? `linear-gradient(180deg, ${m.grade.color}, ${m.grade.color}50)`
                              : `${m.grade.color}90`,
                            borderRadius: '4px 4px 0 0',
                            boxShadow: isCurrent ? `0 0 8px ${m.grade.color}60` : 'none',
                            transition: 'height 0.4s ease',
                          }} />
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                    {[...monthsWithData].reverse().map(m => (
                      <div key={m.month} style={{
                        flex: 1, textAlign: 'center', fontSize: 8,
                        color: m.month === currentMonth ? '#e2e8f0' : '#475569',
                      }}>
                        {shortMonth(m.month)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ TOPP KATEGORIER ÖVER TID ═══ */}
              {monthsWithData.length >= 2 && (() => {
                // Find top 5 categories across all months
                const catTotals = {}
                monthsWithData.forEach(m => {
                  Object.entries(m.categoryBreakdown).forEach(([catId, data]) => {
                    catTotals[catId] = (catTotals[catId] || 0) + data.total
                  })
                })
                const topCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]).slice(0, 5)

                return topCats.length > 0 && (
                  <div style={cardStyle}>
                    <div style={{ ...labelStyle, marginBottom: 14 }}>STÖRSTA KATEGORIER</div>
                    {topCats.map(([catId, total]) => {
                      const cat = getCatInfo(catId)
                      const trend = getCategoryTrend(catId)
                      const isRising = trend.length >= 2 && trend[0] > trend[1]
                      const avgMonthly = total / monthsWithData.length
                      const pctOfTotal = monthsWithData.reduce((s, m) => s + m.spent, 0)
                      const share = pctOfTotal > 0 ? (total / pctOfTotal) * 100 : 0

                      return (
                        <div key={catId} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '10px 0', borderBottom: '1px solid #1e293b',
                        }}>
                          <div style={{
                            width: 36, height: 36, borderRadius: 10,
                            background: 'rgba(30,41,59,0.5)', border: '1px solid #1e293b',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, flexShrink: 0,
                          }}>{cat.icon}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{cat.name}</div>
                            <div style={{ fontSize: 10, color: '#475569' }}>
                              Snitt {avgMonthly.toFixed(0)}{symbol}/mån • {share.toFixed(0)}% av utgifter
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>
                              {total.toFixed(0)}{symbol}
                            </div>
                            <div style={{ fontSize: 10, color: isRising ? '#ff6b6b' : '#00ff87' }}>
                              {isRising ? '↑' : '↓'} {trend[0]?.toFixed(0) || 0}{symbol}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* ═══ MÅNADSKORT ═══ */}
              {monthsWithData.map((m, i) => {
                const prev = monthsWithData[i + 1]
                const rateDiff = prev ? m.rate - prev.rate : null
                const spentDiff = prev ? m.spent - prev.spent : null
                const isCurrent = m.month === currentMonth
                const isExpanded = expandedMonth === m.month
                const maxCatSpend = m.sortedCats.length > 0 ? m.sortedCats[0][1].total : 0

                return (
                  <div key={m.month} style={{
                    background: isCurrent
                      ? `linear-gradient(135deg, ${m.grade.color}08, ${m.grade.color}03)`
                      : '#0f172a',
                    border: `1px solid ${isCurrent ? `${m.grade.color}30` : '#1e293b'}`,
                    borderRadius: 20, padding: 16, marginBottom: 10,
                  }}>
                    {/* Header */}
                    <div onClick={() => setExpandedMonth(isExpanded ? null : m.month)} style={{ cursor: 'pointer' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                              {formatMonth(m.month)}
                            </span>
                            {isCurrent && (
                              <span style={{
                                fontSize: 9, color: '#00f0ff', background: 'rgba(0,240,255,0.1)',
                                padding: '2px 8px', borderRadius: 10, fontWeight: 600,
                              }}>AKTIV</span>
                            )}
                          </div>
                          <div style={{ fontSize: 10, color: '#475569', marginTop: 2 }}>
                            {m.expenseCount} utgifter • {isExpanded ? '▲ dölj' : '▼ detaljer'}
                          </div>
                        </div>
                        {/* Grade + savings rate */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: m.grade.color, fontFamily: 'Orbitron, sans-serif', fontWeight: 700 }}>
                              {(m.rate * 100).toFixed(1)}%
                            </div>
                            {rateDiff !== null && (
                              <div style={{
                                fontSize: 9,
                                color: rateDiff >= 0 ? '#00ff87' : '#ff6b6b',
                              }}>
                                {rateDiff >= 0 ? '↑' : '↓'}{Math.abs(rateDiff * 100).toFixed(1)}%
                              </div>
                            )}
                          </div>
                          <div style={{
                            width: 42, height: 42, borderRadius: 12,
                            background: `${m.grade.color}15`, border: `2px solid ${m.grade.color}50`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: `0 0 12px ${m.grade.color}15`,
                          }}>
                            <span style={{
                              fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                              color: m.grade.color, textShadow: `0 0 10px ${m.grade.color}60`,
                            }}>{m.grade.grade}</span>
                          </div>
                        </div>
                      </div>

                      {/* Summary row */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        {[
                          { label: 'Inkomst', value: `+${m.income.toFixed(0)}`, color: '#00ff87' },
                          { label: 'Utgifter', value: `-${m.spent.toFixed(0)}`, color: '#ff79c6' },
                          { label: 'Sparat', value: `${m.saved >= 0 ? '+' : ''}${m.saved.toFixed(0)}`, color: m.saved >= 0 ? '#00f0ff' : '#ff6b6b' },
                        ].map(s => (
                          <div key={s.label} style={{
                            flex: 1, background: 'rgba(11,17,32,0.6)', borderRadius: 10, padding: '7px 4px', textAlign: 'center',
                          }}>
                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>{s.label}</div>
                            <div style={{ fontFamily: 'Orbitron, sans-serif', fontSize: 12, fontWeight: 700, color: s.color }}>
                              {s.value}{symbol}
                            </div>
                          </div>
                        ))}
                      </div>

                      <ProgressBar value={Math.max(m.rate, 0)} max={0.3} color={m.grade.color} height={4} />
                    </div>

                    {/* ═══ EXPANDED DETAILS ═══ */}
                    {isExpanded && (
                      <div style={{ marginTop: 14, borderTop: '1px solid #1e293b', paddingTop: 14 }}>

                        {/* Allocation visual */}
                        {m.income > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ ...labelStyle, marginBottom: 8 }}>INKOMSTFÖRDELNING</div>
                            <div style={{ borderRadius: 8, overflow: 'hidden', height: 12, background: '#0b1120', display: 'flex' }}>
                              <div style={{ width: `${(m.sharedShare / m.income) * 100}%`, background: '#ff79c6', transition: 'width 0.5s' }} />
                              <div style={{ width: `${(m.personal / m.income) * 100}%`, background: '#a78bfa', transition: 'width 0.5s' }} />
                              <div style={{ flex: 1, background: m.saved >= 0 ? 'rgba(0,255,135,0.3)' : 'rgba(255,107,107,0.3)' }} />
                            </div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 6, justifyContent: 'center' }}>
                              {[
                                { color: '#ff79c6', label: `Gemensamt ${((m.sharedShare / m.income) * 100).toFixed(0)}%` },
                                { color: '#a78bfa', label: `Personligt ${((m.personal / m.income) * 100).toFixed(0)}%` },
                                { color: m.saved >= 0 ? '#00ff87' : '#ff6b6b', label: `Sparat ${((m.saved / m.income) * 100).toFixed(0)}%` },
                              ].map(l => (
                                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: 2, background: l.color }} />
                                  <span style={{ fontSize: 9, color: '#94a3b8' }}>{l.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Budget adherence + burn rate */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                          <div style={{
                            flex: 1, background: '#0b1120', borderRadius: 12, padding: 10, textAlign: 'center',
                            border: '1px solid #1e293b',
                          }}>
                            <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Budgetdisciplin</div>
                            <div style={{
                              fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 900,
                              color: m.budgetAdherence >= 80 ? '#00ff87' : m.budgetAdherence >= 60 ? '#ffd93d' : '#ff6b6b',
                            }}>
                              {m.budgetAdherence.toFixed(0)}%
                            </div>
                            <div style={{ fontSize: 8, color: '#475569' }}>inom budget</div>
                          </div>
                          <div style={{
                            flex: 1, background: '#0b1120', borderRadius: 12, padding: 10, textAlign: 'center',
                            border: '1px solid #1e293b',
                          }}>
                            <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Burn rate</div>
                            <div style={{
                              fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 900,
                              color: m.avgDailySpend <= m.budgetedDaily ? '#00ff87' : '#ff6b6b',
                            }}>
                              {m.avgDailySpend.toFixed(0)}
                            </div>
                            <div style={{ fontSize: 8, color: '#475569' }}>{symbol}/dag (budget: {m.budgetedDaily.toFixed(0)})</div>
                          </div>
                          <div style={{
                            flex: 1, background: '#0b1120', borderRadius: 12, padding: 10, textAlign: 'center',
                            border: '1px solid #1e293b',
                          }}>
                            <div style={{ fontSize: 8, color: '#475569', marginBottom: 3 }}>Aktiva dagar</div>
                            <div style={{
                              fontFamily: 'Orbitron, sans-serif', fontSize: 20, fontWeight: 900, color: '#00f0ff',
                            }}>
                              {m.activeDays}
                            </div>
                            <div style={{ fontSize: 8, color: '#475569' }}>av {m.daysInMonth}</div>
                          </div>
                        </div>

                        {/* Category breakdown */}
                        {m.sortedCats.length > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ ...labelStyle, marginBottom: 10 }}>KATEGORIANALYS</div>
                            {m.sortedCats.map(([catId, data], idx) => {
                              const cat = getCatInfo(catId)
                              const catBudget = cat.budget || 0
                              const isOver = catBudget > 0 && data.total > catBudget
                              const pctOfTotal = m.spent > 0 ? (data.total / m.spent) * 100 : 0
                              const prevMonth = prev?.categoryBreakdown[catId]?.total || 0
                              const diff = prevMonth > 0 ? ((data.total - prevMonth) / prevMonth) * 100 : 0

                              return (
                                <div key={catId} style={{ marginBottom: 10 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 14 }}>{cat.icon}</span>
                                      <span style={{ fontSize: 12, color: '#94a3b8' }}>{cat.name}</span>
                                      <span style={{
                                        fontSize: 9, color: '#475569', background: '#0b1120',
                                        padding: '1px 5px', borderRadius: 6,
                                      }}>
                                        {pctOfTotal.toFixed(0)}%
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      {prevMonth > 0 && (
                                        <span style={{
                                          fontSize: 9,
                                          color: diff <= 0 ? '#00ff87' : '#ff6b6b',
                                        }}>
                                          {diff > 0 ? '↑' : '↓'}{Math.abs(diff).toFixed(0)}%
                                        </span>
                                      )}
                                      <span style={{
                                        fontSize: 11, fontFamily: 'Orbitron, sans-serif', fontWeight: 700,
                                        color: isOver ? '#ff6b6b' : '#e2e8f0',
                                      }}>
                                        {data.total.toFixed(0)}{symbol}
                                        {catBudget > 0 && (
                                          <span style={{ color: '#475569', fontWeight: 400 }}> /{catBudget}</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  {catBudget > 0 ? (
                                    <ProgressBar value={data.total} max={catBudget}
                                      color={isOver ? '#ff6b6b' : data.type === 'shared' ? '#ff79c6' : '#a78bfa'} height={4}
                                    />
                                  ) : maxCatSpend > 0 && (
                                    <div style={{ height: 4, borderRadius: 4, background: '#1e293b', overflow: 'hidden' }}>
                                      <div style={{
                                        width: `${(data.total / maxCatSpend) * 100}%`, height: '100%',
                                        background: data.type === 'shared' ? '#ff79c6' : '#a78bfa', borderRadius: 4,
                                      }} />
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        {/* Day of week heatmap */}
                        {m.expenseCount > 0 && (
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ ...labelStyle, marginBottom: 10 }}>VECKODAGSMÖNSTER</div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {m.dayOfWeekSpend.map((spend, dayIdx) => {
                                const maxDay = Math.max(...m.dayOfWeekSpend)
                                const intensity = maxDay > 0 ? spend / maxDay : 0
                                const isWeekend = dayIdx === 0 || dayIdx === 6
                                const baseColor = isWeekend ? [255, 121, 198] : [0, 240, 255]
                                return (
                                  <div key={dayIdx} style={{ flex: 1, textAlign: 'center' }}>
                                    <div style={{
                                      height: 40, borderRadius: 8, marginBottom: 4,
                                      background: spend > 0
                                        ? `rgba(${baseColor.join(',')}, ${0.15 + intensity * 0.6})`
                                        : '#0b1120',
                                      border: `1px solid rgba(${baseColor.join(',')}, ${intensity * 0.3})`,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                      <span style={{
                                        fontFamily: 'Orbitron, sans-serif', fontSize: 10, fontWeight: 700,
                                        color: spend > 0 ? `rgba(${baseColor.join(',')}, ${0.5 + intensity * 0.5})` : '#1e293b',
                                      }}>
                                        {spend > 0 ? `${spend.toFixed(0)}` : '–'}
                                      </span>
                                    </div>
                                    <div style={{ fontSize: 9, color: '#475569' }}>{dayNames[dayIdx]}</div>
                                    <div style={{ fontSize: 8, color: '#334155' }}>
                                      {m.dayOfWeekCount[dayIdx]}st
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Per-member breakdown (if multi-member) */}
                        {m.memCount > 1 && Object.keys(m.memberBreakdown).length > 1 && (
                          <div>
                            <div style={{ ...labelStyle, marginBottom: 8 }}>PER MEDLEM</div>
                            {Object.entries(m.memberBreakdown).map(([uid, data]) => {
                              const member = members.find(p => p.id === uid)
                              const isMe = uid === user?.id
                              const totalMemberSpend = data.shared + data.personal
                              return (
                                <div key={uid} style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 0', borderBottom: '1px solid #1e293b',
                                }}>
                                  <div style={{
                                    width: 28, height: 28, borderRadius: '50%',
                                    background: isMe ? 'linear-gradient(135deg, #00f0ff, #0080ff)' : '#1e293b',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 11, fontWeight: 700, color: isMe ? '#020617' : '#64748b', flexShrink: 0,
                                  }}>
                                    {member?.display_name?.[0]?.toUpperCase() || '?'}
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, color: isMe ? '#00f0ff' : '#e2e8f0', fontWeight: 600 }}>
                                      {member?.display_name || 'Okänd'} {isMe && '(du)'}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#475569' }}>
                                      👥 {data.shared.toFixed(0)}{symbol} loggat gemensamt • 👤 {data.personal.toFixed(0)}{symbol} personligt
                                    </div>
                                  </div>
                                  <div style={{
                                    fontFamily: 'Orbitron, sans-serif', fontSize: 12, color: '#e2e8f0', fontWeight: 700, flexShrink: 0,
                                  }}>
                                    {totalMemberSpend.toFixed(0)}{symbol}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {tab === 'badges' && (
        <>
          <div style={{
            background: 'linear-gradient(145deg, #0f172a 0%, #1a1040 50%, #0f172a 100%)',
            border: '1px solid rgba(255,217,61,0.15)', borderRadius: 24,
            padding: 18, marginBottom: 16,
            display: 'flex', justifyContent: 'space-around',
          }}>
            {[
              { label: 'Upplåsta', value: `${unlocked.length}/${ACHIEVEMENTS.length}`, color: '#ffd93d' },
              { label: 'Total XP', value: xp, color: '#00f0ff' },
              { label: 'Streak', value: `${gamification?.streak_current || 0}🔥`, color: '#ff79c6' },
            ].map(stat => (
              <div key={stat.label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontFamily: 'Orbitron, sans-serif', fontSize: 22, fontWeight: 900,
                  color: stat.color, textShadow: `0 0 10px ${stat.color}80`,
                }}>
                  {stat.value}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {ACHIEVEMENTS.map(achievement => {
              const isUnlocked = unlocked.includes(achievement.id)
              return (
                <div key={achievement.id} style={{
                  background: isUnlocked
                    ? 'linear-gradient(135deg, rgba(255,217,61,0.12), rgba(255,217,61,0.04))' : '#0f172a',
                  border: `1px solid ${isUnlocked ? 'rgba(255,217,61,0.3)' : '#1e293b'}`,
                  borderRadius: 16, padding: 16,
                  boxShadow: isUnlocked ? '0 0 15px rgba(255,217,61,0.08)' : 'none',
                  filter: isUnlocked ? 'none' : 'grayscale(0.8) opacity(0.5)',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{achievement.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isUnlocked ? '#ffd93d' : '#64748b', marginBottom: 4, lineHeight: 1.2 }}>
                    {achievement.title}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, marginBottom: 8 }}>
                    {achievement.description}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: 'Orbitron, sans-serif', color: isUnlocked ? '#00ff87' : '#1e293b' }}>
                    {isUnlocked ? `✓ +${achievement.xp} XP` : `${achievement.xp} XP`}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
