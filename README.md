# 💰 Budget Quest

En gamifierad budgetapp för hushåll. Tracka utgifter, tävla med dina roommates och levla upp din ekonomi!

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend/DB**: Supabase (PostgreSQL + Auth + Realtime)
- **Hosting**: Vercel
- **Styling**: Inline styles / CSS modules

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

Redigera `.env`:
```
VITE_SUPABASE_URL=din_supabase_url
VITE_SUPABASE_ANON_KEY=din_anon_key
```

### 3. Konfigurera Supabase

1. Gå till [supabase.com](https://supabase.com) och logga in
2. Öppna ditt projekt → SQL Editor
3. Kör innehållet i `supabase_schema.sql`
4. Gå till **Authentication → Settings** och aktivera Email auth
5. Under **Project Settings → API** hittar du din URL och anon key

### 4. Kör lokalt

```bash
npm run dev
```

Öppna [http://localhost:5173](http://localhost:5173)

### 5. Deploya till Vercel

```bash
npm install -g vercel
vercel --prod
```

Lägg till miljövariablerna i Vercel dashboard under **Settings → Environment Variables**.

## Funktioner

- 🔐 **Auth**: Registrering + inloggning via Supabase Auth
- 🏠 **Hushåll**: Skapa/gå med i hushåll med inbjudningslänkar
- 💸 **Utgifter**: Logga gemensamma och personliga utgifter
- 📊 **Dashboard**: Level, streak, leaderboard, månadsbetyg
- 🗺️ **Quest Map**: Sparande-milstolpar
- 🏆 **Achievements**: 12 upplåsbara badges
- ⚡ **Realtime**: Live-updates via Supabase Realtime
- 📱 **Mobiloptimerad**: Designad för 480px max-width

## Databasstruktur

- `households` - Hushållsinfo + invite codes
- `profiles` - Användarprofiler länkade till hushåll
- `expenses` - Utgifter (shared/personal)
- `income` - Månadsinkomster per person
- `budgets` - Budgetkategorier per hushåll
- `gamification` - XP, streaks, achievements

## Gamification

- **+25 XP** per loggad utgift
- **+15 XP** streak-bonus vid 7+ dagars streak
- **+25 XP** streak-bonus vid 14+ dagars streak
- **12 levels** (300 XP per level)
- **12 achievements** att låsa upp
- **Månadsbetyg**: S/A/B/C/D baserat på sparkvot

## Vercel deployment

```bash
vercel --prod
```

Lägg till custom domain i Vercel dashboard → Settings → Domains.
