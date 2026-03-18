import { describe, it, expect } from 'vitest'

/**
 * Testar skuld-logiken som calculate_debt() RPC returnerar
 * och hur Dashboard tolkar den.
 *
 * Formler (server-side):
 *   expense_balance = my_shared_total - grand_total / member_count
 *   payment_adjustment = sent - received
 *   net_balance = expense_balance + payment_adjustment
 *
 * Dashboard-tolkning:
 *   allEven = Math.abs(myBalance.net_balance) < 0.5
 *   iOwe = net_balance < -0.5
 *   absDebt = Math.abs(net_balance)
 */

// Simulerar exakt samma beräkning som calculate_debt() RPC
function calculateDebt(sharedExpenses, payments, memberCount) {
  const memberTotals = {}
  for (const exp of sharedExpenses) {
    memberTotals[exp.userId] = (memberTotals[exp.userId] || 0) + exp.amount
  }

  const grandTotal = Object.values(memberTotals).reduce((a, b) => a + b, 0)
  const fairShare = grandTotal / memberCount

  const members = Object.entries(memberTotals).map(([userId, total]) => {
    const expenseBalance = total - fairShare

    let sent = 0
    let received = 0
    for (const p of payments) {
      if (p.fromUserId === userId) sent += p.amount
      if (p.toUserId === userId) received += p.amount
    }
    const paymentAdjustment = sent - received

    return {
      userId,
      mySharedTotal: total,
      fairShare,
      expenseBalance: Math.round(expenseBalance * 100) / 100,
      paymentAdjustment: Math.round(paymentAdjustment * 100) / 100,
      netBalance: Math.round((expenseBalance + paymentAdjustment) * 100) / 100,
    }
  })

  return { grandTotal, fairShare, memberCount, members }
}

// Simulerar Dashboard-tolkningen av skuld
function interpretDebt(debtResult, currentUserId) {
  const myBalance = debtResult.members.find(m => m.userId === currentUserId)
  const otherMember = debtResult.members.find(m => m.userId !== currentUserId)
  const allEven = !myBalance || Math.abs(myBalance.netBalance) < 0.5
  const iOwe = !allEven && myBalance.netBalance < -0.5
  const absDebt = myBalance ? Math.abs(myBalance.netBalance) : 0

  return { allEven, iOwe, absDebt, myBalance, otherMember }
}

