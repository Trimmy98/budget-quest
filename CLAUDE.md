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
    AuthContext.jsx     # user, profile, household via Supabase Auth (retry-logik vid nätverksfel)
    ToastContext.jsx    # Toast-notifikationer
  hooks/
    useExpenses.js          # useExpenses(month), useBudget(), useIncome(month)
    useGamification.js      # XP (via RPC), streaks (via RPC), achievements
    useWeeklyChallenges.js  # Veckoutmaningar (3 slumpmässiga per vecka)
    useSavingsGoals.js      # Personliga sparmål (DB-backed, migrerar från localStorage)
    useBudgetStatus.js      # useBudgetStatus(month) + useMonthlyBudgets(month) — månadsbudget
    useCurrency.js          # Valutasymbol
  components/
    auth/              # AuthPage, Onboarding, JoinPage
    dashboard/         # Dashboard (huvudvy med alla widgets)
    expenses/          # AddExpense (logga utgift/inkomst)
    personal/          # Personal (personlig budget + sparmål)
    quests/            # Quests (sparande-milstolpar)
    achievements/      # Achievements
    history/           # History (period-översikt med hushåll/mitt-toggle)
    settings/          # Settings (budget, månadsbudget, hushåll)
    shared/            # Header, BottomNav, Mascot, ProgressRing, ProgressBar, ErrorBoundary
testutils/
  setup.js             # Vitest setup (jsdom, Testing Library matchers)
