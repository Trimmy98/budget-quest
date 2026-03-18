import React, { useState, useEffect, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { useGamification } from './hooks/useGamification'
import { getCurrentMonth } from './lib/constants'
import { supabase } from './lib/supabase'

import AuthPage from './components/auth/AuthPage'
import Onboarding from './components/auth/Onboarding'
import JoinPage from './components/auth/JoinPage'
import Header from './components/shared/Header'
import BottomNav from './components/shared/BottomNav'
import Mascot from './components/shared/Mascot'
import ErrorBoundary from './components/shared/ErrorBoundary'
import { useExpenses, useBudget, useIncome } from './hooks/useExpenses'
import { useCurrency } from './hooks/useCurrency'
import { DEFAULT_SHARED_CATEGORIES, DEFAULT_PERSONAL_CATEGORIES } from './lib/constants'

// Lazy-loaded tab components
const Dashboard = lazy(() => import('./components/dashboard/Dashboard'))
const AddExpense = lazy(() => import('./components/expenses/AddExpense'))
const Personal = lazy(() => import('./components/personal/Personal'))
const Quests = lazy(() => import('./components/quests/Quests'))
const Achievements = lazy(() => import('./components/achievements/Achievements'))
const History = lazy(() => import('./components/history/History'))
const Settings = lazy(() => import('./components/settings/Settings'))

function LoadingSpinner() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 48,
    }}>
      <div style={{
        fontFamily: 'Orbitron, sans-serif',
        fontSize: 14,
        color: '#00f0ff',
        textShadow: '0 0 10px rgba(0,240,255,0.5)',
        animation: 'pulse 1.5s ease-in-out infinite',
      }}>
        Laddar...
      </div>
    </div>
  )
}

function AppContent() {
  const { user, profile, loading } = useAuth()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth())
  const { gamification, allGamification, fetchGamification } = useGamification()
  const { expenses } = useExpenses(selectedMonth)
  const { budget } = useBudget()
  const [householdMemberCount, setHouseholdMemberCount] = useState(1)
  const { myIncome } = useIncome(selectedMonth)
  const { symbol } = useCurrency()
  const location = useLocation()

  // Get invite code from URL query param
  const searchParams = new URLSearchParams(location.search)
  const inviteFromUrl = searchParams.get('invite')
  const pendingInvite = sessionStorage.getItem('pending_invite')

  useEffect(() => {
    if (inviteFromUrl) sessionStorage.setItem('pending_invite', inviteFromUrl)
  }, [inviteFromUrl])

  useEffect(() => {
    if (profile?.household_id) {
      supabase.from('profiles').select('id', { count: 'exact', head: true })
        .eq('household_id', profile.household_id)
        .then(({ count }) => setHouseholdMemberCount(count || 1))
    }
  }, [profile?.household_id])

  if (loading) {
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
          color: '#00f0ff',
          textShadow: '0 0 20px rgba(0,240,255,0.8)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          💰 BUDGET QUEST
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    )
  }

  if (!user) {
    return <AuthPage inviteCode={inviteFromUrl || pendingInvite} />
  }

  if (!profile || !profile.onboarding_complete) {
    const effectiveInvite = inviteFromUrl || pendingInvite
    return (
      <Onboarding
        inviteCode={effectiveInvite}
        pendingInviteCode={pendingInvite}
      />
    )
  }

  if (!profile.household_id) {
    return (
      <Onboarding inviteCode={inviteFromUrl || pendingInvite} />
    )
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            gamification={gamification}
            allGamification={allGamification}
            selectedMonth={selectedMonth}
          />
        )
      case 'add':
        return (
          <AddExpense
            onExpenseAdded={() => {
              fetchGamification()
              setActiveTab('dashboard')
            }}
          />
        )
      case 'personal':
        return <Personal selectedMonth={selectedMonth} />
      case 'quests':
        return <Quests selectedMonth={selectedMonth} />
      case 'history':
        return <History gamification={gamification} selectedMonth={selectedMonth} />
      case 'settings':
        return (
          <Settings
            selectedMonth={selectedMonth}
            onMonthChange={setSelectedMonth}
          />
        )
      default:
        return null
    }
  }

  // Mascot data
  const myExpenses = expenses.filter(e => e.user_id === user?.id)
  const sharedTotal = expenses.filter(e => e.expense_type === 'shared').reduce((s, e) => s + Number(e.amount), 0) / householdMemberCount
  const personalTotal = myExpenses.filter(e => e.expense_type === 'personal').reduce((s, e) => s + Number(e.amount), 0)
  const mascotSavingsRate = myIncome > 0 ? (myIncome - sharedTotal - personalTotal) / myIncome : 0
  const daysInMonth = new Date(parseInt(selectedMonth.split('-')[0]), parseInt(selectedMonth.split('-')[1]), 0).getDate()
  const isCurrentMonth = selectedMonth === getCurrentMonth()
  const daysLeft = isCurrentMonth ? daysInMonth - new Date().getDate() + 1 : 0
  const mascotSharedCats = budget?.shared_categories?.length > 0 ? budget.shared_categories : DEFAULT_SHARED_CATEGORIES
  const mascotPersonalCats = budget?.personal_categories?.length > 0 ? budget.personal_categories : DEFAULT_PERSONAL_CATEGORIES
  const remainingBudget = mascotSharedCats.reduce((s, c) => s + c.budget, 0) / householdMemberCount +
    mascotPersonalCats.reduce((s, c) => s + c.budget, 0) - sharedTotal - personalTotal
  const mascotPerDay = daysLeft > 0 ? remainingBudget / daysLeft : 0

  return (
    <div style={{
      maxWidth: 480,
      margin: '0 auto',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      background: '#020617',
    }}>
      <Header gamification={gamification} />
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 70 }}>
        <Suspense fallback={<LoadingSpinner />}>
          {renderTab()}
        </Suspense>
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      <Mascot
        savingsRate={mascotSavingsRate}
        streak={gamification?.streak_current || 0}
        expenseCount={myExpenses.length}
        perDay={mascotPerDay}
        symbol={symbol}
      />
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <Routes>
              <Route path="/join/:code" element={<JoinPage />} />
              <Route path="/*" element={<AppContent />} />
            </Routes>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
