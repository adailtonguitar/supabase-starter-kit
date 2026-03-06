-- =============================================
-- LIMPEZA AUTOMÁTICA DE CONTAS DEMO EXPIRADAS
-- Execute no SQL Editor do Supabase
-- =============================================

-- Função que limpa empresas demo expiradas há mais de 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_companies()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_count INT := 0;
BEGIN
  -- Find demo companies with plans expired > 30 days ago
  FOR v_company IN
    SELECT c.id AS company_id
    FROM companies c
    JOIN company_plans cp ON cp.company_id = c.id
    WHERE c.is_demo = true
      AND cp.expires_at IS NOT NULL
      AND cp.expires_at < now() - INTERVAL '30 days'
  LOOP
    -- Delete sale_items via sales
    DELETE FROM sale_items WHERE sale_id IN (
      SELECT id FROM sales WHERE company_id = v_company.company_id
    );

    -- Delete financial entries
    DELETE FROM financial_entries WHERE company_id = v_company.company_id;

    -- Delete sales
    DELETE FROM sales WHERE company_id = v_company.company_id;

    -- Delete stock movements
    DELETE FROM stock_movements WHERE company_id = v_company.company_id;

    -- Delete products
    DELETE FROM products WHERE company_id = v_company.company_id;

    -- Delete clients
    DELETE FROM clients WHERE company_id = v_company.company_id;

    -- Delete cash sessions/movements
    DELETE FROM cash_movements WHERE company_id = v_company.company_id;
    DELETE FROM cash_sessions WHERE company_id = v_company.company_id;

    -- Delete company_users (will cascade to user sessions)
    DELETE FROM company_users WHERE company_id = v_company.company_id;

    -- Delete company plan
    DELETE FROM company_plans WHERE company_id = v_company.company_id;

    -- Delete the company itself
    DELETE FROM companies WHERE id = v_company.company_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Para agendar via pg_cron (execute separadamente se pg_cron estiver habilitado):
-- SELECT cron.schedule('cleanup-demo', '0 3 * * *', 'SELECT public.cleanup_expired_demo_companies()');
