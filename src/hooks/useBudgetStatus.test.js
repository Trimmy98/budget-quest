import { describe, it, expect } from 'vitest'

/**
 * Testar budget-logiken som get_budget_status() RPC returnerar.
 * Pure-function tester som simulerar RPC-beräkningarna.
 *
 * RPC beräknar per kategori:
 *   household_pct = household_spent / budget_amount * 100
 *   household_status = over_budget (>100%) | warning (>75%) | on_track
 *   daily_allowance = remaining > 0 ? remaining / days_left : 0
 */

// Simulerar get_budget_status-logiken
function computeBudgetStatus(budgets, expenses, memberCount, daysLeft) {
  const categories = budgets.map(b => {
    const householdSpent = expenses
      .filter(e => e.category === b.category)
      .reduce((sum, e) => sum + e.amount, 0)

    const mySpent = expenses
      .filter(e => e.category === b.category)
      .reduce((sum, e) => {
        if (e.expenseType === 'shared') return sum + e.amount / memberCount
        if (e.userId === 'me') return sum + e.amount
        return sum
      }, 0)

    const householdRemaining = b.budgetAmount - householdSpent
    const householdPct = b.budgetAmount > 0 ? (householdSpent / b.budgetAmount) * 100 : 0

    const householdStatus = householdSpent > b.budgetAmount
      ? 'over_budget'
      : (b.budgetAmount > 0 && householdSpent / b.budgetAmount > 0.75)
        ? 'warning'
        : 'on_track'

    const dailyAllowance = daysLeft > 0 && householdRemaining > 0
      ? householdRemaining / daysLeft
      : 0

    return {
      category: b.category,
      budgetAmount: b.budgetAmount,
      householdSpent: Math.round(householdSpent * 100) / 100,
      mySpent: Math.round(mySpent * 100) / 100,
      householdRemaining: Math.round(householdRemaining * 100) / 100,
      householdPct: Math.round(householdPct * 10) / 10,
      householdStatus,
      dailyAllowance: Math.round(dailyAllowance * 100) / 100,
    }
  })

  const totals = {
    budget: categories.reduce((s, c) => s + c.budgetAmount, 0),
    householdSpent: categories.reduce((s, c) => s + c.householdSpent, 0),
    householdRemaining: categories.reduce((s, c) => s + c.householdRemaining, 0),
    householdPct: 0,
    dailyAllowance: 0,
  }
  totals.householdPct = totals.budget > 0
    ? Math.round(totals.householdSpent / totals.budget * 1000) / 10
    : 0
  totals.dailyAllowance = daysLeft > 0 && totals.householdRemaining > 0
    ? Math.round(totals.householdRemaining / daysLeft * 100) / 100
    : 0

  return { categories, totals, daysLeft }
}

// Dashboard-tolkning av budgetStatus
function interpretBudgetCategory(cat) {
  const pct = cat.householdPct
  let barColor
  if (pct > 90) barColor = '#ff6b6b'
  else if (pct > 75) barColor = '#ff9f43'
  else if (pct > 50) barColor = '#ffd93d'
  else barColor = '#00ff87'
  return { barColor, isWarning: cat.householdStatus !== 'on_track' }
}