describe('Pengapusslet: skuld-beräkning', () => {
  const USER_A = 'user-a'
  const USER_B = 'user-b'

  it('Test 1: Skuld beräknas korrekt med bara utgifter', () => {
    // A lagt ut 1000, B lagt ut 400
    const expenses = [
      { userId: USER_A, amount: 1000 },
      { userId: USER_B, amount: 400 },
    ]

    const result = calculateDebt(expenses, [], 2)

    // Grand total = 1400, fair share = 700
    expect(result.grandTotal).toBe(1400)
    expect(result.fairShare).toBe(700)

    // A: 1000 - 700 = +300 (andra skuldar A)
    const memberA = result.members.find(m => m.userId === USER_A)
    expect(memberA.expenseBalance).toBe(300)
    expect(memberA.netBalance).toBe(300)

    // B: 400 - 700 = -300 (B skuldar)
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberB.expenseBalance).toBe(-300)
    expect(memberB.netBalance).toBe(-300)

    // Dashboard: sett från B — B skyldig A 300
    const ui = interpretDebt(result, USER_B)
    expect(ui.allEven).toBe(false)
    expect(ui.iOwe).toBe(true)
    expect(ui.absDebt).toBe(300)
  })

  it('Test 2: Betalning minskar skulden', () => {
    // A lagt ut 1000, B lagt ut 400, B betalar A 200
    const expenses = [
      { userId: USER_A, amount: 1000 },
      { userId: USER_B, amount: 400 },
    ]
    const payments = [
      { fromUserId: USER_B, toUserId: USER_A, amount: 200 },
    ]

    const result = calculateDebt(expenses, payments, 2)

    // B: expense_balance = -300, payment_adj = +200 (sent), net = -100
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberB.expenseBalance).toBe(-300)
    expect(memberB.paymentAdjustment).toBe(200)
    expect(memberB.netBalance).toBe(-100)

    // A: expense_balance = +300, payment_adj = -200 (received), net = +100
    const memberA = result.members.find(m => m.userId === USER_A)
    expect(memberA.expenseBalance).toBe(300)
    expect(memberA.paymentAdjustment).toBe(-200)
    expect(memberA.netBalance).toBe(100)

    // Dashboard: B skyldig A 100
    const ui = interpretDebt(result, USER_B)
    expect(ui.iOwe).toBe(true)
    expect(ui.absDebt).toBe(100)
  })

  it('Test 3: Betalning som överstiger skulden', () => {
    // A: 1000, B: 400, skuld = 300. B betalar A 500 (200 för mycket)
    const expenses = [
      { userId: USER_A, amount: 1000 },
      { userId: USER_B, amount: 400 },
    ]
    const payments = [
      { fromUserId: USER_B, toUserId: USER_A, amount: 500 },
    ]

    const result = calculateDebt(expenses, payments, 2)

    // B: -300 + 500 = +200 (A skuldar nu B)
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberB.netBalance).toBe(200)

    // A: +300 - 500 = -200 (A skuldar)
    const memberA = result.members.find(m => m.userId === USER_A)
    expect(memberA.netBalance).toBe(-200)

    // Dashboard sett från A: A skuldar B 200
    const uiA = interpretDebt(result, USER_A)
    expect(uiA.iOwe).toBe(true)
    expect(uiA.absDebt).toBe(200)

    // Dashboard sett från B: B har kredit 200
    const uiB = interpretDebt(result, USER_B)
    expect(uiB.iOwe).toBe(false)
    expect(uiB.allEven).toBe(false)
    expect(uiB.absDebt).toBe(200)
  })

  it('Test 4: Ingen skuld vid lika utlägg', () => {
    const expenses = [
      { userId: USER_A, amount: 500 },
      { userId: USER_B, amount: 500 },
    ]

    const result = calculateDebt(expenses, [], 2)

    const memberA = result.members.find(m => m.userId === USER_A)
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberA.netBalance).toBe(0)
    expect(memberB.netBalance).toBe(0)

    // Dashboard: kvitt
    const ui = interpretDebt(result, USER_A)
    expect(ui.allEven).toBe(true)
  })

  it('Test 5: Skuld = 0 efter exakt betalning', () => {
    // A: 1000, B: 400 → skuld 300. B betalar A exakt 300.
    const expenses = [
      { userId: USER_A, amount: 1000 },
      { userId: USER_B, amount: 400 },
    ]
    const payments = [
      { fromUserId: USER_B, toUserId: USER_A, amount: 300 },
    ]

    const result = calculateDebt(expenses, payments, 2)

    const memberA = result.members.find(m => m.userId === USER_A)
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberA.netBalance).toBe(0)
    expect(memberB.netBalance).toBe(0)

    // Dashboard: kvitt
    const uiA = interpretDebt(result, USER_A)
    expect(uiA.allEven).toBe(true)
    const uiB = interpretDebt(result, USER_B)
    expect(uiB.allEven).toBe(true)
  })

  it('Teckenkonvention: betalning MINSKAR skuld (regressionstest)', () => {
    // Exakt scenariot som avslöjade buggen:
    // Timmy: 3252.50, KP: 470.00, KP → Timmy: 930
    const expenses = [
      { userId: 'timmy', amount: 3252.50 },
      { userId: 'kp', amount: 470.00 },
    ]
    const payments = [
      { fromUserId: 'kp', toUserId: 'timmy', amount: 930 },
    ]

    const result = calculateDebt(expenses, payments, 2)

    // Utan betalning: skuld = 1391.25
    // Med betalning: 1391.25 - 930 = 461.25
    const timmy = result.members.find(m => m.userId === 'timmy')
    const kp = result.members.find(m => m.userId === 'kp')

    expect(timmy.netBalance).toBe(461.25)
    expect(kp.netBalance).toBe(-461.25)

    // INTE 2321.25 (den buggiga siffran med inverterat tecken)
    expect(Math.abs(timmy.netBalance)).not.toBe(2321.25)
  })

  it('Flera betalningar i båda riktningar', () => {
    // A: 800, B: 200. Skuld = 300.
    // B → A: 100, A → B: 50 (netto: B betalat 50 extra)
    const expenses = [
      { userId: USER_A, amount: 800 },
      { userId: USER_B, amount: 200 },
    ]
    const payments = [
      { fromUserId: USER_B, toUserId: USER_A, amount: 100 },
      { fromUserId: USER_A, toUserId: USER_B, amount: 50 },
    ]

    const result = calculateDebt(expenses, payments, 2)

    // B: expense_balance = -300, payment_adj = 100 (sent) - 50 (received) = +50, net = -250
    const memberB = result.members.find(m => m.userId === USER_B)
    expect(memberB.paymentAdjustment).toBe(50)
    expect(memberB.netBalance).toBe(-250)

    // A: expense_balance = +300, payment_adj = 50 (sent) - 100 (received) = -50, net = +250
    const memberA = result.members.find(m => m.userId === USER_A)
    expect(memberA.paymentAdjustment).toBe(-50)
    expect(memberA.netBalance).toBe(250)
  })
})
