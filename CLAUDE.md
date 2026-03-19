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
VITE_ANTHROPIC_API_KEY=...   # Valfritt — för AI-kommentarer i veckorapporter
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
    useBalance.js           # Startsaldo, balance_events, sparande-tracking
    useWeeklyReport.js      # Veckorapporter med AI-kommentarer
    useCurrency.js          # Valutasymbol
  components/
    auth/              # AuthPage, Onboarding, JoinPage
    dashboard/         # Dashboard (huvudvy med alla widgets)
    expenses/          # AddExpense (logga utgift/inkomst)
    personal/          # Personal (personlig budget + sparmål + saldo + sparande)
    quests/            # Quests (sparande-milstolpar)
    achievements/      # Achievements
    history/           # History (period-översikt med hushåll/mitt-toggle)
    settings/          # Settings (budget, månadsbudget, hushåll, startsaldo, sparande)
    shared/            # Header, BottomNav, Mascot, ProgressRing, ProgressBar, ErrorBoundary
testutils/
  setup.js             # Vitest setup (jsdom, Testing Library matchers)
vitest.config.js       # Vitest-konfiguration
eslint.config.js       # ESLint flat config
.github/workflows/ci.yml  # CI: lint + test + build
```

## Databasschema (Supabase)

Se `SPEC.md` för fullständigt schema med kolumner, index, FK och RLS-policies.

**Tabeller (13 st):**
- `households` — hushåll med invite_code, admin_id, max_members
- `profiles` — användarprofiler (+ starting_balance, starting_balance_date, savings_tracking_start)
- `expenses` — utgifter (shared/personal), med `amount` (NOT NULL) och `paid_amount` (NOT NULL, default 0)
- `income` — inkomster per månad
- `budgets` — budgetkategorier (JSONB), updated_at (auto-trigger)
- `gamification` — XP, streaks, achievements, daily_xp_awarded, last_xp_date
- `savings_goals` — personliga sparmål (name, target_amount, current_amount, deadline)
- `weekly_challenges` — veckoutmaningar per användare (challenges JSONB, week_start)
- `debt_payments` — betalningar mellan hushållsmedlemmar (from_user_id, to_user_id, amount, note)
- `monthly_budgets` — månadsbudget per kategori (household_id, month, category, budget_amount)
- `budget_defaults` — standardbudget per hushåll (household_id, defaults JSONB)
- `balance_events` — saldo-händelser per användare (initial/adjustment/correction, amount, note)
- `weekly_reports` — veckorapporter per hushåll (data JSONB, ai_comment)

**RPC-funktioner (13 st):** `add_xp`, `update_streak`, `join_household`, `lookup_household_by_invite`, `register_debt_payment`, `update_debt_payment`, `calculate_debt`, `get_budget_status`, `get_my_household_id`, `get_my_balance`, `generate_weekly_report`, `update_updated_at`, `verify_debt_calculation`

## Viktiga mönster och regler

### Startsaldo och balance_events — source of truth

Startsaldo representerar det **faktiska kontosaldot** vid en given tidpunkt. `balance_events`-tabellen är source of truth. `profiles.starting_balance` och `starting_balance_date` är **cache** som uppdateras av hooken.

**balance_events typer:**
- `initial` — första startsaldot ("jag har 3053€ just nu")
- `adjustment` — manuell justering (+200€ "fick tillbaka från kompis", -150€ "betalade utanför appen")
- `correction` — korrigering till ett specifikt belopp (beräknar diff automatiskt)

**Saldo-formel (get_my_balance RPC):**
```
starting_balance = SUM(balance_events.amount)
current_balance = starting_balance + income_since - expenses_since
```

**KRITISKT — dubbelräkningsregel:**
- Startsaldot ÄR det faktiska kontosaldot — befintlig inkomst/utgifter är redan inbakade
- `income_since`: bara månader **strikt efter** saldo-månaden (`month > to_char(sb_date, 'YYYY-MM')`)
- `expenses_since`: bara utgifter **loggade efter** saldot sattes (`created_at > sb_date`)
- Använd ALDRIG `>=` — det dubbelräknar befintlig aktivitet

**useBalance hook:**
- `addEvent(type, amount, note)` — skapa ny balance_event
- `deleteEvent(id)` — radera en event (ångra)
- `setStartingBalance(amount)` — skapar `initial` (första gången) eller `correction` (justerar till belopp)
- `resetBalance()` — raderar alla events + profiles-cache
- Realtime-subscriptions på `expenses`, `income`, `balance_events`

### Sparande-tracking

Sparande mäter hur mycket plus/minus användaren gått sedan en viss tidpunkt.

- `profiles.savings_tracking_start` — när sparräknaren startades (null = fallback till starting_balance_date)
- `savings_amount = savings_period_income - savings_period_expenses` (positivt = sparat)
- `savings_balance_at_start` — beräknat saldo vid tracking-startdatumet
- Nollställning: sätter `savings_tracking_start = now()`, sparande börjar om från 0

**useBalance hook (sparande):**
- `resetSavings()` — sätter savings_tracking_start = now()
- `setSavingsDate(dateStr)` — manuellt datum
- Returnerar: `savingsAmount`, `savingsBalanceAtStart`, `savingsTrackingStart`, `savingsPeriodIncome`, `savingsPeriodExpenses`

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

### Veckorapporter

`generate_weekly_report(target_week_start)` RPC beräknar veckodata. `useWeeklyReport` hook hanterar navigation och AI-kommentarer via Anthropic API (direct browser access). Dashboard visar veckorapport-kort med navigation.

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

### Dashboard-layout

Layout uppifrån och ner:
1. **Level & XP** — ProgressRing, level-namn, XP-bar
2. **Streak** — nuvarande streak, bästa streak
3. **Ekonom-analys** — månadsbetyg (S/A/B/C/D), inkomst vs utgifter, sparkvot
4. **Veckorapport** — navigerbar (← →), totalt spenderat, jämförelse, per-medlem, AI-kommentar
5. **Budget burn rate** — totalt kvar, daglig budget, total progress bar, varningar, per-kategori bars
6. **Pengapusslet** (om >1 medlem) — skuld-kort, betalningshistorik, gemensamma utgifter
7. **Leaderboard** — alla medlemmar rankade efter XP

### Personal-vy ("Mitt")

Layout uppifrån och ner:
1. **Saldo-kort** — kontosaldo (stort, grönt/rött), startsaldo-info, inkomst/utgifter, varning vid negativt, inline SVG-graf med prognoslinje, uppdelning gemensamt/personligt
2. **Sparande-kort** — sparat belopp (↑ grönt / ↓ rött), period, inkomst−utgifter=sparande, nollställ-knapp
3. **Graf-markering** — gul streckad linje vid savings_tracking_start ("Sparstart")
4. **Setup** (om inget saldo) — formulär för att sätta startsaldo

### RLS (Row Level Security)

Alla 13 tabeller har RLS aktiverat (38 policies totalt). Hjälpfunktionen `get_my_household_id()` returnerar inloggad användares household_id.

- **households**: SELECT för eget hushåll + admin, INSERT/UPDATE bara admin (multi-admin via profiles.role)
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
- **balance_events**: SELECT/INSERT/DELETE scoped till user_id = auth.uid()
- **weekly_reports**: SELECT/UPDATE scoped till household_id = get_my_household_id()

### Budgets-policies

Bara `admin`-rollen kan INSERT/UPDATE budgets (kategori-definitionen). Månadsbudget (`monthly_budgets`) och budget-defaults (`budget_defaults`) kan hanteras av alla hushållsmedlemmar. Debt payments registreras via `register_debt_payment` RPC (kringgår RLS korrekt). Multi-admin stöds — flera användare kan ha `profiles.role = 'admin'`.

## Testsvit

9 testfiler, 62 tester totalt:
- `JoinPage.test.jsx` — invite-flöde (3 tester)
- `AddExpense.test.jsx` — utgiftsloggning (5 tester)
- `useGamification.test.js` — XP, streaks, achievements (5 tester)
- `useSavingsGoals.test.js` — sparmål CRUD (3 tester)
- `useWeeklyChallenges.test.js` — challenge-logik (4 tester)
- `useDebtCalculation.test.js` — skuldsaldo-beräkning (7 tester)
- `useBudgetStatus.test.js` — budget-logik (7 tester)
- `useBalance.test.js` — saldo, balance_events, sparande (18 tester)
- `useWeeklyReport.test.js` — veckorapport-beräkningar (10 tester)

## Kända fallgropar

- **Supabase Web Locks (AbortError)**: DB-anrop kan misslyckas tyst. Lösning: `setTimeout(0)` i `onAuthStateChange`, och `getSession()` istället för user från context för uid.
- **Profil-sparning**: Spara profilen i ETT anrop i sista onboarding-steget, inte inkrementellt.
- **Weekly challenges race condition**: `loadOrCreateWeek` hanterar `23505` (unique violation) — om två tabbar skapar samtidigt vinner en och den andra hämtar den existerande.
- **AuthContext retry-logik**: `fetchProfile` har retry (3 försök med backoff). Skiljer på PGRST116 (genuint ny användare, ingen retry) och nätverksfel (retry). Sätter bara `loading=false` vid sista försöket eller framgång.
- **calculate_debt teckenbugg (fixad)**: `payment_adjustment` var inverterad (`received - sent`). Fixad till `sent - received`. Regressionstest i `useDebtCalculation.test.js`.
- **get_my_balance STABLE-bugg (fixad)**: RPC:n var markerad `STABLE` men gjorde en `UPDATE` — PostgreSQL tillåter inte skrivningar i STABLE-funktioner. Fixad genom att ta bort STABLE och flytta cache-logik till hooken.
- **Tester och produktionsdata**: Tester/verifieringar ska **ALDRIG** ändra produktionsdata. Använd enbart SELECT-queries för verifiering. Unit-tester mockar Supabase-anrop.

## Deploy

```bash
git add .
git commit -m "beskrivning"
git push
```

CI (GitHub Actions) kör lint → test → build på push/PR. Vercel bygger automatiskt vid push till main. Live på: budgetquest-gules.vercel.app
