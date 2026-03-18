import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { mockAddToast, mockSupabase, mockUser, mockProfile } = vi.hoisted(() => ({
  mockAddToast: vi.fn(),
  mockSupabase: { from: vi.fn(), rpc: vi.fn() },
  mockUser: { id: 'user-1' },
  mockProfile: { id: 'user-1', household_id: 'hh-1' },
}))

vi.mock('../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, profile: mockProfile }),
}))
vi.mock('../context/ToastContext', () => ({
  useToast: () => ({ addToast: mockAddToast }),
}))
vi.mock('../lib/sentry', () => ({ default: { captureException: vi.fn() } }))

import { useWeeklyChallenges } from './useWeeklyChallenges'

function getWeekStart() {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff)
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
}

function makeChain(resolvedValue) {
  const chain = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolvedValue)
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue)
  chain.then = (cb) => Promise.resolve(resolvedValue).then(cb)
  return chain
}

const weekStart = getWeekStart()

describe('useWeeklyChallenges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase.rpc.mockResolvedValue({ data: 0, error: null })
  })

  it('laddar befintliga challenges för aktuell vecka', async () => {
    const existingRow = {
      id: 'wc-1',
      user_id: 'user-1',
      week_start: weekStart,
      challenges: [
        { id: 'coffee_detox', title: 'Kaffedetox', target: 3, progress: 1, completed: false, xp: 100, xp_awarded: false, type: 'zero_category_days', category: 'coffee', description: 'test' },
      ],
    }

    mockSupabase.from.mockImplementation((table) => {
      if (table === 'weekly_challenges') return makeChain({ data: existingRow, error: null })
      if (table === 'expenses') return makeChain({ data: [], error: null })
      if (table === 'profiles') return makeChain({ data: [{ id: 'user-1' }], error: null })
      return makeChain({ data: [], error: null })
    })

    const { result } = renderHook(() => useWeeklyChallenges())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(result.current.challenges.length).toBe(1)
    expect(result.current.challenges[0].id).toBe('coffee_detox')
  })

  it('skapar nya challenges om inga finns för veckan', async () => {
    const insertedRow = {
      id: 'wc-new',
      user_id: 'user-1',
      week_start: weekStart,
      challenges: [
        { id: 'zero_day', title: 'Nolldagen', target: 1, progress: 0, completed: false, xp: 75, xp_awarded: false, type: 'zero_expense_day' },
        { id: 'detail_king', title: 'Detaljisten', target: 10, progress: 0, completed: false, xp: 100, xp_awarded: false, type: 'expenses_with_desc' },
        { id: 'team_player', title: 'Teamspelaren', target: 1, progress: 0, completed: false, xp: 150, xp_awarded: false, type: 'all_members_log' },
      ],
    }

    let wcCallCount = 0
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'weekly_challenges') {
        wcCallCount++
        if (wcCallCount === 1) return makeChain({ data: null, error: null }) // maybeSingle → null
        return makeChain({ data: insertedRow, error: null }) // insert
      }
      if (table === 'expenses') return makeChain({ data: [], error: null })
      if (table === 'profiles') return makeChain({ data: [{ id: 'user-1' }], error: null })
      return makeChain({ data: [], error: null })
    })

    const { result } = renderHook(() => useWeeklyChallenges())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(result.current.challenges.length).toBe(3)
  })

  it('uppdaterar progress korrekt för expenses_with_desc', async () => {
    const existingRow = {
      id: 'wc-1',
      user_id: 'user-1',
      week_start: weekStart,
      challenges: [
        { id: 'detail_king', title: 'Detaljisten', target: 10, progress: 0, completed: false, xp: 100, xp_awarded: false, type: 'expenses_with_desc', category: null, description: 'Logga 10+' },
      ],
    }

    const expenses = [
      { user_id: 'user-1', description: 'Lunch', date: weekStart, category: 'dining', amount: 100, expense_type: 'personal' },
      { user_id: 'user-1', description: 'Kaffe', date: weekStart, category: 'coffee', amount: 50, expense_type: 'personal' },
      { user_id: 'user-1', description: '', date: weekStart, category: 'misc', amount: 20, expense_type: 'personal' },
    ]

    const updateChain = makeChain({ data: { ...existingRow, challenges: [{ ...existingRow.challenges[0], progress: 2 }] }, error: null })

    let wcCallCount = 0
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'weekly_challenges') {
        wcCallCount++
        if (wcCallCount === 1) return makeChain({ data: existingRow, error: null })
        return updateChain
      }
      if (table === 'expenses') return makeChain({ data: expenses, error: null })
      if (table === 'profiles') return makeChain({ data: [{ id: 'user-1' }], error: null })
      return makeChain({ data: [], error: null })
    })

    renderHook(() => useWeeklyChallenges())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(updateChain.update).toHaveBeenCalled()
    const updateArg = updateChain.update.mock.calls[0][0]
    expect(updateArg.challenges[0].progress).toBe(2)
  })

  it('ger XP bara en gång per slutförd challenge', async () => {
    const existingRow = {
      id: 'wc-1',
      user_id: 'user-1',
      week_start: weekStart,
      challenges: [
        { id: 'zero_day', title: 'Nolldagen', target: 1, progress: 0, completed: false, xp: 75, xp_awarded: false, type: 'zero_expense_day', category: null, description: 'test' },
      ],
    }

    const updatedRow = {
      ...existingRow,
      challenges: [{ ...existingRow.challenges[0], progress: 1, completed: true }],
    }

    let wcCallCount = 0
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'weekly_challenges') {
        wcCallCount++
        if (wcCallCount === 1) return makeChain({ data: existingRow, error: null })
        return makeChain({ data: updatedRow, error: null })
      }
      if (table === 'expenses') return makeChain({ data: [], error: null })
      if (table === 'profiles') return makeChain({ data: [{ id: 'user-1' }], error: null })
      return makeChain({ data: [], error: null })
    })
    mockSupabase.rpc.mockResolvedValue({ data: 75, error: null })

    renderHook(() => useWeeklyChallenges())
    await act(() => new Promise(r => setTimeout(r, 100)))

    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_xp', { amount: 75 })
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('Nolldagen'),
      'achievement',
      '🏅'
    )
  })
})
