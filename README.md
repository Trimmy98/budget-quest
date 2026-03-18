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

- **Auth**: Registrering + inloggning via Supabase Auth
- **Hushåll**: Skapa/gå med i hushåll med inbjudningslänkar (race-safe via RPC)
- **Utgifter**: Logga gemensamma och personliga utgifter med split-lägen
- **Pengapusslet**: Automatisk skuldsaldohantering mellan hushållsmedlemmar
- **Dashboard**: Level, streak, leaderboard, månadsbetyg
- **Quest Map**: Sparande-milstolpar
- **Achievements**: 12 upplåsbara badges
- **Weekly Challenges**: 3 slumpmässiga veckoutmaningar med XP-belöningar
- **Savings Goals**: Personliga sparmål med deadline-stöd
- **XP-system**: Daglig cap (200/dag), streak-bonus, atomisk via RPC
- **Realtime**: Live-updates via Supabase Realtime
- **Error tracking**: Sentry-integration för felrapportering
- **Mobiloptimerad**: Designad för 480px max-width

## Databasstruktur

| Tabell | Beskrivning |
|--------|-------------|
| `households` | Hushållsinfo + invite codes |
| `profiles` | Användarprofiler länkade till hushåll |
| `expenses` | Utgifter (shared/personal) |
| `income` | Månadsinkomster per person |
| `budgets` | Budgetkategorier per hushåll |
| `gamification` | XP, streaks, achievements |
| `savings_goals` | Personliga sparmål |
| `weekly_challenges` | Veckoutmaningar per användare |

Se `SPEC.md` för fullständigt schema, RPC-funktioner och RLS-policies.

## Gamification

- **+25 XP** per loggad utgift
- **+15 XP** streak-bonus vid 7+ dagars streak
- **+25 XP** streak-bonus vid 14+ dagars streak
- **Daglig cap**: 200 XP/dag
- **12 levels** (300 XP per level)
- **12 achievements** att låsa upp
- **Weekly challenges**: 3 st per vecka (75–200 XP per utmaning)
- **Månadsbetyg**: S/A/B/C/D baserat på sparkvot

## CI/CD

GitHub Actions kör automatiskt lint → test → build på push och PR:er. Vercel deploya automatiskt vid push till main.
