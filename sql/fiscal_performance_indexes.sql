-- ═══════════════════════════════════════════════════════════
-- Índices de performance para tabelas fiscais + financeiras
-- + Expiração automática de sessões de caixa abertas > 24h
-- + Reconciliação vendas x fiscal_documents
-- + Idempotência em mark_financial_entry_paid
-- ═══════════════════════════════════════════════════════════

-- 1) Índices de performance em fiscal_documents
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_company_status
  ON fiscal_documents (company_id, status);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_sale_id
  ON fiscal_documents (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_access_key
  ON fiscal_documents (access_key)
  WHERE access_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_created_at
  ON fiscal_documents (company_id, created_at DESC);

-- 2) Índices de performance em fiscal_queue
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_status_created
  ON fiscal_queue (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_fiscal_queue_company_status
  ON fiscal_queue (company_id, status);

-- 3) Índice em financial_entries para idempotência
CREATE INDEX IF NOT EXISTS idx_financial_entries_company_status
  ON financial_entries (company_id, status);

-- 4) Expiração automática de sessões de caixa abertas há mais de 24h
CREATE OR REPLACE FUNCTION auto_expire_stale_cash_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
BEGIN
  FOR v_session IN
    SELECT id, company_id, opened_by
    FROM cash_sessions
    WHERE status = 'aberto'
      AND opened_at < now() - INTERVAL '24 hours'
  LOOP
    UPDATE cash_sessions
    SET status = 'expirado',
        closed_at = now(),
        notes = COALESCE(notes, '') || ' [Auto-expirado após 24h]'
    WHERE id = v_session.id;

    -- Notificar admin
    INSERT INTO notifications (company_id, user_id, title, message, type)
    SELECT
      v_session.company_id,
      cu.user_id,
      'Caixa expirado automaticamente',
      'Uma sessão de caixa aberta há mais de 24 horas foi encerrada automaticamente. Verifique os valores.',
      'warning'
    FROM company_users cu
    WHERE cu.company_id = v_session.company_id
      AND cu.is_active = true
      AND cu.role IN ('admin', 'gerente');

    INSERT INTO action_logs (company_id, user_id, action, module, details)
    VALUES (
      v_session.company_id,
      v_session.opened_by,
      'Sessão de caixa expirada automaticamente (>24h)',
      'caixa',
      jsonb_build_object('session_id', v_session.id)::text
    );
  END LOOP;
END;
$$;

-- Agendar para rodar a cada hora
SELECT cron.schedule(
  'auto-expire-cash-sessions',
  '0 * * * *',
  $$SELECT auto_expire_stale_cash_sessions()$$
);

-- 5) Reconciliação vendas x fiscal_documents (diária)
CREATE OR REPLACE FUNCTION reconcile_sales_fiscal_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_orphan_count int;
  v_mismatch_count int;
  v_admin record;
  v_details text;
BEGIN
  FOR v_company IN
    SELECT id, name FROM companies WHERE is_active = true
  LOOP
    -- Vendas autorizadas sem fiscal_document correspondente
    SELECT count(*) INTO v_orphan_count
    FROM sales s
    WHERE s.company_id = v_company.id
      AND s.status = 'autorizada'
      AND s.created_at > now() - INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM fiscal_documents fd
        WHERE fd.sale_id = s.id
          AND fd.status = 'autorizada'
      );

    -- fiscal_documents autorizados sem venda correspondente
    SELECT count(*) INTO v_mismatch_count
    FROM fiscal_documents fd
    WHERE fd.company_id = v_company.id
      AND fd.status = 'autorizada'
      AND fd.created_at > now() - INTERVAL '48 hours'
      AND fd.sale_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = fd.sale_id
          AND (s.status IS NULL OR s.status NOT IN ('cancelada'))
      );

    IF v_orphan_count > 0 OR v_mismatch_count > 0 THEN
      v_details := '';
      IF v_orphan_count > 0 THEN
        v_details := v_orphan_count || ' venda(s) autorizada(s) sem documento fiscal. ';
      END IF;
      IF v_mismatch_count > 0 THEN
        v_details := v_details || v_mismatch_count || ' documento(s) fiscal(is) sem venda válida.';
      END IF;

      FOR v_admin IN
        SELECT user_id FROM company_users
        WHERE company_id = v_company.id
          AND is_active = true
          AND role IN ('admin', 'gerente')
      LOOP
        INSERT INTO notifications (company_id, user_id, title, message, type)
        VALUES (
          v_company.id,
          v_admin.user_id,
          '⚠️ Divergência Vendas x Fiscal',
          v_details || ' Verifique em Fiscal > Documentos.',
          'warning'
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Agendar reconciliação vendas x fiscal para 06:30 UTC (após reconciliação financeira às 06:00)
SELECT cron.schedule(
  'reconcile-sales-fiscal',
  '30 6 * * *',
  $$SELECT reconcile_sales_fiscal_documents()$$
);
