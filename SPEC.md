# Budget Quest — Arkitektur & Specifikation

## Databasschema

### households

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| name | text | NOT NULL | — |
| invite_code | text | NOT NULL | substring(gen_random_uuid(), 1, 8) |
| admin_id | uuid | NOT NULL | — |
| max_members | integer | NOT NULL | 4 |
| created_at | timestamptz | NULL | now() |

**Index:** PK `id`, UNIQUE `invite_code`
**FK:** `admin_id → auth.users(id)`

---

### profiles

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | — |
| household_id | uuid | NULL | — |
| display_name | text | NOT NULL | — |
| role | text | NULL | 'member' |
| onboarding_complete | boolean | NULL | false |
| created_at | timestamptz | NULL | now() |

**Index:** PK `id`, INDEX `household_id`
**FK:** `id → auth.users(id) ON DELETE CASCADE`, `household_id → households(id)`

---

### expenses

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| user_id | uuid | NOT NULL | — |
| date | date | NOT NULL | CURRENT_DATE |
| amount | numeric | NOT NULL | — |
| description | text | NOT NULL | '' |
| category | text | NOT NULL | — |
| expense_type | text | NOT NULL | — |
| created_at | timestamptz | NULL | now() |
| paid_amount | numeric | NOT NULL | 0 |

**Index:** PK `id`, INDEX `(date, household_id)`, INDEX `user_id`
**FK:** `household_id → households(id)`, `user_id → auth.users(id) ON DELETE CASCADE`

---

### income

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| user_id | uuid | NOT NULL | — |
| month | text | NOT NULL | — |
| amount | numeric | NOT NULL | — |
| description | text | NULL | — |

**Index:** PK `id`, UNIQUE `(household_id, month, user_id)`, INDEX `(user_id, household_id, month)`
**FK:** `household_id → households(id)`, `user_id → auth.users(id) ON DELETE CASCADE`

---

### budgets

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| shared_categories | jsonb | NOT NULL | '[]' |
| personal_categories | jsonb | NOT NULL | '[]' |
| weekly_challenge | jsonb | NULL | — |
| debt_payments | jsonb | NULL | '[]' |
| updated_at | timestamptz | NULL | now() |

**Index:** PK `id`, UNIQUE `household_id`
**FK:** `household_id → households(id)`
**Trigger:** `update_updated_at` — sätter `updated_at = now()` vid varje UPDATE

---

### gamification

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| user_id | uuid | NOT NULL | — |
| household_id | uuid | NOT NULL | — |
| xp | integer | NOT NULL | 0 |
| streak_current | integer | NOT NULL | 0 |
| streak_best | integer | NOT NULL | 0 |
| streak_last_log | date | NULL | — |
| achievements | jsonb | NULL | '[]' |
| daily_xp_awarded | integer | NOT NULL | 0 |
| last_xp_date | date | NULL | — |

**Index:** PK `id`, UNIQUE `user_id`
**FK:** `user_id → auth.users(id) ON DELETE CASCADE`, `household_id → households(id)`

---

### savings_goals

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| user_id | uuid | NOT NULL | — |
| household_id | uuid | NOT NULL | — |
| name | text | NOT NULL | — |
| target_amount | numeric | NOT NULL | — |
| current_amount | numeric | NOT NULL | 0 |
| deadline | date | NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**Index:** PK `id`, INDEX `(household_id, user_id)`
**FK:** `user_id → auth.users(id) ON DELETE CASCADE`, `household_id → households(id) ON DELETE CASCADE`

---

### weekly_challenges

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| user_id | uuid | NOT NULL | — |
| household_id | uuid | NOT NULL | — |
| week_start | date | NOT NULL | — |
| challenges | jsonb | NOT NULL | '[]' |
| created_at | timestamptz | NOT NULL | now() |

**Index:** PK `id`, UNIQUE `(user_id, week_start)`, INDEX `(user_id, week_start)`
**FK:** `user_id → auth.users(id) ON DELETE CASCADE`, `household_id → households(id) ON DELETE CASCADE`

---

