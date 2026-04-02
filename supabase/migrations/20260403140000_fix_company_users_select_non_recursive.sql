-- Fix: SELECT on company_users used "company_id IN (SELECT ... FROM company_users)" which can
-- fail RLS bootstrap (user never "sees" their own membership row → empty company_users → stuck onboarding).
--
-- New rule: always allow rows where user_id = auth.uid(); OR same-company colleagues via EXISTS
-- anchored on the viewer's own membership rows (those match the first branch).

DROP POLICY IF EXISTS core_company_users_select_membership ON public.company_users;
DROP POLICY IF EXISTS "Users can view own company membership" ON public.company_users;

CREATE POLICY core_company_users_select_membership
  ON public.company_users
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.company_users cu_self
      WHERE cu_self.user_id = auth.uid()
        AND cu_self.company_id = company_users.company_id
        AND cu_self.is_active = true
    )
  );
