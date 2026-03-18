# Budget Quest

Gamifierad budgetapp för hushåll. Kommunicera på **svenska** med användaren.

## Vision

Budget Quest ska bli en generell multi-household budgetapp. Vem som helst ska kunna skapa ett konto, starta eller gå med i ett hushåll, och börja tracka sin ekonomi. Appen gamifierar sparande med XP, levels, streaks, achievements, weekly challenges och månadsbetyg.

## Tech stack

- **Frontend**: React 18 + Vite (SPA, inga SSR)
- **Backend/DB**: Supabase (PostgreSQL + Auth + Realtime)
- **Routing**: React Router v6 (client-side)
- **Error tracking**: Sentry (`@sentry/react`)
- **Testing**: Vitest + React Testing Library + jsdom
- **Linting**: ESLint 9 (flat config) med `eslint-plugin-react-hooks`
- **CI/CD**: GitHub Actions (lint → test → build) + Vercel auto-deploy
- **Deploy**: Vercel (auto-deploy via `git push` till GitHub)
- **Styling**: Inline styles (ingen CSS-framework)

## Köra lokalt

```bash
npm install
npm run dev        # Startar dev-server på localhost:5173
npm run build      # Bygger till dist/
npm run test       # Kör tester i watch-mode (Vitest)
npm run test:run   # Kör tester en gång
npm run lint       # Kör ESLint på src/
```

Miljövariabler i `.env` (ALDRIG committa denna):
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_SENTRY_DSN=...          # Valfritt — lämna tomt för att stänga av Sentry
```

## Projektstruktur

```
src/
  App.jsx              # Routing, auth-gating, mascot, tab-navigation
  main.jsx             # Entry point (importerar sentry först)
  lib/
    supabase.js        # Supabase client (env vars)
    sentry.js          # Sentry init (conditional på VITE_SENTRY_DSN)
    constants.js       # Levels, achievements, weekly challenges, kategorier, grades, helpers
  context/
    AuthContext.jsx     # user, profile, household via Supabase Auth
    ToastContext.jsx    # Toast-notifikationer
  hooks/
    useExpenses.js          # useExpenses(month), useBudget(), useIncome(month)
    useGamification.js      # XP (via RPC), streaks (via RPC), achievements
    useWeeklyChallenges.js  # Veckoutmaningar (3 slumpmässiga per vecka)
    useSavingsGoals.js      # Personliga sparmål (DB-backed, migrerar från localStorage)
    useCurrency.js          # Valutasymbol
  components/
    auth/              # AuthPage, Onboarding, JoinPage
    dashboard/         # Dashboard (huvudvy med alla widgets)
    expenses/          # AddExpense (logga utgift/inkomst)
    personal/          # Personal (personlig budget + sparmål)
    quests/            # Quests (sparande-milstolpar)
    achievements/      # Achievements
    history/           # History
    settings/          # Settings (budget, månad, hushåll)
    shared/            # Header, BottomNav, Mascot, ProgressRing, ProgressBar, ErrorBoundary
testutils/
  setup.js             # Vitest setup (jsdom, Testing Library matchers)