### debt_payments

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| from_user_id | uuid | NOT NULL | — |
| to_user_id | uuid | NOT NULL | — |
| amount | numeric | NOT NULL | — |
| note | text | NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**Check:** `amount > 0`
**Index:** PK `id`, INDEX `household_id`, INDEX `(household_id, created_at DESC)`
**FK:** `household_id → households(id) ON DELETE CASCADE`, `from_user_id → auth.users(id) ON DELETE CASCADE`, `to_user_id → auth.users(id) ON DELETE CASCADE`

---

### monthly_budgets

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| month | text | NOT NULL | — |
| category | text | NOT NULL | — |
| budget_amount | numeric | NOT NULL | — |
| created_by | uuid | NOT NULL | — |
| created_at | timestamptz | NOT NULL | now() |

**Check:** `budget_amount > 0`
**Unique:** `(household_id, month, category)`
**Index:** PK `id`
**FK:** `household_id → households(id) ON DELETE CASCADE`, `created_by → auth.users(id) ON DELETE CASCADE`

---

### budget_defaults

| Kolumn | Typ | Nullable | Default |
|--------|-----|----------|---------|
| id | uuid | NOT NULL | gen_random_uuid() |
| household_id | uuid | NOT NULL | — |
| defaults | jsonb | NOT NULL | '{}' |

**Unique:** `household_id`
**Index:** PK `id`
**FK:** `household_id → households(id) ON DELETE CASCADE`

`defaults` JSONB-format: `{ "groceries": 5000, "transport": 2000, ... }` — mappar kategori-id till belopp.

---

## RPC-funktioner

### add_xp(amount integer) → integer

Atomisk XP-tillägg med daglig cap (200 XP/dag).

- Nollställer `daily_xp_awarded` om `last_xp_date < CURRENT_DATE`
- Clampar `amount` till kvarvarande cap
- Returnerar nya totala XP, eller **0** om cap redan nådd
- Identifierar användaren via `auth.uid()`

### update_streak() → jsonb

Server-side streak-beräkning.

- Om redan loggat idag → returnerar current state utan ändring
- Om `streak_last_log = igår` → `streak_current + 1`
- Annars → streak resetas till 1
- Uppdaterar `streak_best` om nytt rekord
- Returnerar: `{ streak_days, streak_best, is_new_best }`

### join_household(invite text) → jsonb

Atomisk join med race-condition-skydd.

- Slår upp hushåll via `invite_code`
- Räknar medlemmar med `FOR UPDATE` (låser raden)
- Kollar `max_members`
- Skapar eller uppdaterar profil + gamification-rad
- Returnerar: `{ id, name, max_members }`
- Kastar exception vid ogiltigt invite, fullt hushåll, eller ej inloggad

### lookup_household_by_invite(invite_code_param text) → record

Slår upp hushåll utan att joina.

- Returnerar: `(id uuid, name text, max_members integer)`
- Ersätter den gamla `households_select_by_invite` RLS-policyn

### register_debt_payment(from_user_id uuid, to_user_id uuid, payment_amount numeric, payment_note text DEFAULT NULL) → uuid

Registrerar en betalning i pengapusslet. `SECURITY DEFINER`.

- Validerar att `from` och `to` tillhör samma hushåll som anroparen
- Validerar att `payment_amount > 0`
- Skriver till `debt_payments`-tabellen
- Returnerar nytt payment-UUID

### update_debt_payment(payment_id uuid, new_amount numeric, new_note text DEFAULT NULL) → void

Uppdaterar en befintlig betalning. `SECURITY DEFINER`.

- Validerar att `new_amount > 0`
- Uppdaterar bara om `from_user_id = auth.uid()` (avsändaren)
- Kastar exception om betalningen inte hittas eller anroparen inte är avsändaren

### calculate_debt() → jsonb

Beräknar skuldsaldo för hela hushållet. `STABLE SECURITY DEFINER`. Single source of truth.

- Hämtar alla `shared`-utgifter och `debt_payments` för hushållet
- Beräknar per medlem:
  - `my_shared_total` — totalt belopp av delade utgifter användaren loggat
  - `fair_share` — `grand_total / member_count`
  - `expense_balance` — `my_shared_total - fair_share` (positiv = betalat mer, negativ = betalat mindre)
  - `payment_adjustment` — `sent - received` (positiv = betalat mer skuld, negativ = fått mer betalningar)
  - `net_balance` — `expense_balance + payment_adjustment` (positiv = andra skuldar dig)