vitest.config.js       # Vitest-konfiguration
eslint.config.js       # ESLint flat config
.github/workflows/ci.yml  # CI: lint + test + build
```

## Databasschema (Supabase)

Se `SPEC.md` för fullständigt schema med kolumner, index, FK och RLS-policies.

**Tabeller (11 st):**
- `households` — hushåll med invite_code, admin_id, max_members
- `profiles` — användarprofiler, kopplade till household
- `expenses` — utgifter (shared/personal), med `amount` (NOT NULL) och `paid_amount` (NOT NULL, default 0)
- `income` — inkomster per månad
- `budgets` — budgetkategorier (JSONB), updated_at (auto-trigger)
- `gamification` — XP, streaks, achievements, daily_xp_awarded, last_xp_date
- `savings_goals` — personliga sparmål (name, target_amount, current_amount, deadline)
- `weekly_challenges` — veckoutmaningar per användare (challenges JSONB, week_start)
- `debt_payments` — betalningar mellan hushållsmedlemmar (from_user_id, to_user_id, amount, note)
- `monthly_budgets` — månadsbudget per kategori (household_id, month, category, budget_amount)
- `budget_defaults` — standardbudget per hushåll (household_id, defaults JSONB)

**RPC-funktioner (9 st):** `add_xp`, `update_streak`, `join_household`, `lookup_household_by_invite`, `register_debt_payment`, `update_debt_payment`, `calculate_debt`, `get_budget_status`, `get_my_household_id`

**Verifieringsfunktioner (1 st):** `verify_debt_calculation` — health check som jämför manuell beräkning med `calculate_debt()` RPC

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

### Pengapusslet (skuldsaldo) — ALLTID via `calculate_debt` RPC

Skuldsaldo beräknas **helt server-side** via `calculate_debt()` RPC. Gör **aldrig** klient-side beräkningar av skuld.

- `calculate_debt()` returnerar: `{ household_id, member_count, grand_total, fair_share_per_person, members: [...], payments: [...] }`
- Varje medlem har: `my_shared_total`, `fair_share`, `expense_balance`, `payment_adjustment`, `net_balance`
- `expense_balance = my_shared_total - grand_total / member_count`
- `payment_adjustment = sent - received` (positiv = du har betalat mer än du fått)
- `net_balance = expense_balance + payment_adjustment` (positiv = andra skuldar dig)
- Betalningar registreras via `register_debt_payment` RPC (skriver till `debt_payments`-tabellen)
- Betalningar redigeras via `update_debt_payment` RPC (validerar att from_user_id = auth.uid())
- Dashboard har Realtime-subscriptions på `expenses` och `debt_payments` som triggar `fetchDebtData()`

**UI-struktur i Dashboard — Pengapusslet (3 kort):**
1. **Skuld-kort** med detaljerad uppdelning (expense_balance, payment_adjustment, net_balance) + inline betalningsformulär
2. **Betalningshistorik** med inline edit (amount + note) och delete med bekräftelse
3. **Gemensamma utgifter** (all-time lista, expanderbar)

### Månadsbudget — via `get_budget_status` RPC + `monthly_budgets`-tabell

Månadsbudget sätts per kategori i `monthly_budgets`-tabellen. `budget_defaults` lagrar standardvärden som auto-kopieras till nya månader.

- `get_budget_status(target_month)` — server-side beräkning av budget vs faktiskt, returnerar per-kategori status
- **Status-logik**: `on_track` (≤75%), `warning` (>75%), `over_budget` (>100%)
- **daily_allowance**: `remaining / days_left` (0 om över budget eller månad avslutad)
- Hushåll-perspektiv: `household_spent` = SUM(amount) per kategori
- Mitt-perspektiv: `my_spent` = SUM(shared / memberCount) + SUM(personal om user_id = auth.uid())

**Hooks:**
- `useBudgetStatus(month)` — anropar RPC, prenumererar på Realtime (expenses + monthly_budgets)
- `useMonthlyBudgets(month)` — CRUD för monthly_budgets + budget_defaults, med `saveBudgets`, `saveDefaults`, `copyFromDefaults`, `copyFromPrevMonth`

**UI-placering:**
- **Dashboard**: Budget burn rate-sektion placerad OVANFÖR pengapusslet. Visar: totalt kvar, daglig budget, total progress bar, varningar per kategori, per-kategori kompakt lista med progress bars.
- **Settings**: Månadsbudget-sektion med kategoriinmatning, "Kopiera förra månaden", "Applicera defaults", "Spara budget", "Spara som default". Read-only vy när budget redan satt.
- **History**: Budget vs faktiskt-bars i "Topp kategorier" med per-kategori progress bars. I "Mitt"-vy delas budgeten per antal medlemmar.
- **AddExpense**: Flash-varning (3 sekunder) efter loggning när kategori >75% av budget. Separat från inline-varningen som visas medan man väljer kategori.

### Nya FK:s — använd ON DELETE CASCADE

Alla nya foreign keys som pekar på `auth.users` eller `households` ska ha `ON DELETE CASCADE`.

### Månadsfiltrering

Utgifter hämtas per månad via `useExpenses(selectedMonth)`. Format: `"YYYY-MM"`.

### Auth-flöde

1. AuthPage (login/signup)
2. Onboarding (profil skapas i ETT insert i sista steget)
3. Join via invite-länk (`/join/:code`) eller `?invite=CODE` — använder `join_household` RPC (atomisk, race-safe)

### History-vy (period-översikt)

History har tre tabbar: **Utgifter**, **Statistik**, **Badges**.

**Perspektiv-toggle: Hushåll / Mitt** (högst upp i Utgifter-tabben)
- **Hushåll**: Visar alla utgifter med fulla belopp (`amount`). Proportionell bar per medlem. Gemensamt vs personligt summerat.
- **Mitt**: Visar bara din kostnad. Delade utgifter visas som `amount / memberCount`. Andras personliga utgifter filtreras bort. Tre summerings-boxar: "Din del av gemensamt", "Personligt", "Totalt". Proportionell bar gemensam del vs personligt.

Utgifter-tabben har:
- **Periodlägen**: dag/vecka/månad med offset-navigation (← →)
- **Gruppering**: dag-vy visar enskilda utgifter, vecka grupperar per dag, månad grupperar per vecka
- **Jämförelse med förra perioden**: procentuell och absolut ändring, största kategoriförändringar
- **Filter**: kategori + person-dropdown med aktiva filter-pills
- **Budget vs faktiskt**: Per-kategori progress bars i "Topp kategorier" (data från `useBudgetStatus`)

### RLS (Row Level Security)

Alla 11 tabeller har RLS aktiverat. Hjälpfunktionen `get_my_household_id()` returnerar inloggad användares household_id.

- **households**: SELECT för eget hushåll + admin, INSERT/UPDATE bara admin
- **profiles**: SELECT för eget hushåll, INSERT/UPDATE bara egen profil
- **expenses**: SELECT hela hushållet, INSERT bara egen user_id, DELETE egen + admin, UPDATE egen + shared i hushållet
- **income**: Allt scoped till egen user_id + household_id
- **budgets**: SELECT hela hushållet, INSERT/UPDATE bara admin
- **gamification**: SELECT hela hushållet, INSERT/UPDATE bara egen user_id
- **savings_goals**: ALL scoped till user_id = auth.uid()
- **weekly_challenges**: ALL scoped till user_id = auth.uid()
- **debt_payments**: SELECT hela hushållet, INSERT om from/to = auth.uid(), DELETE bara from_user_id = auth.uid()
- **monthly_budgets**: SELECT/INSERT/UPDATE/DELETE scoped till household_id = get_my_household_id()
- **budget_defaults**: SELECT/INSERT/UPDATE/DELETE scoped till household_id = get_my_household_id()

**OBS:** `households_select_by_invite`-policyn finns inte längre — invite-lookup görs via `lookup_household_by_invite` RPC istället.

### Budgets-policies

Bara `admin`-rollen kan INSERT/UPDATE budgets (kategori-definitionen). Månadsbudget (`monthly_budgets`) och budget-defaults (`budget_defaults`) kan hanteras av alla hushållsmedlemmar. Debt payments registreras via `register_debt_payment` RPC (kringgår RLS korrekt).

## Testsvit

7 testfiler, 34 tester totalt:
- `JoinPage.test.jsx` — invite-flöde
- `AddExpense.test.jsx` — utgiftsloggning
- `useGamification.test.js` — XP, streaks, achievements
- `useSavingsGoals.test.js` — sparmål CRUD
- `useWeeklyChallenges.test.js` — challenge-logik
- `useDebtCalculation.test.js` — skuldsaldo-beräkning (7 tester), regressionstest för teckenbugg i `payment_adjustment`
- `useBudgetStatus.test.js` — budget-logik (7 tester): spent per kategori, warning/over_budget status, daily_allowance, defaults-kopiering, Dashboard-färgkodning

## Kända fallgropar

- **Supabase Web Locks (AbortError)**: DB-anrop kan misslyckas tyst. Lösning: `setTimeout(0)` i `onAuthStateChange`, och `getSession()` istället för user från context för uid.
- **Profil-sparning**: Spara profilen i ETT anrop i sista onboarding-steget, inte inkrementellt.
- **Weekly challenges race condition**: `loadOrCreateWeek` hanterar `23505` (unique violation) — om två tabbar skapar samtidigt vinner en och den andra hämtar den existerande.
- **AuthContext retry-logik**: `fetchProfile` har retry (3 försök med backoff). Skiljer på PGRST116 (genuint ny användare, ingen retry) och nätverksfel (retry). Sätter bara `loading=false` vid sista försöket eller framgång.
- **calculate_debt teckenbugg (fixad)**: `payment_adjustment` var inverterad (`received - sent`). Fixad till `sent - received`. Regressionstest i `useDebtCalculation.test.js`.

## Deploy

```bash
git add .
git commit -m "beskrivning"
git push
```

CI (GitHub Actions) kör lint → test → build på push/PR. Vercel bygger automatiskt vid push till main. Live på: budgetquest-gules.vercel.app
