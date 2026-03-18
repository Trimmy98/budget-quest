import { describe, it, expect } from 'vitest'

/**
 * Testar veckorapport-logiken: datumberäkningar, ISO-veckonummer,
 * och den datastruktur som generate_weekly_report RPC returnerar.
 */

// Replika av getMonday-logiken i hooken
function getMonday(offset = 0) {
  const d = new Date('2026-03-18T12:00:00') // Onsdag 18 mars 2026
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diffToMonday + offset * 7)
  return d.toISOString().split('T')[0]
}

function getISOWeekNumber(dateStr) {
  const d = new Date(dateStr)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
}

function formatDateRange(weekStart) {
  const start = new Date(weekStart)
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  const s = `${start.getDate()} ${start.toLocaleString('sv-SE', { month: 'short' })}`
  const e = `${end.getDate()} ${end.toLocaleString('sv-SE', { month: 'short' })} ${end.getFullYear()}`
  return `${s}–${e}`
}

// Simulerar beräkningarna i generate_weekly_report RPC
function computeWeeklyReport(expenses, payments, members, budgets, prevWeekTotal) {
  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0)
  const totalShared = expenses.filter(e => e.expense_type === 'shared').reduce((s, e) => s + e.amount, 0)
  const totalPersonal = expenses.filter(e => e.expense_type === 'personal').reduce((s, e) => s + e.amount, 0)

  const perMember = members.map(m => ({
    user_id: m.id,
    name: m.name,
    shared_paid: expenses.filter(e => e.user_id === m.id && e.expense_type === 'shared').reduce((s, e) => s + e.amount, 0),
    personal: expenses.filter(e => e.user_id === m.id && e.expense_type === 'personal').reduce((s, e) => s + e.amount, 0),
  }))

  const catTotals = {}
  expenses.forEach(e => { catTotals[e.category] = (catTotals[e.category] || 0) + e.amount })
  const topCategories = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }))

  const totalPayments = payments.reduce((s, p) => s + p.amount, 0)

  const budgetStatus = budgets.map(b => ({
    category: b.category,
    budget: b.budget_amount,
    spent: expenses.filter(e => e.category === b.category).reduce((s, e) => s + e.amount, 0),
    percent: b.budget_amount > 0
      ? Math.round(expenses.filter(e => e.category === b.category).reduce((s, e) => s + e.amount, 0) / b.budget_amount * 100)
      : 0,
  }))

  const vsLastWeek = prevWeekTotal > 0 ? {
    total_diff_percent: Math.round((totalSpent - prevWeekTotal) / prevWeekTotal * 1000) / 10,
    total_diff_amount: totalSpent - prevWeekTotal,
    direction: totalSpent > prevWeekTotal ? 'more' : 'less',
  } : null

  return {
    total_spent: totalSpent,
    total_shared: totalShared,
    total_personal: totalPersonal,
    per_member: perMember,
    top_categories: topCategories,
    debt_change: { start: 0, end: 0, payments: totalPayments },
    budget_status: budgetStatus,
    vs_last_week: vsLastWeek,
    expense_count: expenses.length,
    avg_per_day: Math.round(totalSpent / 7 * 100) / 100,
  }
}

describe('Veckorapport datumberäkningar', () => {
  it('getMonday(0) returnerar aktuell veckas måndag', () => {
    // 18 mars 2026 är en onsdag → måndag = 16 mars
    expect(getMonday(0)).toBe('2026-03-16')
  })

  it('getMonday(-1) returnerar förra veckans måndag', () => {
    expect(getMonday(-1)).toBe('2026-03-09')
  })

  it('ISO-veckonummer beräknas korrekt', () => {
    expect(getISOWeekNumber('2026-03-16')).toBe(12)
    expect(getISOWeekNumber('2026-03-09')).toBe(11)
    expect(getISOWeekNumber('2026-01-05')).toBe(2)
  })

  it('formatDateRange visar korrekt intervall', () => {
    const range = formatDateRange('2026-03-09')
    expect(range).toContain('9')
    expect(range).toContain('15')
    expect(range).toContain('2026')
  })
})

describe('Veckorapport databeräkningar', () => {
  const members = [
    { id: 'u1', name: 'Timmy' },
    { id: 'u2', name: 'KP' },
  ]

  it('beräknar totaler och per-member korrekt', () => {
    const expenses = [
      { user_id: 'u1', amount: 500, expense_type: 'shared', category: 'groceries' },
      { user_id: 'u2', amount: 200, expense_type: 'shared', category: 'dining' },
      { user_id: 'u1', amount: 100, expense_type: 'personal', category: 'coffee' },
    ]

    const result = computeWeeklyReport(expenses, [], members, [], 0)

    expect(result.total_spent).toBe(800)
    expect(result.total_shared).toBe(700)
    expect(result.total_personal).toBe(100)
    expect(result.expense_count).toBe(3)
    expect(result.avg_per_day).toBeCloseTo(114.29, 1)

    expect(result.per_member[0].shared_paid).toBe(500)
    expect(result.per_member[0].personal).toBe(100)
    expect(result.per_member[1].shared_paid).toBe(200)
  })

  it('top_categories sorteras fallande', () => {
    const expenses = [
      { user_id: 'u1', amount: 300, expense_type: 'shared', category: 'groceries' },
      { user_id: 'u1', amount: 500, expense_type: 'shared', category: 'housing' },
      { user_id: 'u1', amount: 100, expense_type: 'personal', category: 'coffee' },
    ]

    const result = computeWeeklyReport(expenses, [], members, [], 0)

    expect(result.top_categories[0].category).toBe('housing')
    expect(result.top_categories[0].amount).toBe(500)
    expect(result.top_categories[1].category).toBe('groceries')
  })

  it('vs_last_week beräknar procentuell ändring', () => {
    const expenses = [
      { user_id: 'u1', amount: 1000, expense_type: 'shared', category: 'groceries' },
    ]

    const result = computeWeeklyReport(expenses, [], members, [], 800)

    expect(result.vs_last_week.direction).toBe('more')
    expect(result.vs_last_week.total_diff_percent).toBe(25)
    expect(result.vs_last_week.total_diff_amount).toBe(200)
  })

  it('vs_last_week = null om ingen föregående vecka', () => {
    const expenses = [
      { user_id: 'u1', amount: 500, expense_type: 'shared', category: 'groceries' },
    ]

    const result = computeWeeklyReport(expenses, [], members, [], 0)
    expect(result.vs_last_week).toBeNull()
  })

  it('budget_status beräknar procent korrekt', () => {
    const expenses = [
      { user_id: 'u1', amount: 600, expense_type: 'shared', category: 'groceries' },
    ]
    const budgets = [
      { category: 'groceries', budget_amount: 800 },
    ]

    const result = computeWeeklyReport(expenses, [], members, budgets, 0)

    expect(result.budget_status[0].category).toBe('groceries')
    expect(result.budget_status[0].percent).toBe(75)
    expect(result.budget_status[0].spent).toBe(600)
  })

  it('betalningar summeras i debt_change', () => {
    const payments = [
      { from: 'u2', to: 'u1', amount: 500 },
      { from: 'u2', to: 'u1', amount: 300 },
    ]

    const result = computeWeeklyReport([], payments, members, [], 0)
    expect(result.debt_change.payments).toBe(800)
  })
})
