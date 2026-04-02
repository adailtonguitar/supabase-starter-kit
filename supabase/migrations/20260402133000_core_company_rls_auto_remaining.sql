-- Auto-apply conservative tenant RLS to any public table that:
--   - has a NOT NULL company_id column, and
--   - does not have row security enabled yet.
-- Skips tables already hardened by earlier migrations or manual SQL (RLS already ON).
--
-- Policies: members of the company (company_users) + super_admin read/write;
-- service_role full access (explicit, consistent with other core migrations).

DO $$
DECLARE
  r RECORD;
  p_member text := $m$
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  $m$;
  p_super text := $s$
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  $s$;
  p_use text;
  pol text;
BEGIN
  FOR r IN
    SELECT c.relname AS tname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN information_schema.columns col
      ON col.table_schema = 'public'
     AND col.table_name = c.relname
     AND col.column_name = 'company_id'
     AND col.is_nullable = 'NO'
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
  LOOP
    p_use := '(' || p_member || ' OR ' || p_super || ')';

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tname);

    pol := 'core_auto_' || r.tname || '_member_select';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tname AND policyname = pol
    ) THEN
      EXECUTE format(
        $f$
          CREATE POLICY %I ON public.%I
          FOR SELECT TO authenticated
          USING (%s)
        $f$,
        pol,
        r.tname,
        p_use
      );
    END IF;

    pol := 'core_auto_' || r.tname || '_member_insert';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tname AND policyname = pol
    ) THEN
      EXECUTE format(
        $f$
          CREATE POLICY %I ON public.%I
          FOR INSERT TO authenticated
          WITH CHECK (%s)
        $f$,
        pol,
        r.tname,
        p_use
      );
    END IF;

    pol := 'core_auto_' || r.tname || '_member_update';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tname AND policyname = pol
    ) THEN
      EXECUTE format(
        $f$
          CREATE POLICY %I ON public.%I
          FOR UPDATE TO authenticated
          USING (%s)
          WITH CHECK (%s)
        $f$,
        pol,
        r.tname,
        p_use,
        p_use
      );
    END IF;

    pol := 'core_auto_' || r.tname || '_member_delete';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tname AND policyname = pol
    ) THEN
      EXECUTE format(
        $f$
          CREATE POLICY %I ON public.%I
          FOR DELETE TO authenticated
          USING (%s)
        $f$,
        pol,
        r.tname,
        p_use
      );
    END IF;

    pol := 'core_auto_' || r.tname || '_service_role_all';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = r.tname AND policyname = pol
    ) THEN
      EXECUTE format(
        $f$
          CREATE POLICY %I ON public.%I
          FOR ALL TO service_role
          USING (true)
          WITH CHECK (true)
        $f$,
        pol,
        r.tname
      );
    END IF;
  END LOOP;
END $$;
