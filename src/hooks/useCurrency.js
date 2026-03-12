import { useState, useEffect } from 'react'

const CURRENCIES = [
  { code: 'SEK', symbol: 'kr', name: 'Svenska kronor' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'NOK', symbol: 'kr', name: 'Norska kronor' },
  { code: 'DKK', symbol: 'kr', name: 'Danska kronor' },
  { code: 'GBP', symbol: '£', name: 'Brittiska pund' },
]

export function useCurrency() {
  const [currency, setCurrencyState] = useState(() => {
    const stored = localStorage.getItem('budget_currency')
    return stored || 'EUR'
  })

  function setCurrency(code) {
    setCurrencyState(code)
    localStorage.setItem('budget_currency', code)
  }

  const info = CURRENCIES.find(c => c.code === currency) || CURRENCIES[1]

  return { currency: info.code, symbol: info.symbol, setCurrency, currencies: CURRENCIES }
}
