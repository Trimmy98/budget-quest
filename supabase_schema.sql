-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Households
CREATE TABLE IF NOT EXISTS households (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  admin_id UUID NOT NULL REFERENCES auth.users(id),
  max_members INTEGER DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id),
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  onboarding_complete BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(10,2) NOT NULL,
  paid_amount NUMERIC(10,2),  -- vad loggaren faktiskt betalade (för pengapusslet)
  description TEXT DEFAULT '',
  category TEXT NOT NULL,
  expense_type TEXT NOT NULL CHECK (expense_type IN ('shared', 'personal')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Income
CREATE TABLE IF NOT EXISTS income (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  month TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  description TEXT
);

-- Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  household_id UUID NOT NULL REFERENCES households(id) UNIQUE,
  shared_categories JSONB NOT NULL DEFAULT '[]',
  personal_categories JSONB NOT NULL DEFAULT '[]',
  weekly_challenge JSONB DEFAULT NULL,
  debt_payments JSONB DEFAULT '[]',  -- swish-betalningar [{from, to, amount, date}]
  debt_reset_date TIMESTAMPTZ  -- oanvänd i koden, finns i prod
);

-- Gamification
CREATE TABLE IF NOT EXISTS gamification (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) UNIQUE,
  household_id UUID NOT NULL REFERENCES households(id),
  xp INTEGER DEFAULT 0,
  streak_current INTEGER DEFAULT 0,
  streak_best INTEGER DEFAULT 0,
  streak_last_log DATE DEFAULT NULL,
  achievements JSONB DEFAULT '[]'
);

-- Enable RLS
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE income ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's household_id
CREATE OR REPLACE FUNCTION get_my_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid();
$$;

-- Households policies
CREATE POLICY "households_select" ON households
  FOR SELECT USING (
    id = get_my_household_id()
    OR admin_id = auth.uid()
  );

CREATE POLICY "households_insert" ON households
  FOR INSERT WITH CHECK (admin_id = auth.uid());

CREATE POLICY "households_update" ON households
  FOR UPDATE USING (admin_id = auth.uid());

-- Secure invite lookup via RPC (replaces the old USING(true) policy)
CREATE OR REPLACE FUNCTION lookup_household_by_invite(invite_code_param TEXT)
RETURNS TABLE (id UUID, name TEXT, max_members INTEGER, invite_code TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT h.id, h.name, h.max_members, h.invite_code
  FROM households h
  WHERE h.invite_code = invite_code_param
  LIMIT 1;
$$;

-- Profiles policies
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR household_id = get_my_household_id()
  );

CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Expenses policies
CREATE POLICY "expenses_select" ON expenses
  FOR SELECT USING (household_id = get_my_household_id());

CREATE POLICY "expenses_insert" ON expenses
  FOR INSERT WITH CHECK (
    household_id = get_my_household_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE USING (
    household_id = get_my_household_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "expenses_delete" ON expenses
  FOR DELETE USING (user_id = auth.uid());

-- Income policies
CREATE POLICY "income_select" ON income
  FOR SELECT USING (household_id = get_my_household_id());

CREATE POLICY "income_insert" ON income
  FOR INSERT WITH CHECK (
    household_id = get_my_household_id()
    AND user_id = auth.uid()
  );

CREATE POLICY "income_update" ON income
  FOR UPDATE USING (
    household_id = get_my_household_id()
    AND user_id = auth.uid()
  );

-- Budgets policies
CREATE POLICY "budgets_select" ON budgets
  FOR SELECT USING (household_id = get_my_household_id());

CREATE POLICY "budgets_insert" ON budgets
  FOR INSERT WITH CHECK (
    household_id = get_my_household_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "budgets_update" ON budgets
  FOR UPDATE USING (
    household_id = get_my_household_id()
    AND EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Gamification policies
CREATE POLICY "gamification_select" ON gamification
  FOR SELECT USING (household_id = get_my_household_id());

CREATE POLICY "gamification_insert" ON gamification
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "gamification_update" ON gamification
  FOR UPDATE USING (user_id = auth.uid());

-- Enable Realtime on expenses
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
