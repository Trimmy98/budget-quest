# Budget Quest

En gamifierad budgetapp för hushåll. Tracka utgifter, tävla med dina roommates och levla upp din ekonomi!

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend/DB**: Supabase (PostgreSQL + Auth + Realtime)
- **Error tracking**: Sentry
- **Testing**: Vitest + React Testing Library
- **CI/CD**: GitHub Actions + Vercel
- **Styling**: Inline styles

## Kom igång

### 1. Klona och installera

```bash
npm install
```

### 2. Konfigurera miljövariabler

Kopiera `.env.example` till `.env` och fyll i dina värden:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=din_supabase_url
VITE_SUPABASE_ANON_KEY=din_anon_key
VITE_SENTRY_DSN=                        # Valfritt — lämna tomt för att stänga av
```

### 3. Konfigurera Supabase

1. Gå till [supabase.com](https://supabase.com) och logga in
2. Öppna ditt projekt → SQL Editor
3. Kör innehållet i `supabase_schema.sql` (och eventuella migreringar)
4. Gå till **Authentication → Settings** och aktivera Email auth
5. Under **Project Settings → API** hittar du din URL och anon key

### 4. Kör lokalt

```bash
npm run dev
```

Öppna [http://localhost:5173](http://localhost:5173)

### 5. Tillgängliga scripts

| Script | Beskrivning |
|--------|-------------|
| `npm run dev` | Starta dev-server (localhost:5173) |
| `npm run build` | Bygga produktionsbundle till `dist/` |
| `npm run preview` | Förhandsgranska produktionsbygg |
| `npm run test` | Kör tester i watch-mode |
| `npm run test:run` | Kör tester en gång |
| `npm run lint` | Kör ESLint på `src/` |

### 6. Deploya till Vercel

```bash
npm install -g vercel
vercel --prod
```

Lägg till miljövariablerna i Vercel dashboard under **Settings → Environment Variables**.

## Funktioner

### Utgifter & Budget
- **Utgifter**: Logga gemensamma och personliga utgifter med split-lägen ("Jag betalade allt" / "Redan min del")
- **Månadsbudget**: Sätt budget per kategori med live burn rate. Varningar vid >75% och >100%. Daglig budget-beräkning.
- **Budget-defaults**: Spara standardbudget som auto-kopieras till nya månader
- **Inkomster**: Logga månadsinkomster (lön, sidoinkomst, etc.)
- **Startsaldo**: Ange faktiskt banksaldo — appen beräknar ditt saldo löpande. Historik med justeringar och korrigeringar.
- **Sparande-tracking**: Se hur mycket du sparar/spenderar sedan en valbar startpunkt. Visar inkomst − utgifter med graf-markör.

### Pengapusslet (skuldsaldo)
- **Server-side skuldsaldoberäkning** via `calculate_debt` RPC — single source of truth
- **Registrera betalningar** (Swish, kontant, etc.) med inline-formulär
- **Betalningshistorik** med redigering och radering
- **Detaljerad uppdelning**: expense_balance, payment_adjustment, net_balance per medlem

### Gamification
- **XP-system**: +25 XP per utgift, +10 XP per inkomst, daglig cap 200 XP
- **Streaks**: Logga utgifter varje dag, +15/+25 XP bonus vid 7+/14+ dagar
- **12 levels** (300 XP per level)
- **12 achievements** att låsa upp
- **Weekly challenges**: 3 slumpmässiga per vecka (75–200 XP per utmaning)
- **Månadsbetyg**: S/A/B/C/D baserat på sparkvot

### Hushåll
- **Skapa/gå med** via inbjudningslänkar (race-safe via RPC)
- **Realtime**: Live-updates via Supabase Realtime

### Vyer
- **Dashboard**: Level, streak, ekonom-analys, budget burn rate, pengapusslet, leaderboard
- **AddExpense**: Logga utgift/inkomst med inline budget-varning + flash-varning efter loggning
- **History**: Period-översikt (dag/vecka/månad) med hushåll/mitt-perspektiv, jämförelse, budget vs faktiskt, filter
- **Quest Map**: Sparande-milstolpar
- **Achievements**: 12 upplåsbara badges
- **Personal (Mitt)**: Saldokort med SVG-graf, sparande-tracking, personlig budget + sparmål
- **Settings**: Startsaldo-hantering med event-historik, sparande-tracking, månadsbudget, kategori-definition, hushållsinställningar

### Övrigt
- **Auth**: Registrering + inloggning via Supabase Auth
- **Error tracking**: Sentry-integration för felrapportering
- **Mobiloptimerad**: Designad för 480px max-width

## Databasstruktur

| Tabell | Beskrivning |
|--------|-------------|
| `households` | Hushållsinfo + invite codes |
| `profiles` | Användarprofiler länkade till hushåll (inkl. startsaldo-cache, sparande-start) |
| `expenses` | Utgifter (shared/personal) med amount + paid_amount |
| `income` | Månadsinkomster per person |
| `budgets` | Budgetkategorier per hushåll (JSONB) |
| `gamification` | XP, streaks, achievements |
| `savings_goals` | Personliga sparmål |
| `weekly_challenges` | Veckoutmaningar per användare |
| `debt_payments` | Betalningar mellan hushållsmedlemmar |
| `monthly_budgets` | Månadsbudget per kategori |
| `budget_defaults` | Standardbudget per hushåll |
| `balance_events` | Saldobokföring (initial/adjustment/correction) |
| `weekly_reports` | Veckorapporter per hushåll (data + AI-kommentar) |

**11 RPC-funktioner** + 2 hjälp/verifieringsfunktioner. Se `SPEC.md` för fullständigt schema, RPC-specs och RLS-policies.

## Testsvit

9 testfiler, 62 tester: join-flöde, utgiftsloggning, gamification, sparmål, veckoutmaningar, skuldsaldo, budget-status, saldoberäkning, veckorapporter.

```bash
npm run test:run
```

## CI/CD

GitHub Actions kör automatiskt lint → test → build på push och PR:er. Vercel deploya automatiskt vid push till main.
