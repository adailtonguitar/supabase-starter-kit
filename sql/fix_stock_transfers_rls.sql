-- =============================================
-- FIX: Allow destination branch to UPDATE stock_transfers (receive)
-- Execute no Supabase SQL Editor
-- =============================================

-- Drop the old combined policy
DROP POLICY IF EXISTS "Users see own company transfers" ON stock_transfers;

-- 1) SELECT: both origin and destination can read
CREATE POLICY "Users can view own transfers" ON stock_transfers
  FOR SELECT TO authenticated
  USING (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- 2) INSERT: only origin company can create
CREATE POLICY "Users can create transfers from own company" ON stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- 3) UPDATE: both origin and destination can update (origin cancels, destination receives)
CREATE POLICY "Users can update own transfers" ON stock_transfers
  FOR UPDATE TO authenticated
  USING (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );
