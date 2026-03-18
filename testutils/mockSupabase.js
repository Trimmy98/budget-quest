import { vi } from 'vitest'

// Chainable query builder mock
function createQueryBuilder(resolvedValue = { data: null, error: null }) {
  const builder = {
    _resolved: resolvedValue,
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => Promise.resolve(builder._resolved)),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(builder._resolved)),
    then: vi.fn().mockImplementation((cb) => Promise.resolve(builder._resolved).then(cb)),
  }
  // Make the builder itself thenable so `await supabase.from(...).select(...)` works
  builder[Symbol.for('nodejs.util.promisify.custom')] = () => Promise.resolve(builder._resolved)
  // Override the implicit await
  const proxy = new Proxy(builder, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve) => Promise.resolve(target._resolved).then(resolve)
      }
      return target[prop]
    }
  })
  return proxy
}

export function createMockSupabase() {
  const queryBuilders = {}
  const rpcResults = {}

  const mockSupabase = {
    from: vi.fn((table) => {
      if (!queryBuilders[table]) {
        queryBuilders[table] = createQueryBuilder()
      }
      return queryBuilders[table]
    }),
    rpc: vi.fn((fnName, params) => {
      const result = rpcResults[fnName]
      return Promise.resolve(result || { data: null, error: null })
    }),
    removeChannel: vi.fn(),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),

    // Test helpers
    _setQueryResult(table, result) {
      queryBuilders[table] = createQueryBuilder(result)
    },
    _setRpcResult(fnName, result) {
      rpcResults[fnName] = result
    },
    _getQueryBuilder(table) {
      return queryBuilders[table]
    },
    _reset() {
      Object.keys(queryBuilders).forEach(k => delete queryBuilders[k])
      Object.keys(rpcResults).forEach(k => delete rpcResults[k])
      mockSupabase.from.mockClear()
      mockSupabase.rpc.mockClear()
    },
  }

  return mockSupabase
}

// Default shared instance
export const mockSupabase = createMockSupabase()

// Mock the supabase module
export function setupSupabaseMock() {
  vi.mock('../src/lib/supabase', () => ({
    supabase: mockSupabase,
  }))
}