vitest.config.js       # Vitest-konfiguration
eslint.config.js       # ESLint flat config
.github/workflows/ci.yml  # CI: lint + test + build
```

## Databasschema (Supabase)

Se `SPEC.md` för fullständigt schema med kolumner, index, FK och RLS-policies.

**Tabeller (8 st):**
- `households` — hushåll med invite_code, admin_id, max_members
- `profiles` — användarprofiler, kopplade till household
- `expenses` — utgifter (shared/personal), med `amount` (NOT NULL) och `paid_amount` (NOT NULL, default 0)
- `income` — inkomster per månad
- `budgets` — budgetkategorier (JSONB), debt_payments (JSONB), updated_at (auto-trigger)
- `gamification` — XP, streaks, achievements, daily_xp_awarded, last_xp_date
- `savings_goals` — personliga sparmål (name, target_amount, current_amount, deadline)
- `weekly_challenges` — veckoutmaningar per användare (challenges JSONB, week_start)

**RPC-funktioner (6 st):** `add_xp`, `update_streak`, `join_household`, `lookup_household_by_invite`, `register_debt_payment`, `get_my_household_id`

## Viktiga mönster och regler

### XP och streaks — ALLTID via RPC

XP och streaks ska **alltid** uppdateras via RPC:erna `add_xp` och `update_streak`. Gör **aldrig** read-modify-write från klienten — det skapar race conditions.

- `add_xp(amount)` — atomisk, hanterar daglig cap (200 XP/dag), returnerar nya totala XP (eller 0 om cap nådd)
- `update_streak()` — server-side beräkning, returnerar `{streak_days, streak_best, is_new_best}`

### amount vs paid_amount (utgifter)

`expenses.description` (NOT NULL, default '') och `expenses.paid_amount` (NOT NULL, default 0) — dessa är **inte** nullable.

Vid gemensamma utgifter finns två lägen:
- **"Jag betalade allt"** (splitMode=full): `amount = totalt`, `paid_amount = totalt`
- **"Redan min del"** (splitMode=mine): `amount = parsed * memberCount` (inflated), `paid_amount = parsed`

`amount` används för budgetberäkningar (varje persons del = amount/memberCount).
`paid_amount` används för pengapusslet (skuldsaldo mellan medlemmar).

### Pengapusslet (skuldsaldo)

Beräknar vem som lagt ut mer/mindre av gemensamma utgifter:
- `fairShare = sharedTotal / memberCount` (baserat på totalkostnad, INTE summan av betalningar)
- `balance = paid + swish-justeringar - fairShare`
- Positiv balance = har lagt ut mer (andra är skyldiga dig)
- Swish-betalningar registreras via RPC `register_debt_payment` (validerar att from/to tillhör samma hushåll)

### Nya FK:s — använd ON DELETE CASCADE

Alla nya foreign keys som pekar på `auth.users` eller `households` ska ha `ON DELETE CASCADE`.

### Månadsfiltrering

Utgifter hämtas per månad via `useExpenses(selectedMonth)`. Format: `"YYYY-MM"`.

### Auth-flöde

1. AuthPage (login/signup)
2. Onboarding (profil skapas i ETT insert i sista steget)
3. Join via invite-länk (`/join/:code`) eller `?invite=CODE` — använder `join_household` RPC (atomisk, race-safe)

### RLS (Row Level Security)

Alla 8 tabeller har RLS aktiverat. Hjälpfunktionen `get_my_household_id()` returnerar inloggad användares household_id.

- **households**: SELECT för eget hushåll + admin, INSERT/UPDATE bara admin
- **profiles**: SELECT för eget hushåll, INSERT/UPDATE bara egen profil
- **expenses**: SELECT hela hushållet, INSERT bara egen user_id, DELETE egen + admin, UPDATE egen + shared i hushållet
- **income**: Allt scoped till egen user_id + household_id
- **budgets**: SELECT hela hushållet, INSERT/UPDATE bara admin
- **gamification**: SELECT hela hushållet, INSERT/UPDATE bara egen user_id
- **savings_goals**: ALL scoped till user_id = auth.uid()
- **weekly_challenges**: ALL scoped till user_id = auth.uid()

**OBS:** `households_select_by_invite`-policyn finns inte längre — invite-lookup görs via `lookup_household_by_invite` RPC istället.

### Budgets-policies

Bara `admin`-rollen kan INSERT/UPDATE budgets. Debt payments registreras via `register_debt_payment` RPC (kringgår RLS korrekt).

## Kända fallgropar

- **Supabase Web Locks (AbortError)**: DB-anrop kan misslyckas tyst. Lösning: `setTimeout(0)` i `onAuthStateChange`, och `getSession()` istället för user från context för uid.
- **Profil-sparning**: Spara profilen i ETT anrop i sista onboarding-steget, inte inkrementellt.
- **Weekly challenges race condition**: `loadOrCreateWeek` hanterar `23505` (unique violation) — om två tabbar skapar samtidigt vinner en och den andra hämtar den existerande.

## Deploy

```bash
git add .
git commit -m "beskrivning"
git push
```

CI (GitHub Actions) kör lint → test → build på push/PR. Vercel bygger automatiskt vid push till main. Live på: budgetquest-gules.vercel.app
