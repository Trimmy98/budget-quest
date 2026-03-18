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

import { useGamification } from './useGamification'

function makeChain(resolvedValue) {
  const chain = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolvedValue)
  chain.then = (cb) => Promise.resolve(resolvedValue).then(cb)
  return chain
}

function setupGamificationFetch(gamData) {
  const chain = makeChain({ data: gamData, error: null })
  mockSupabase.from.mockReturnValue(chain)
}

describe('useGamification', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupGamificationFetch([
      { user_id: 'user-1', xp: 100, streak_current: 3, streak_best: 5, achievements: [], household_id: 'hh-1' },
    ])
  })

  it('awardXP anropar add_xp RPC med rätt amount', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 125, error: null })

    const { result } = renderHook(() => useGamification())
    await act(() => new Promise(r => setTimeout(r, 10)))

    let awarded
    await act(async () => {
      awarded = await result.current.awardXP(100)
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_xp', { amount: 100 })
    expect(awarded).toBe(100)
  })

  it('awardXP returnerar 0 och visar toast om daglig cap nådd', async () => {
    mockSupabase.rpc.mockResolvedValue({ data: 0, error: null })

    const { result } = renderHook(() => useGamification())
    await act(() => new Promise(r => setTimeout(r, 10)))

    let awarded
    await act(async () => {
      awarded = await result.current.awardXP(50)
    })

    expect(awarded).toBe(0)
    expect(mockAddToast).toHaveBeenCalledWith('Daglig XP-gräns nådd (200/dag)', 'info', '🛡️')
  })

  it('awardXP inkluderar streak bonus vid 7+ dagars streak', async () => {
    setupGamificationFetch([
      { user_id: 'user-1', xp: 200, streak_current: 7, streak_best: 7, achievements: [], household_id: 'hh-1' },
    ])
    mockSupabase.rpc.mockResolvedValue({ data: 265, error: null })

    const { result } = renderHook(() => useGamification())
    await act(() => new Promise(r => setTimeout(r, 10)))

    await act(async () => {
      await result.current.awardXP(50)
    })

    // 50 base + 15 streak bonus
    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_xp', { amount: 65 })
  })

  it('updateStreak anropar update_streak RPC', async () => {
    mockSupabase.rpc.mockResolvedValue({
      data: { streak_days: 4, streak_best: 5, is_new_best: false },
      error: null,
    })

    const { result } = renderHook(() => useGamification())
    await act(() => new Promise(r => setTimeout(r, 10)))

    await act(async () => {
      await result.current.updateStreak()
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('update_streak')
  })

  it('checkAndUnlockAchievement ger XP via add_xp vid ny achievement', async () => {
    const updateResult = {
      user_id: 'user-1', xp: 100, streak_current: 3, streak_best: 5,
      achievements: ['first_step'],
    }
    // After initial fetch, the update call uses from('gamification').update(...)
    const updateChain = makeChain({ data: updateResult, error: null })
    // Keep returning update chain for subsequent from() calls
    let callCount = 0
    mockSupabase.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain({
        data: [{ user_id: 'user-1', xp: 100, streak_current: 3, streak_best: 5, achievements: [], household_id: 'hh-1' }],
        error: null,
      })
      return updateChain
    })
    mockSupabase.rpc.mockResolvedValue({ data: 150, error: null })

    const { result } = renderHook(() => useGamification())
    await act(() => new Promise(r => setTimeout(r, 10)))

    await act(async () => {
      await result.current.checkAndUnlockAchievement('first_step')
    })

    expect(mockSupabase.rpc).toHaveBeenCalledWith('add_xp', { amount: 50 })
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.stringContaining('First Step'),
      'achievement',
      '🌟'
    )
  })
})
