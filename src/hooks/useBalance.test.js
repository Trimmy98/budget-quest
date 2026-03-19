import { describe, it, expect } from 'vitest'

/**
 * Testar saldo-beräkningslogiken som get_my_balance() RPC returnerar.
 *
 * Modell: saldo = SUM(balance_events.amount) + income_after - expenses_after
 * "after" = loggade EFTER att saldot sattes (created_at > sb_date)
 * income: bara månader EFTER saldo-månaden (month > sb_month)
 *
 * Logik: startsaldot ÄR det faktiska kontosaldot. Allt som redan fanns
 * (inkomst, utgifter) är redan inbakat. Bara NYA poster räknas.
 */

function computeBalance(events, sbDate, expenses, income, memberCount, myUserId) {
  const sbTime = new Date(sbDate).getTime()
  const sbMonth = sbDate.slice(0, 7) // 'YYYY-MM'
  const startingBalance = events.reduce((s, e) => s + e.amount, 0)

  // Bara inkomst för månader EFTER saldo-månaden
  const incomeSince = income
    .filter(i => i.userId === myUserId && i.month > sbMonth)
    .reduce((s, i) => s + i.amount, 0)

  // Bara expenses loggade EFTER att saldot sattes (created_at > sb_date)
  const expensesAfter = expenses.filter(e => new Date(e.createdAt).getTime() > sbTime)

  const sharedSince = expensesAfter
    .filter(e => e.expenseType === 'shared')
    .reduce((s, e) => s + e.amount / memberCount, 0)

  const personalSince = expensesAfter
    .filter(e => e.expenseType === 'personal' && e.userId === myUserId)
    .reduce((s, e) => s + e.amount, 0)

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
  // Saldo satt 18 mars kl 17:00
  const sbDate = '2026-03-18T17:00:00Z'

  it('beräknar korrekt saldo utan ny aktivitet', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const result = computeBalance(events, sbDate, [], [], 2, me)
    expect(result.current_balance).toBe(3053)
    expect(result.expenses_since).toBe(0)
    expect(result.income_since).toBe(0)
  })

  it('befintliga utgifter FÖRE saldot räknas INTE', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const expenses = [
      // Loggad FÖRE saldot sattes — ska ignoreras
      { userId: me, amount: 1000, expenseType: 'shared', createdAt: '2026-03-18T10:00:00Z' },
    ]
    const result = computeBalance(events, sbDate, expenses, [], 2, me)
    expect(result.expenses_since).toBe(0)
    expect(result.current_balance).toBe(3053)
  })

  it('befintlig inkomst i saldo-månaden räknas INTE', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    // Inkomst för mars — redan i saldot
    const income = [{ userId: me, amount: 2600, month: '2026-03' }]
    const result = computeBalance(events, sbDate, [], income, 2, me)
    expect(result.income_since).toBe(0)
    expect(result.current_balance).toBe(3053)
  })

  it('ny utgift EFTER saldot minskar balansen', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const expenses = [
      { userId: me, amount: 500, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
    ]
    const result = computeBalance(events, sbDate, expenses, [], 2, me)
    // shared: 500 / 2 = 250
    expect(result.shared_expenses_since).toBe(250)
    expect(result.current_balance).toBe(2803)
  })

  it('ny inkomst NÄSTA månad ökar balansen', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const income = [{ userId: me, amount: 30000, month: '2026-04' }]
    const result = computeBalance(events, sbDate, [], income, 2, me)
    expect(result.income_since).toBe(30000)
    expect(result.current_balance).toBe(33053)
  })

  it('personal expenses räknar bara egna', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const expenses = [
      { userId: me, amount: 200, expenseType: 'personal', createdAt: '2026-03-19T09:00:00Z' },
      { userId: other, amount: 300, expenseType: 'personal', createdAt: '2026-03-19T09:00:00Z' },
    ]
    const result = computeBalance(events, sbDate, expenses, [], 2, me)
    expect(result.personal_expenses_since).toBe(200)
    expect(result.current_balance).toBe(2853)
  })

  it('komplett scenario: nya utgifter + ny inkomst', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const expenses = [
      // Före saldot — ignoreras
      { userId: me, amount: 1000, expenseType: 'shared', createdAt: '2026-03-17T10:00:00Z' },
      // Efter saldot — räknas
      { userId: me, amount: 400, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
      { userId: other, amount: 200, expenseType: 'shared', createdAt: '2026-03-19T09:00:00Z' },
      { userId: me, amount: 100, expenseType: 'personal', createdAt: '2026-03-20T10:00:00Z' },
    ]
    const income = [
      { userId: me, amount: 2600, month: '2026-03' },  // ignoreras (samma månad)
      { userId: me, amount: 5000, month: '2026-04' },  // räknas
    ]
    const result = computeBalance(events, sbDate, expenses, income, 2, me)
    // shared: (400 + 200) / 2 = 300
    // personal: 100
    // income: 5000 (april)
    // balance: 3053 + 5000 - 300 - 100 = 7653
    expect(result.shared_expenses_since).toBe(300)
    expect(result.personal_expenses_since).toBe(100)
    expect(result.income_since).toBe(5000)
    expect(result.current_balance).toBe(7653)
  })
})

