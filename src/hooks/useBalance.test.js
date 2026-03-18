import { describe, it, expect } from 'vitest'

/**
 * Testar saldo-beräkningslogiken som get_my_balance() RPC returnerar.
 *
 * Ny modell: saldo = SUM(balance_events.amount) + income_since - expenses_since
 * balance_events har typer: initial, adjustment, correction
 * starting_balance = SUM(alla events), starting_balance_date = äldsta eventens created_at
 */

function computeBalance(events, startDate, expenses, income, memberCount, myUserId) {
  const startD = new Date(startDate)
  const startingBalance = events.reduce((s, e) => s + e.amount, 0)

  const incomeSince = income
    .filter(i => i.userId === myUserId && new Date(i.date) >= startD)
    .reduce((s, i) => s + i.amount, 0)

  const sharedAfter = expenses
    .filter(e => e.expenseType === 'shared' && new Date(e.date) >= startD)
  const sharedSince = sharedAfter.reduce((s, e) => s + e.amount / memberCount, 0)

  const personalAfter = expenses
    .filter(e => e.expenseType === 'personal' && e.userId === myUserId && new Date(e.date) >= startD)
  const personalSince = personalAfter.reduce((s, e) => s + e.amount, 0)

  const expensesSince = sharedSince + personalSince
  const currentBalance = startingBalance + incomeSince - expensesSince

  const adjustmentCount = events.filter(e => e.type === 'adjustment' || e.type === 'correction').length

  return {
    starting_balance: startingBalance,
    income_since: incomeSince,
    expenses_since: Math.round(expensesSince * 100) / 100,
    shared_expenses_since: Math.round(sharedSince * 100) / 100,
    personal_expenses_since: personalSince,
    current_balance: Math.round(currentBalance * 100) / 100,
    adjustment_count: adjustmentCount,
    events,
  }
}

describe('Saldo-beräkningar (get_my_balance logik)', () => {
  const me = 'user-1'
  const other = 'user-2'

  it('beräknar korrekt saldo utan aktivitet', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    expect(result.current_balance).toBe(4200)
    expect(result.expenses_since).toBe(0)
    expect(result.income_since).toBe(0)
  })

  it('shared expenses delas på memberCount', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const expenses = [
      { userId: me, amount: 1000, expenseType: 'shared', date: '2026-03-19' },
      { userId: other, amount: 600, expenseType: 'shared', date: '2026-03-19' },
    ]
    const result = computeBalance(events, '2026-03-18', expenses, [], 2, me)
    expect(result.shared_expenses_since).toBe(800)
    expect(result.current_balance).toBe(3400)
  })

  it('personal expenses räknar bara egna', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const expenses = [
      { userId: me, amount: 200, expenseType: 'personal', date: '2026-03-19' },
      { userId: other, amount: 300, expenseType: 'personal', date: '2026-03-19' },
    ]
    const result = computeBalance(events, '2026-03-18', expenses, [], 2, me)
    expect(result.personal_expenses_since).toBe(200)
    expect(result.current_balance).toBe(4000)
  })

  it('inkomst ökar saldot', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const income = [{ userId: me, amount: 30000, date: '2026-03-25' }]
    const result = computeBalance(events, '2026-03-18', [], income, 2, me)
    expect(result.income_since).toBe(30000)
    expect(result.current_balance).toBe(34200)
  })

  it('utgifter INNAN startdatum ignoreras', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const expenses = [
      { userId: me, amount: 500, expenseType: 'shared', date: '2026-03-17' },
      { userId: me, amount: 200, expenseType: 'shared', date: '2026-03-19' },
    ]
    const result = computeBalance(events, '2026-03-18', expenses, [], 2, me)
    expect(result.shared_expenses_since).toBe(100)
    expect(result.current_balance).toBe(4100)
  })

  it('negativt saldo beräknas korrekt', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const expenses = [
      { userId: me, amount: 10000, expenseType: 'shared', date: '2026-03-19' },
    ]
    const result = computeBalance(events, '2026-03-18', expenses, [], 2, me)
    expect(result.current_balance).toBe(-800)
  })

  it('komplett scenario med mixed expenses och inkomst', () => {
    const events = [{ type: 'initial', amount: 4200 }]
    const expenses = [
      { userId: me, amount: 1926, expenseType: 'shared', date: '2026-03-19' },
      { userId: other, amount: 287, expenseType: 'shared', date: '2026-03-19' },
      { userId: me, amount: 150, expenseType: 'personal', date: '2026-03-20' },
    ]
    const income = [{ userId: me, amount: 2000, date: '2026-03-25' }]
    const result = computeBalance(events, '2026-03-18', expenses, income, 2, me)
    expect(result.shared_expenses_since).toBe(1106.5)
    expect(result.personal_expenses_since).toBe(150)
    expect(result.current_balance).toBe(4943.5)
  })
})

describe('Balance events (justeringar och korrigeringar)', () => {
  const me = 'user-1'

  it('adjustment adderas till startsaldo', () => {
    const events = [
      { type: 'initial', amount: 4200 },
      { type: 'adjustment', amount: 200 },  // fick tillbaka från kompis
    ]
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    expect(result.starting_balance).toBe(4400)
    expect(result.current_balance).toBe(4400)
    expect(result.adjustment_count).toBe(1)
  })

  it('negativ adjustment minskar saldot', () => {
    const events = [
      { type: 'initial', amount: 4200 },
      { type: 'adjustment', amount: -150 },  // betalade något utanför appen
    ]
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    expect(result.starting_balance).toBe(4050)
    expect(result.current_balance).toBe(4050)
  })

  it('correction justerar till önskat belopp', () => {
    // Startsaldo = 4200, men vi vill korrigera till 5000
    // correction_amount = 5000 - 4200 = 800
    const events = [
      { type: 'initial', amount: 4200 },
      { type: 'correction', amount: 800 },
    ]
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    expect(result.starting_balance).toBe(5000)
    expect(result.current_balance).toBe(5000)
    expect(result.adjustment_count).toBe(1)
  })

  it('flera justeringar summeras korrekt', () => {
    const events = [
      { type: 'initial', amount: 4200 },
      { type: 'adjustment', amount: 200 },
      { type: 'adjustment', amount: -50 },
      { type: 'correction', amount: -350 },  // korrigera ner
    ]
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    // 4200 + 200 - 50 - 350 = 4000
    expect(result.starting_balance).toBe(4000)
    expect(result.current_balance).toBe(4000)
    expect(result.adjustment_count).toBe(3)
  })

  it('justeringar kombineras med expenses och income', () => {
    const events = [
      { type: 'initial', amount: 4200 },
      { type: 'adjustment', amount: 500 },  // fick tillbaka
    ]
    const expenses = [
      { userId: me, amount: 1000, expenseType: 'shared', date: '2026-03-19' },
    ]
    const income = [{ userId: me, amount: 2000, date: '2026-03-25' }]
    const result = computeBalance(events, '2026-03-18', expenses, income, 2, me)
    // starting: 4700, income: 2000, shared: 1000/2 = 500
    // balance: 4700 + 2000 - 500 = 6200
    expect(result.starting_balance).toBe(4700)
    expect(result.current_balance).toBe(6200)
  })

  it('inga events → tomt resultat', () => {
    const events = []
    const result = computeBalance(events, '2026-03-18', [], [], 2, me)
    expect(result.starting_balance).toBe(0)
    expect(result.current_balance).toBe(0)
    expect(result.adjustment_count).toBe(0)
  })
})