- Returnerar:
  ```json
  {
    "household_id": "uuid",
    "member_count": 2,
    "grand_total": 1234.50,
    "fair_share_per_person": 617.25,
    "members": [
      { "user_id": "uuid", "display_name": "...", "my_shared_total": 800, "fair_share": 617.25, "expense_balance": 182.75, "payment_adjustment": -50, "net_balance": 132.75 }
    ],
    "payments": [
      { "id": "uuid", "from_user_id": "uuid", "to_user_id": "uuid", "amount": 50, "note": "Swish", "created_at": "..." }
    ]
  }
  ```

### get_budget_status(target_month text) → jsonb

Beräknar budget vs faktiskt för en given månad. `STABLE SECURITY DEFINER`.

- Hämtar alla `monthly_budgets` och `expenses` för hushållet och given månad
- Beräknar per kategori:
  - `budget_amount` — satt budget
  - `household_spent` — SUM(amount) för alla utgifter i kategorin
  - `my_spent` — SUM(shared / memberCount) + SUM(personal om user_id = auth.uid())
  - `household_remaining` / `my_remaining`
  - `household_pct` / `my_pct` — procentuell förbrukning
  - `household_status` / `my_status` — `on_track` (≤75%), `warning` (>75%), `over_budget` (>100%)
  - `daily_allowance` / `my_daily_allowance` — remaining / days_left (0 om över budget eller månad avslutad)
- `days_left`: aktuell månad = kalender-dagar kvar, framtida = hela månaden, historisk = 0
- Returnerar:
  ```json
  {
    "month": "2026-03",
    "household_id": "uuid",
    "member_count": 2,
    "days_in_month": 31,
    "days_left": 14,
    "categories": [
      { "category": "groceries", "budget_amount": 5000, "household_spent": 3200, "my_spent": 1600, "household_remaining": 1800, "household_pct": 64.0, "household_status": "on_track", "daily_allowance": 128.57, ... }
    ],
    "totals": {
      "budget": 15000, "household_spent": 8500, "household_remaining": 6500, "household_pct": 56.7, "daily_allowance": 464.29, ...
    }
  }
  ```

### get_my_household_id() → uuid

Hjälpfunktion som returnerar `profiles.household_id` för `auth.uid()`. Används i RLS-policies.

### verify_debt_calculation() → jsonb

Health check som jämför manuell skuld-beräkning med `calculate_debt()` RPC.

- Kör helt separat logik (egen SQL) och jämför med RPC-resultatet per medlem
- Jämför: `net_balance`, `expense_balance`, `payment_adjustment`
- Returnerar: `{ ok: bool, household_id: uuid, diffs: [...], manual_check: [...] }`
- Om `ok = true`: alla siffror matchar

---

## RLS-policies

Alla 11 tabeller har RLS aktiverat (33 policies totalt).