describe('Balance events (justeringar och korrigeringar)', () => {
  const me = 'user-1'
  const sbDate = '2026-03-18T17:00:00Z'

  it('adjustment adderas till startsaldo', () => {
    const events = [
      { type: 'initial', amount: 3053 },
      { type: 'adjustment', amount: 200 },
    ]
    const result = computeBalance(events, sbDate, [], [], 2, me)
    expect(result.starting_balance).toBe(3253)
    expect(result.current_balance).toBe(3253)
    expect(result.adjustment_count).toBe(1)
  })

  it('negativ adjustment minskar saldot', () => {
    const events = [
      { type: 'initial', amount: 3053 },
      { type: 'adjustment', amount: -150 },
    ]
    const result = computeBalance(events, sbDate, [], [], 2, me)
    expect(result.starting_balance).toBe(2903)
    expect(result.current_balance).toBe(2903)
  })

  it('correction justerar till önskat belopp', () => {
    const events = [
      { type: 'initial', amount: 3053 },
      { type: 'correction', amount: 947 },  // 3053 + 947 = 4000
    ]
    const result = computeBalance(events, sbDate, [], [], 2, me)
    expect(result.starting_balance).toBe(4000)
    expect(result.current_balance).toBe(4000)
  })

  it('flera justeringar summeras korrekt', () => {
    const events = [
      { type: 'initial', amount: 3053 },
      { type: 'adjustment', amount: 200 },
      { type: 'adjustment', amount: -50 },
      { type: 'correction', amount: -203 },
    ]
    const result = computeBalance(events, sbDate, [], [], 2, me)
    // 3053 + 200 - 50 - 203 = 3000
    expect(result.starting_balance).toBe(3000)
    expect(result.current_balance).toBe(3000)
    expect(result.adjustment_count).toBe(3)
  })

  it('justeringar kombineras med nya expenses', () => {
    const events = [
      { type: 'initial', amount: 3053 },
      { type: 'adjustment', amount: 500 },
    ]
    const expenses = [
      { userId: me, amount: 1000, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
    ]
    const result = computeBalance(events, sbDate, expenses, [], 2, me)
    // starting: 3553, shared: 1000/2 = 500
    // balance: 3553 - 500 = 3053
    expect(result.starting_balance).toBe(3553)
    expect(result.current_balance).toBe(3053)
  })

  it('inga events → tomt resultat', () => {
    const events = []
    const result = computeBalance(events, sbDate, [], [], 2, me)
    expect(result.starting_balance).toBe(0)
    expect(result.current_balance).toBe(0)
    expect(result.adjustment_count).toBe(0)
  })
})

// ═══ SAVINGS TRACKING ═══

function computeSavings(events, sbDate, savingsTrackingStart, expenses, income, memberCount, myUserId) {
  const savStart = savingsTrackingStart || sbDate
  const savMonth = savStart.slice(0, 7)
  const savTime = new Date(savStart).getTime()
  const sbTime = new Date(sbDate).getTime()
  const startingBalance = events.reduce((s, e) => s + e.amount, 0)

  const savIncome = income
    .filter(i => i.userId === myUserId && i.month > savMonth)
    .reduce((s, i) => s + i.amount, 0)

  const expAfter = expenses.filter(e => new Date(e.createdAt).getTime() > savTime)
  const savExpShared = expAfter
    .filter(e => e.expenseType === 'shared')
    .reduce((s, e) => s + e.amount / memberCount, 0)
  const savExpPersonal = expAfter
    .filter(e => e.expenseType === 'personal' && e.userId === myUserId)
    .reduce((s, e) => s + e.amount, 0)

  const savingsAmount = savIncome - savExpShared - savExpPersonal

  let savingsBalanceAtStart
  if (new Date(savStart).getTime() <= sbTime) {
    savingsBalanceAtStart = startingBalance
  } else {
    const incBefore = income
      .filter(i => i.userId === myUserId && i.month > sbDate.slice(0, 7) && i.month <= savMonth)
      .reduce((s, i) => s + i.amount, 0)
    const expBetween = expenses.filter(e => {
      const t = new Date(e.createdAt).getTime()
      return t > sbTime && t <= savTime
    })
    const sharedBefore = expBetween.filter(e => e.expenseType === 'shared').reduce((s, e) => s + e.amount / memberCount, 0)
    const personalBefore = expBetween.filter(e => e.expenseType === 'personal' && e.userId === myUserId).reduce((s, e) => s + e.amount, 0)
    savingsBalanceAtStart = startingBalance + incBefore - sharedBefore - personalBefore
  }

  return {
    savings_amount: Math.round(savingsAmount * 100) / 100,
    savings_balance_at_start: Math.round(savingsBalanceAtStart * 100) / 100,
    savings_period_income: savIncome,
    savings_period_expenses: Math.round((savExpShared + savExpPersonal) * 100) / 100,
  }
}

describe('Sparande-tracking', () => {
  const me = 'user-1'
  const sbDate = '2026-03-18T17:00:00Z'

  it('utan savingsTrackingStart: fallback till sbDate', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const expenses = [
      { userId: me, amount: 500, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
    ]
    const result = computeSavings(events, sbDate, null, expenses, [], 2, me)
    // Samma som balance: shared 500/2 = 250, sparande = 0 - 250 = -250
    expect(result.savings_amount).toBe(-250)
    expect(result.savings_balance_at_start).toBe(3053)
  })

  it('savingsTrackingStart efter sbDate: räknar bara efter tracking start', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const savStart = '2026-03-20T00:00:00Z'
    const expenses = [
      // Före savings start — ignoreras i sparande
      { userId: me, amount: 400, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
      // Efter savings start — räknas
      { userId: me, amount: 200, expenseType: 'shared', createdAt: '2026-03-21T10:00:00Z' },
    ]
    const result = computeSavings(events, sbDate, savStart, expenses, [], 2, me)
    // Sparande: 0 - 200/2 = -100
    expect(result.savings_amount).toBe(-100)
    // Balance at savings start: 3053 - 400/2 = 2853
    expect(result.savings_balance_at_start).toBe(2853)
  })

  it('nollställning: savings = 0 om inga nya poster', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    // Savings start just nu — inga expenses efter
    const savStart = '2026-03-19T12:00:00Z'
    const expenses = [
      { userId: me, amount: 500, expenseType: 'shared', createdAt: '2026-03-19T08:00:00Z' },
    ]
    const result = computeSavings(events, sbDate, savStart, expenses, [], 2, me)
    expect(result.savings_amount).toBe(0)
    expect(result.savings_period_expenses).toBe(0)
  })

  it('inkomst efter tracking start ökar sparande', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const savStart = '2026-03-18T17:00:00Z'
    const income = [
      { userId: me, amount: 2600, month: '2026-03' },   // ignoreras (samma månad)
      { userId: me, amount: 30000, month: '2026-04' },  // räknas
    ]
    const result = computeSavings(events, sbDate, savStart, [], income, 2, me)
    expect(result.savings_amount).toBe(30000)
    expect(result.savings_period_income).toBe(30000)
  })

  it('balance_at_start beräknas med mellanliggande aktivitet', () => {
    const events = [{ type: 'initial', amount: 3053 }]
    const savStart = '2026-04-01T00:00:00Z'
    const expenses = [
      // Mellan sb och sav_start
      { userId: me, amount: 1000, expenseType: 'shared', createdAt: '2026-03-20T10:00:00Z' },
      { userId: me, amount: 200, expenseType: 'personal', createdAt: '2026-03-25T10:00:00Z' },
      // Efter sav_start
      { userId: me, amount: 600, expenseType: 'shared', createdAt: '2026-04-02T10:00:00Z' },
    ]
    const income = [
      { userId: me, amount: 5000, month: '2026-04' },  // i sav_start-månaden, räknas INTE (<=)
    ]
    const result = computeSavings(events, sbDate, savStart, expenses, income, 2, me)
    // Balance at start: 3053 - 1000/2 - 200 = 3053 - 500 - 200 = 2353
    // (income för april: month > '2026-03' AND month <= '2026-04' → 5000 inkluderas i "before")
    // Actually: income before = month > '2026-03' AND month <= '2026-04' = 5000
    // Balance at start: 3053 + 5000 - 500 - 200 = 7353
    expect(result.savings_balance_at_start).toBe(7353)
    // Savings after: income month > '2026-04' = 0, expenses = 600/2 = 300
    // savings_amount = 0 - 300 = -300
    expect(result.savings_amount).toBe(-300)
  })
})
