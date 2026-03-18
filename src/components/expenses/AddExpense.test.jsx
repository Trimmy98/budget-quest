import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const { mockAwardXP, mockUpdateStreak, mockCheckExpenseCount, mockSupabase } = vi.hoisted(() => ({
  mockAwardXP: vi.fn().mockReturnValue(Promise.resolve(25)),
  mockUpdateStreak: vi.fn().mockReturnValue(Promise.resolve()),
  mockCheckExpenseCount: vi.fn().mockReturnValue(Promise.resolve()),
  mockSupabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    removeChannel: vi.fn(),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
  },
}))

vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', household_id: 'hh-1', role: 'admin' },
  }),
}))
vi.mock('../../hooks/useExpenses', () => ({
  useBudget: () => ({ budget: null }),
  useExpenses: () => ({ expenses: [] }),
}))
vi.mock('../../hooks/useGamification', () => ({
  useGamification: () => ({
    awardXP: mockAwardXP,
    updateStreak: mockUpdateStreak,
    checkExpenseCount: mockCheckExpenseCount,
  }),
}))
vi.mock('../../hooks/useCurrency', () => ({
  useCurrency: () => ({ symbol: 'kr', currency: 'SEK' }),
}))
vi.mock('../../lib/sentry', () => ({ default: { captureException: vi.fn() } }))

import AddExpense from './AddExpense'

// Track insert calls
let lastInsertData = null

function makeChain(resolvedValue) {
  const chain = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockImplementation((data) => { lastInsertData = data; return chain })
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.lte = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(resolvedValue)
  chain.maybeSingle = vi.fn().mockResolvedValue(resolvedValue)
  chain.then = (cb) => Promise.resolve(resolvedValue).then(cb)
  return chain
}

describe('AddExpense', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastInsertData = null

    // Default mock: profiles count, expenses list, insert success
    mockSupabase.from.mockImplementation((table) => {
      if (table === 'profiles') {
        return makeChain({ count: 2, data: null, error: null })
      }
      if (table === 'expenses') {
        return makeChain({ data: [], error: null, count: 5 })
      }
      return makeChain({ data: null, error: null })
    })
  })

  it('sätter paid_amount vid insert', async () => {
    const user = userEvent.setup()
    render(<AddExpense />)

    // Type amount
    const amountInput = screen.getByLabelText(/belopp/i)
    await user.type(amountInput, '500')

    // Select a category (first shared category)
    const catButtons = screen.getAllByRole('button')
    const catButton = catButtons.find(b => b.textContent.includes('Boende'))
    if (catButton) await user.click(catButton)

    // Click save
    const saveBtn = screen.getByRole('button', { name: /logga/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(lastInsertData).toBeTruthy()
      expect(lastInsertData.paid_amount).toBeDefined()
      expect(lastInsertData.paid_amount).toBe(500)
    })
  })

  it('sätter description till tom sträng istället för null', async () => {
    const user = userEvent.setup()
    render(<AddExpense />)

    const amountInput = screen.getByLabelText(/belopp/i)
    await user.type(amountInput, '100')

    const catButtons = screen.getAllByRole('button')
    const catButton = catButtons.find(b => b.textContent.includes('Boende'))
    if (catButton) await user.click(catButton)

    // Don't type any description
    const saveBtn = screen.getByRole('button', { name: /logga/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(lastInsertData).toBeTruthy()
      // description should be '' not null
      expect(lastInsertData.description).toBe('')
    })
  })

  it('anropar awardXP efter lyckad expense insert', async () => {
    const user = userEvent.setup()
    render(<AddExpense />)

    const amountInput = screen.getByLabelText(/belopp/i)
    await user.type(amountInput, '200')

    const catButtons = screen.getAllByRole('button')
    const catButton = catButtons.find(b => b.textContent.includes('Boende'))
    if (catButton) await user.click(catButton)

    const saveBtn = screen.getByRole('button', { name: /logga/i })
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mockAwardXP).toHaveBeenCalledWith(25)
    })
  })
})