| Tabell | Policy | Cmd | Villkor |
|--------|--------|-----|---------|
| households | households_select | SELECT | id = get_my_household_id() OR admin_id = auth.uid() |
| households | households_insert | INSERT | admin_id = auth.uid() |
| households | households_update | UPDATE | admin_id = auth.uid() |
| profiles | profiles_select | SELECT | id = auth.uid() OR household_id = get_my_household_id() |
| profiles | profiles_insert | INSERT | id = auth.uid() |
| profiles | profiles_update | UPDATE | id = auth.uid() |
| expenses | expenses_select | SELECT | household_id = get_my_household_id() |
| expenses | expenses_insert | INSERT | household_id = get_my_household_id() AND user_id = auth.uid() |
| expenses | expenses_update | UPDATE | user_id = auth.uid() OR (expense_type = 'shared' AND household_id = get_my_household_id()) |
| expenses | expenses_delete | DELETE | user_id = auth.uid() OR (household_id = get_my_household_id() AND role = 'admin') |
| income | income_select | SELECT | household_id = get_my_household_id() |
| income | income_insert | INSERT | household_id = get_my_household_id() AND user_id = auth.uid() |
| income | income_update | UPDATE | household_id = get_my_household_id() AND user_id = auth.uid() |
| income | income_delete | DELETE | household_id = get_my_household_id() AND user_id = auth.uid() |
| budgets | budgets_select | SELECT | household_id = get_my_household_id() |
| budgets | budgets_insert | INSERT | household_id = get_my_household_id() AND role = 'admin' |
| budgets | budgets_update | UPDATE | household_id = get_my_household_id() AND role = 'admin' |
| gamification | gamification_select | SELECT | household_id = get_my_household_id() |
| gamification | gamification_insert | INSERT | user_id = auth.uid() |
| gamification | gamification_update | UPDATE | user_id = auth.uid() |
| savings_goals | users_own_goals | ALL | user_id = auth.uid() |
| weekly_challenges | users_own_challenges | ALL | user_id = auth.uid() |
| debt_payments | debt_payments_select | SELECT | household_id = get_my_household_id() |
| debt_payments | debt_payments_insert | INSERT | household_id = get_my_household_id() AND (from_user_id = auth.uid() OR to_user_id = auth.uid()) |
| debt_payments | debt_payments_delete | DELETE | household_id = get_my_household_id() AND from_user_id = auth.uid() |
| monthly_budgets | monthly_budgets_select | SELECT | household_id = get_my_household_id() |
| monthly_budgets | monthly_budgets_insert | INSERT | household_id = get_my_household_id() |
| monthly_budgets | monthly_budgets_update | UPDATE | household_id = get_my_household_id() |
| monthly_budgets | monthly_budgets_delete | DELETE | household_id = get_my_household_id() |
| budget_defaults | budget_defaults_select | SELECT | household_id = get_my_household_id() |
| budget_defaults | budget_defaults_insert | INSERT | household_id = get_my_household_id() |
| budget_defaults | budget_defaults_update | UPDATE | household_id = get_my_household_id() |
| budget_defaults | budget_defaults_delete | DELETE | household_id = get_my_household_id() |

---

## UI-komponenter

### Dashboard

Layout (uppifrån och ner):
1. **Level & XP** — ProgressRing, level-namn, XP-bar
2. **Streak** — nuvarande streak, bästa streak
3. **Ekonom-analys** — månadsbetyg (S/A/B/C/D), inkomst vs utgifter, sparkvo, jämförelse med förra månaden
4. **Budget burn rate** — totalt kvar, daglig budget, total progress bar, varningar, per-kategori bars
5. **Pengapusslet** (om >1 medlem) — skuld-kort, betalningshistorik, gemensamma utgifter
6. **Leaderboard** — alla medlemmar rankade efter XP

### History

Tre tabbar: Utgifter, Statistik, Badges.

**Utgifter-tabben:**
- Hushåll/Mitt toggle (perspektiv)
- Dag/Vecka/Månad toggle (periodläge)
- Offset-navigation (← nuvarande →)
- Period-sammanfattning: total, jämförelse, proportionell bar, topp kategorier med budget-bars
- Grupperade utgifter (expanderbara i månads-vy)
- Kategori- och person-filter med aktiva filter-pills

### Settings

- Hushållsinfo + invite-kod
- Månadsbudget-setup (per kategori, med defaults och kopiera-funktioner)
- Gemensam budget (kategori-definitionen via `budgets`-tabellen)
- Valutainställning

### AddExpense

- Typ-toggle: Gemensam / Personlig / Inkomst
- Belopp-input med split-mode (fullbelopp vs min del)
- Kategori-grid med inline budget-varning (före loggning)
- Flash budget-varning (efter loggning, 3 sek, vid >75%)

---

## XP-system

- **+25 XP** per loggad utgift
- **+10 XP** per loggad inkomst
- **Streak-bonus:** +15 XP vid 7+ dagar, +25 XP vid 14+ dagar
- **Daglig cap:** 200 XP/dag (hanteras atomiskt i `add_xp` RPC)
- **Achievement XP:** varierar per achievement (50–500 XP)
- **Weekly challenge XP:** 75–200 XP per utmaning
- **12 levels** (300 XP per level, max level 12 vid 3300 XP)

### Daglig cap-mekanik

