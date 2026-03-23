-- ============================================================
-- Alerta proativo de estoque negativo
-- Roda diariamente às 07:00 UTC, notifica admins/gerentes
-- ============================================================

CREATE OR REPLACE FUNCTION alert_negative_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_products text;
  v_count   int;
  v_admin   record;
BEGIN
  FOR v_company IN
    SELECT DISTINCT p.company_id, c.name as company_name
    FROM products p
    JOIN companies c ON c.id = p.company_id AND c.is_active = true
    WHERE p.stock_quantity < 0
  LOOP
    -- Buscar produtos com estoque negativo
    SELECT count(*), string_agg(name || ' (' || stock_quantity || ')', ', ' ORDER BY stock_quantity ASC)
    INTO v_count, v_products
    FROM products
    WHERE company_id = v_company.company_id
      AND stock_quantity < 0;

    -- Notificar admins/gerentes
    FOR v_admin IN
      SELECT user_id FROM company_users
      WHERE company_id = v_company.company_id
        AND is_active = true
        AND role IN ('admin', 'gerente')
    LOOP
      -- Evitar notificação duplicada no mesmo dia
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE company_id = v_company.company_id
          AND user_id = v_admin.user_id
          AND title = 'Alerta: Estoque Negativo'
          AND created_at > now() - INTERVAL '20 hours'
      ) THEN
        INSERT INTO notifications (company_id, user_id, title, message, type)
        VALUES (
          v_company.company_id,
          v_admin.user_id,
          'Alerta: Estoque Negativo',
          '🚨 ' || v_count || ' produto(s) com estoque negativo (inconsistência): ' ||
          LEFT(v_products, 500) ||
          '. Verifique movimentações recentes e faça inventário.',
          'warning'
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Agendar execução diária às 07:00 UTC
SELECT cron.schedule(
  'alert-negative-stock',
  '0 7 * * *',
  $$SELECT alert_negative_stock()$$
);
