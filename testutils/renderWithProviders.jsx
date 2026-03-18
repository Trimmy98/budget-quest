import React from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Lightweight mock providers that don't touch Supabase
const MockAuthContext = React.createContext({})
const MockToastContext = React.createContext({})

export function TestProviders({ children, authValue = {}, toastValue = {} }) {
  const auth = {
    user: { id: 'user-1' },
    profile: { id: 'user-1', household_id: 'hh-1', role: 'admin', display_name: 'Test User' },
    household: { id: 'hh-1', name: 'Test House', invite_code: 'ABC123' },
    loading: false,
    refreshProfile: vi.fn(),
    ...authValue,
  }
  const toast = {
    addToast: vi.fn(),
    ...toastValue,
  }
  return (
    <MemoryRouter>
      <MockAuthContext.Provider value={auth}>
        <MockToastContext.Provider value={toast}>
          {children}
        </MockToastContext.Provider>
      </MockAuthContext.Provider>
    </MemoryRouter>
  )
}

// Re-export the mock contexts so vi.mock can redirect useAuth/useToast
export { MockAuthContext, MockToastContext }

export function renderWithProviders(ui, options = {}) {
  const { authValue, toastValue, ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <TestProviders authValue={authValue} toastValue={toastValue}>
        {children}
      </TestProviders>
    ),
    ...renderOptions,
  })
}