describe('get_budget_status beräkningar', () => {
  it('returnerar korrekt spent per kategori', () => {
    const budgets = [
      { category: 'groceries', budgetAmount: 5000 },
      { category: 'transport', budgetAmount: 2000 },
    ]
    const expenses = [
      { category: 'groceries', amount: 1500, expenseType: 'shared', userId: 'me' },
      { category: 'groceries', amount: 800, expenseType: 'shared', userId: 'other' },
      { category: 'transport', amount: 600, expenseType: 'shared', userId: 'me' },
    ]

    const result = computeBudgetStatus(budgets, expenses, 2, 14)

    const groceries = result.categories.find(c => c.category === 'groceries')
    expect(groceries.householdSpent).toBe(2300)
    expect(groceries.mySpent).toBe(1150) // 2300 / 2 members

    const transport = result.categories.find(c => c.category === 'transport')
    expect(transport.householdSpent).toBe(600)
    expect(transport.mySpent).toBe(300) // 600 / 2 members
  })

  it('returnerar warning vid >75%', () => {
    const budgets = [{ category: 'groceries', budgetAmount: 1000 }]
    const expenses = [
      { category: 'groceries', amount: 800, expenseType: 'shared', userId: 'me' },
    ]

    const result = computeBudgetStatus(budgets, expenses, 1, 10)
    const cat = result.categories[0]

    expect(cat.householdStatus).toBe('warning')
    expect(cat.householdPct).toBe(80)
  })

  it('returnerar over_budget när spent > budget', () => {
    const budgets = [{ category: 'groceries', budgetAmount: 1000 }]
    const expenses = [
      { category: 'groceries', amount: 1200, expenseType: 'shared', userId: 'me' },
    ]

    const result = computeBudgetStatus(budgets, expenses, 1, 5)
    const cat = result.categories[0]

    expect(cat.householdStatus).toBe('over_budget')
    expect(cat.householdPct).toBe(120)
    expect(cat.householdRemaining).toBe(-200)
  })

  it('daily_allowance = 0 när över budget', () => {
    const budgets = [{ category: 'groceries', budgetAmount: 500 }]
    const expenses = [
      { category: 'groceries', amount: 700, expenseType: 'shared', userId: 'me' },
    ]

    const result = computeBudgetStatus(budgets, expenses, 1, 10)
    const cat = result.categories[0]

    expect(cat.dailyAllowance).toBe(0)
    expect(result.totals.dailyAllowance).toBe(0)
  })

  it('daily_allowance beräknas korrekt: remaining / days_left', () => {
    const budgets = [
      { category: 'groceries', budgetAmount: 3000 },
      { category: 'transport', budgetAmount: 1000 },
    ]
    const expenses = [
      { category: 'groceries', amount: 1000, expenseType: 'shared', userId: 'me' },
      { category: 'transport', amount: 200, expenseType: 'shared', userId: 'me' },
    ]

    const result = computeBudgetStatus(budgets, expenses, 1, 14)

    const groceries = result.categories.find(c => c.category === 'groceries')
    // remaining = 3000 - 1000 = 2000, daily = 2000 / 14 ≈ 142.86
    expect(groceries.dailyAllowance).toBeCloseTo(142.86, 1)

    const transport = result.categories.find(c => c.category === 'transport')
    // remaining = 1000 - 200 = 800, daily = 800 / 14 ≈ 57.14
    expect(transport.dailyAllowance).toBeCloseTo(57.14, 1)

    // Totals: remaining = 2800, daily = 2800 / 14 = 200
    expect(result.totals.dailyAllowance).toBe(200)
  })

  it('budget_defaults kopieras till monthly_budgets för ny månad', () => {
    // Simulerar useBudgetStatus.copyFromDefaults flow:
    // 1. defaults finns med kategori-belopp
    // 2. saveBudgets skapar monthly_budgets-rader från defaults
    const defaults = { groceries: 5000, transport: 2000, housing: 12000 }

    // Simulera saveBudgets: entries med positiva belopp
    const entries = Object.entries(defaults).filter(([, amt]) => amt > 0)
    const rows = entries.map(([category, budget_amount]) => ({
      household_id: 'hh-1',
      month: '2026-04',
      category,
      budget_amount,
      created_by: 'user-1',
    }))

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      household_id: 'hh-1',
      month: '2026-04',
      category: 'groceries',
      budget_amount: 5000,
      created_by: 'user-1',
    })

    // Sedan: computeBudgetStatus med noll utgifter → allt kvar
    const budgets = entries.map(([category, budgetAmount]) => ({ category, budgetAmount }))
    const result = computeBudgetStatus(budgets, [], 2, 30)

    expect(result.totals.budget).toBe(19000)
    expect(result.totals.householdSpent).toBe(0)
    expect(result.totals.householdRemaining).toBe(19000)
    expect(result.totals.dailyAllowance).toBeCloseTo(633.33, 1)
    result.categories.forEach(c => {
      expect(c.householdStatus).toBe('on_track')
      expect(c.householdPct).toBe(0)
    })
  })

  it('Dashboard-tolkning: färgkodning matchar procent', () => {
    // on_track (< 50%)
    expect(interpretBudgetCategory({ householdPct: 30, householdStatus: 'on_track' }))
      .toEqual({ barColor: '#00ff87', isWarning: false })

    // 50-75% gul
    expect(interpretBudgetCategory({ householdPct: 60, householdStatus: 'on_track' }))
      .toEqual({ barColor: '#ffd93d', isWarning: false })

    // 75-90% orange (warning)
    expect(interpretBudgetCategory({ householdPct: 80, householdStatus: 'warning' }))
      .toEqual({ barColor: '#ff9f43', isWarning: true })

    // >90% röd (over_budget)
    expect(interpretBudgetCategory({ householdPct: 110, householdStatus: 'over_budget' }))
      .toEqual({ barColor: '#ff6b6b', isWarning: true })
  })
})
