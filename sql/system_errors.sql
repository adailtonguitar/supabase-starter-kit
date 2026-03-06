-- =====================================================
-- System Error Tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  page TEXT NOT NULL DEFAULT '',
  action TEXT DEFAULT '',
  error_message TEXT NOT NULL,
  error_stack TEXT DEFAULT '',
  browser TEXT DEFAULT '',
  device TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read errors
CREATE POLICY "system_errors_admin_select" ON public.system_errors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Any authenticated user can insert errors (so errors get logged)
CREATE POLICY "system_errors_insert" ON public.system_errors
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow anonymous inserts too (for errors before login)
CREATE POLICY "system_errors_anon_insert" ON public.system_errors
  FOR INSERT TO anon
  WITH CHECK (true);

-- Only super_admin can delete errors
CREATE POLICY "system_errors_admin_delete" ON public.system_errors
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_errors_created ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_user ON public.system_errors(user_email);
CREATE INDEX IF NOT EXISTS idx_system_errors_page ON public.system_errors(page);
