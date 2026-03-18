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

import { useSavingsGoals } from './useSavingsGoals'

function makeChain(resolvedValue) {
  const chain = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolvedValue)
  chain.then = (cb) => Promise.resolve(resolvedValue).then(cb)
  return chain
}

describe('useSavingsGoals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('laddar goals från Supabase', async () => {
    const goals = [
      { id: 'g-1', name: 'Semester', target_amount: 5000, current_amount: 1200 },
      { id: 'g-2', name: 'Nödfond', target_amount: 10000, current_amount: 0 },
    ]
    mockSupabase.from.mockImplementation(() => makeChain({ data: goals, error: null }))

    const { result } = renderHook(() => useSavingsGoals())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(result.current.goals).toHaveLength(2)
    expect(result.current.goals[0].name).toBe('Semester')
  })

  it('skapar nytt mål via addGoal', async () => {
    const newGoal = { id: 'g-new', name: 'Bil', target_amount: 30000, current_amount: 0 }
    let callCount = 0
    mockSupabase.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return makeChain({ data: [], error: null }) // initial load
      return makeChain({ data: newGoal, error: null }) // insert + single
    })

    const { result } = renderHook(() => useSavingsGoals())
    await act(() => new Promise(r => setTimeout(r, 50)))

    let created
    await act(async () => {
      created = await result.current.addGoal({ name: 'Bil', target_amount: 30000 })
    })

    expect(created).toEqual(newGoal)
  })

  it('uppdaterar current_amount via updateGoal', async () => {
    const goals = [{ id: 'g-1', name: 'Semester', target_amount: 5000, current_amount: 1200 }]
    const updatedGoal = { ...goals[0], current_amount: 2000 }

    let callCount = 0
    mockSupabase.from.mockImplementation(() => {
      callCount++
      if (callCount <= 1) return makeChain({ data: goals, error: null })
      return makeChain({ data: updatedGoal, error: null })
    })

    const { result } = renderHook(() => useSavingsGoals())
    await act(() => new Promise(r => setTimeout(r, 50)))

    await act(async () => {
      await result.current.updateGoal('g-1', { current_amount: 2000 })
    })

    expect(result.current.goals[0].current_amount).toBe(2000)
  })

  it('raderar mål via deleteGoal', async () => {
    const goals = [{ id: 'g-1', name: 'Semester', target_amount: 5000, current_amount: 0 }]

    let callCount = 0
    mockSupabase.from.mockImplementation(() => {
      callCount++
      if (callCount <= 1) return makeChain({ data: goals, error: null })
      return makeChain({ data: null, error: null })
    })

    const { result } = renderHook(() => useSavingsGoals())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(result.current.goals).toHaveLength(1)

    let success
    await act(async () => {
      success = await result.current.deleteGoal('g-1')
    })

    expect(success).toBe(true)
    expect(result.current.goals).toHaveLength(0)
  })

  it('migrerar från localStorage vid första laddning', async () => {
    localStorage.setItem('savings_goal_user-1', '5000')

    let callCount = 0
    mockSupabase.from.mockImplementation(() => {
      callCount++
      // 1: migration count check (returns 0)
      if (callCount === 1) return makeChain({ count: 0, data: null, error: null })
      // 2: migration insert
      if (callCount === 2) return makeChain({ data: null, error: null })
      // 3+: final load
      return makeChain({
        data: [{ id: 'g-m', name: 'Mitt sparmål', target_amount: 5000, current_amount: 0 }],
        error: null,
      })
    })

    renderHook(() => useSavingsGoals())
    await act(() => new Promise(r => setTimeout(r, 50)))

    expect(localStorage.getItem('savings_goal_user-1')).toBeNull()
    expect(mockAddToast).toHaveBeenCalledWith('Dina sparmål har synkats till molnet', 'success', '☁️')
  })
})
