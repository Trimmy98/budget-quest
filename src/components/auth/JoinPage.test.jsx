import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const { mockRefreshProfile, mockNavigate, mockSupabase } = vi.hoisted(() => ({
  mockRefreshProfile: vi.fn(),
  mockNavigate: vi.fn(),
  mockSupabase: { from: vi.fn(), rpc: vi.fn() },
}))

vi.mock('../../lib/supabase', () => ({ supabase: mockSupabase }))
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { id: 'user-1', household_id: null },
    refreshProfile: mockRefreshProfile,
  }),
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})
vi.mock('../../lib/sentry', () => ({ default: { captureException: vi.fn() } }))

import JoinPage from './JoinPage'

function renderJoinPage(code = 'TESTCODE') {
  return render(
    <MemoryRouter initialEntries={[`/join/${code}`]}>
      <Routes>
        <Route path="/join/:code" element={<JoinPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('JoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
  })

  it('anropar join_household RPC med invite-kod', async () => {
    mockSupabase.rpc.mockImplementation((fn) => {
      if (fn === 'lookup_household_by_invite') {
        return Promise.resolve({ data: [{ id: 'hh-1', name: 'Test House', max_members: 6 }], error: null })
      }
      if (fn === 'join_household') {
        return Promise.resolve({ data: { id: 'hh-1', name: 'Test House' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    mockRefreshProfile.mockResolvedValue()

    renderJoinPage('ABC123')

    await waitFor(() => {
      expect(mockSupabase.rpc).toHaveBeenCalledWith('join_household', { invite: 'ABC123' })
    })
  })

  it('visar felmeddelande om hushållet är fullt', async () => {
    mockSupabase.rpc.mockImplementation((fn) => {
      if (fn === 'lookup_household_by_invite') {
        return Promise.resolve({ data: [{ id: 'hh-1', name: 'Full House', max_members: 2 }], error: null })
      }
      if (fn === 'join_household') {
        return Promise.resolve({ data: null, error: { message: 'Hushållet är fullt' } })
      }
      return Promise.resolve({ data: null, error: null })
    })

    renderJoinPage('FULL')

    await waitFor(() => {
      expect(screen.getByText('Hushållet är fullt')).toBeInTheDocument()
    })
  })

  it('rensar pending_invite från sessionStorage efter lyckad join', async () => {
    sessionStorage.setItem('pending_invite', 'OLDCODE')

    mockSupabase.rpc.mockImplementation((fn) => {
      if (fn === 'lookup_household_by_invite') {
        return Promise.resolve({ data: [{ id: 'hh-1', name: 'Nice House', max_members: 6 }], error: null })
      }
      if (fn === 'join_household') {
        return Promise.resolve({ data: { id: 'hh-1', name: 'Nice House' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    mockRefreshProfile.mockResolvedValue()

    renderJoinPage('NEWCODE')

    await waitFor(() => {
      expect(sessionStorage.getItem('pending_invite')).toBeNull()
    })
  })
})
