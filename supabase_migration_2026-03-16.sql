-- ============================================
-- Migration 2026-03-16: Säkerhetsfix + saknade policies
-- Kör i Supabase Dashboard > SQL Editor
-- ============================================

-- 1. SÄKERHETSFIX: Ta bort USING(true) som exponerar alla hushåll/invite-koder
DROP POLICY IF EXISTS "households_select_by_invite" ON households;

-- 2. Skapa säker RPC-funktion för invite-lookup (ersätter den osäkra policyn)
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

-- 3. Lägg till UPDATE-policy för expenses (saknades — redigering fungerade inte)
CREATE POLICY "expenses_update" ON expenses
  FOR UPDATE USING (
    household_id = get_my_household_id()
    AND user_id = auth.uid()
  );

-- 4. Ta bort UNIQUE-constraint på income (appen stödjer flera inkomster per månad)
ALTER TABLE income DROP CONSTRAINT IF EXISTS income_user_id_month_key;

-- 5. Ny debt_payments-tabell (ersätter budgets.debt_payments JSONB)
CREATE TABLE IF NOT EXISTS public.debt_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_household ON debt_payments(household_id);
CREATE INDEX IF NOT EXISTS idx_debt_payments_created ON debt_payments(household_id, created_at DESC);

ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "debt_payments_select" ON debt_payments
  FOR SELECT USING (household_id = get_my_household_id());
CREATE POLICY "debt_payments_insert" ON debt_payments
  FOR INSERT WITH CHECK (
    household_id = get_my_household_id()
    AND (from_user_id = auth.uid() OR to_user_id = auth.uid())
  );
CREATE POLICY "debt_payments_delete" ON debt_payments
  FOR DELETE USING (
    household_id = get_my_household_id()
    AND from_user_id = auth.uid()
  );

-- 6. Migrera befintlig data från budgets.debt_payments JSONB till nya tabellen
INSERT INTO debt_payments (household_id, from_user_id, to_user_id, amount, created_at)
SELECT b.household_id, (p->>'from')::uuid, (p->>'to')::uuid, (p->>'amount')::numeric,
  COALESCE((p->>'date')::timestamptz, now())
FROM budgets b, jsonb_array_elements(COALESCE(b.debt_payments, '[]'::jsonb)) AS p
WHERE jsonb_array_length(COALESCE(b.debt_payments, '[]'::jsonb)) > 0;

-- 7. Uppdatera register_debt_payment RPC — skriver till debt_payments-tabellen
DROP FUNCTION IF EXISTS public.register_debt_payment(numeric, uuid, uuid);
DROP FUNCTION IF EXISTS public.register_debt_payment(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public.register_debt_payment(
  from_user_id uuid, to_user_id uuid, payment_amount numeric, payment_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  hh_id uuid;
  new_id uuid;
BEGIN
  SELECT household_id INTO hh_id FROM profiles WHERE id = auth.uid();
  IF hh_id IS NULL THEN RAISE EXCEPTION 'Du tillhör inget hushåll'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = from_user_id AND household_id = hh_id) THEN
    RAISE EXCEPTION 'Avsändaren tillhör inte ditt hushåll'; END IF;
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = to_user_id AND household_id = hh_id) THEN
    RAISE EXCEPTION 'Mottagaren tillhör inte ditt hushåll'; END IF;
  IF payment_amount <= 0 THEN RAISE EXCEPTION 'Beloppet måste vara positivt'; END IF;

  INSERT INTO debt_payments (household_id, from_user_id, to_user_id, amount, note)
  VALUES (hh_id, from_user_id, to_user_id, payment_amount, payment_note)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