`gamification.daily_xp_awarded` trackar dagens tilldelning. `last_xp_date` nollställer countern vid datumbyte. Allt sker atomiskt i PostgreSQL — klienten skickar bara önskat belopp.

---

## Streak-system

Hanteras helt server-side via `update_streak()` RPC.

- Anropas vid varje utgiftsloggning
- Om `streak_last_log = igår` → current + 1
- Om `streak_last_log = idag` → ingen ändring (idempotent)
- Annars → reset till 1
- `streak_best` uppdateras automatiskt

---

## Weekly Challenges

3 slumpmässiga utmaningar per vecka (mån–sön), lagrade i `weekly_challenges`-tabellen.

**Challenge-typer:**
- `zero_category_days` — Dagar utan utgifter i en viss kategori
- `category_under` — Håll en kategori under X kr
- `log_days` — Logga utgifter X antal dagar
- `all_under_budget` — Alla kategorier inom budget
- `savings_rate` — Spara X% av inkomsten
- `expenses_with_desc` — Logga X utgifter med beskrivning
- `zero_expense_day` — En dag helt utan utgifter
- `all_members_log` — Alla i hushållet loggar minst 1 utgift

XP tilldelas via `add_xp` RPC vid completion. Duplikat-skapande hanteras via UNIQUE constraint + conflict recovery.

---

## Savings Goals

Personliga sparmål lagrade i `savings_goals`-tabellen. Migrerar automatiskt från localStorage vid första load.

Stödjer: namn, målbelopp, nuvarande belopp, valfritt deadline.

---

## Gamification: Achievements

12 achievements definierade i `constants.js`:

| ID | Trigger |
|----|---------|
| first_step | 1 loggad utgift |
| on_fire | 3-dagars streak |
| week_warrior | 7-dagars streak |
| fortnight_force | 14-dagars streak |
| monthly_master | 30-dagars streak |
| data_nerd | 50 utgifter |
| logging_machine | 100 utgifter |
| s_rank | Betyg S en månad |
| a_rank | Betyg A en månad |
| quest_clear | Nå första sparande-milstolpen |
| challenger | 5 veckoutmaningar klara |
| k_club | Spara 1000 totalt |

---

## Månadsbetyg

Baserat på sparkvot (savings rate):

| Betyg | Sparkvot |
|-------|----------|
| S | ≥ 30% |
| A | ≥ 20% |
| B | ≥ 10% |
| C | ≥ 0% |
| D | < 0% |

---

## Testsvit

7 testfiler, 34 tester:

| Fil | Tester | Beskrivning |
|-----|--------|-------------|
| `JoinPage.test.jsx` | 3 | Invite-flöde, rendering, felhantering |
| `AddExpense.test.jsx` | 5 | Utgiftsloggning, validering, XP-tilldelning |
| `useGamification.test.js` | 5 | XP-beräkning, streak-logik, achievements |
| `useSavingsGoals.test.js` | 3 | Sparmål CRUD |
| `useWeeklyChallenges.test.js` | 4 | Challenge-generering, completion |
| `useDebtCalculation.test.js` | 7 | Skuldsaldo, betalningar, teckenbugg-regression |
| `useBudgetStatus.test.js` | 7 | Budget-status, warning/over, daily_allowance, defaults |

---

## Tech stack (detaljer)

| Komponent | Paket | Version |
|-----------|-------|---------|
| Frontend | React | ^18.2.0 |
| Bundler | Vite | ^5.0.8 |
| Backend | @supabase/supabase-js | ^2.39.0 |
| Routing | react-router-dom | ^6.21.0 |
| Error tracking | @sentry/react | ^10.43.0 |
| Testing | vitest | ^4.1.0 |
| Test utils | @testing-library/react | ^16.3.2 |
| DOM env | jsdom | ^29.0.0 |
| Linting | eslint | ^9.39.4 |
| React hooks lint | eslint-plugin-react-hooks | ^7.0.1 |

### CI/CD Pipeline (GitHub Actions)

Triggas på push till `main`/`master` och PR:er.

1. **Checkout** → Setup Node 20 → Cache `node_modules`
2. **npm ci** → `npm run lint` → `npm run test:run` → `npm run build`

Build steg använder placeholder Supabase-credentials (validerar bara att bygget fungerar).
