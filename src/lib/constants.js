export const LEVELS = [
  { level: 1, title: 'Budget Noob', xpRequired: 0 },
  { level: 2, title: 'Penny Pincher', xpRequired: 300 },
  { level: 3, title: 'Coin Counter', xpRequired: 600 },
  { level: 4, title: 'Smart Spender', xpRequired: 900 },
  { level: 5, title: 'Budget Warrior', xpRequired: 1200 },
  { level: 6, title: 'Savings Samurai', xpRequired: 1500 },
  { level: 7, title: 'Finance Fighter', xpRequired: 1800 },
  { level: 8, title: 'Money Master', xpRequired: 2100 },
  { level: 9, title: 'Wealth Wizard', xpRequired: 2400 },
  { level: 10, title: 'Economy Emperor', xpRequired: 2700 },
  { level: 11, title: 'Legendary Saver', xpRequired: 3000 },
  { level: 12, title: 'Budget God', xpRequired: 3300 },
]

export const WEEKLY_CHALLENGES = [
  { id: 1, title: 'Kaffedetox', description: 'Logga 0 kr på fika 3 dagar i rad', xp: 100 },
  { id: 2, title: 'Matlagningshjälte', description: 'Håll äta-ute under 20€ hela veckan', xp: 150 },
  { id: 3, title: 'Streakjägare', description: 'Logga utgifter 7 dagar i rad', xp: 200 },
  { id: 4, title: 'Budgetmästare', description: 'Håll dig inom budget i alla kategorier', xp: 175 },
  { id: 5, title: 'Sparexperten', description: 'Spara minst 20% av inkomsten den här veckan', xp: 125 },
  { id: 6, title: 'Detaljisten', description: 'Logga 10+ utgifter med beskrivning', xp: 100 },
  { id: 7, title: 'Nolldagen', description: 'Ha en dag utan utgifter', xp: 75 },
  { id: 8, title: 'Teamspelaren', description: 'Alla i hushållet loggar minst 1 utgift', xp: 150 },
]

export const ACHIEVEMENTS = [
  { id: 'first_step', icon: '🌟', title: 'First Step', description: 'Logga din första utgift', xp: 50 },
  { id: 'on_fire', icon: '🔥', title: 'Igång!', description: 'Håll en 3-dagars streak', xp: 75 },
  { id: 'week_warrior', icon: '⚔️', title: 'Week Warrior', description: 'Håll en 7-dagars streak', xp: 150 },
  { id: 'fortnight_force', icon: '🏰', title: 'Fortnight Force', description: 'Håll en 14-dagars streak', xp: 300 },
  { id: 'monthly_master', icon: '👑', title: 'Monthly Master', description: 'Håll en 30-dagars streak', xp: 500 },
  { id: 'data_nerd', icon: '📊', title: 'Data Nerd', description: 'Logga 50 utgifter totalt', xp: 200 },
  { id: 'logging_machine', icon: '🤖', title: 'Logging Machine', description: 'Logga 100 utgifter totalt', xp: 400 },
  { id: 's_rank', icon: '💎', title: 'S-Rank!', description: 'Få betyg S en månad', xp: 300 },
  { id: 'a_rank', icon: '⭐', title: 'A-Rank!', description: 'Få betyg A en månad', xp: 150 },
  { id: 'quest_clear', icon: '🗺️', title: 'Quest Clear', description: 'Nå första sparande-milstolpen', xp: 250 },
  { id: 'challenger', icon: '🏅', title: 'Challenger', description: 'Slutför 5 veckoutmaningar', xp: 350 },
  { id: 'k_club', icon: '💰', title: '1K Club', description: 'Spara 1000€ totalt', xp: 500 },
]

export const DEFAULT_SHARED_CATEGORIES = [
  { id: 'housing', icon: '🏠', name: 'Boende', budget: 1200 },
  { id: 'groceries', icon: '🛒', name: 'Mat & Hushåll', budget: 700 },
  { id: 'dining', icon: '🍕', name: 'Äta ute', budget: 200 },
  { id: 'transport', icon: '🚌', name: 'Transport', budget: 150 },
  { id: 'health', icon: '💪', name: 'Hälsa & Träning', budget: 200 },
  { id: 'entertainment', icon: '🎮', name: 'Nöje & Streaming', budget: 150 },
  { id: 'utilities', icon: '⚡', name: 'El & Internet', budget: 120 },
]

export const DEFAULT_PERSONAL_CATEGORIES = [
  { id: 'coffee', icon: '☕', name: 'Fika & Lunch', budget: 60 },
  { id: 'clothing', icon: '👕', name: 'Kläder', budget: 60 },
  { id: 'personal_care', icon: '✨', name: 'Personlig vård', budget: 30 },
  { id: 'hobby', icon: '🎯', name: 'Hobby', budget: 50 },
  { id: 'misc', icon: '📦', name: 'Övrigt', budget: 50 },
]

export const QUEST_MILESTONES = [
  { icon: '🛡️', title: 'Nödfond Lv.1', amount: 1000 },
  { icon: '🛡️', title: 'Nödfond Lv.2', amount: 3000 },
  { icon: '✈️', title: 'Semester', amount: 5000 },
  { icon: '🏰', title: 'Nödfond MAX', amount: 8000 },
  { icon: '👑', title: 'Frihet', amount: 15000 },
]

export function getLevelInfo(xp) {
  let currentLevel = LEVELS[0]
  let nextLevel = LEVELS[1]
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (xp >= LEVELS[i].xpRequired) {
      currentLevel = LEVELS[i]
      nextLevel = LEVELS[i + 1] || null
      break
    }
  }
  const xpInLevel = xp - currentLevel.xpRequired
  const xpNeeded = nextLevel ? nextLevel.xpRequired - currentLevel.xpRequired : 300
  const progress = Math.min(xpInLevel / xpNeeded, 1)
  return { ...currentLevel, nextLevel, xpInLevel, xpNeeded, progress }
}

export function getMonthGrade(savingsRate) {
  if (savingsRate >= 0.3) return { grade: 'S', color: '#ffd93d' }
  if (savingsRate >= 0.2) return { grade: 'A', color: '#00ff87' }
  if (savingsRate >= 0.1) return { grade: 'B', color: '#00f0ff' }
  if (savingsRate >= 0) return { grade: 'C', color: '#ff79c6' }
  return { grade: 'D', color: '#ff6b6b' }
}

export function getCurrentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}
