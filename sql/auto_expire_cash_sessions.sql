-- ============================================================
-- Auto-expirar sessões de caixa abertas há mais de 24 horas
-- Roda a cada hora, fecha caixas esquecidos e notifica gerente
-- ============================================================

-- Função que fecha caixas antigos e notifica
CREATE OR REPLACE FUNCTION auto_expire_stale_cash_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_admin   record;
BEGIN
  FOR v_session IN
    SELECT cs.id, cs.company_id, cs.terminal_id, cs.opened_at,
           cs.total_vendas, cs.sales_count
    FROM cash_sessions cs
    WHERE cs.status = 'aberto'
      AND cs.opened_at < now() - INTERVAL '24 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Fechar a sessão
    UPDATE cash_sessions
    SET status = 'fechado',
        closed_at = now(),
        notes = COALESCE(notes, '') || ' [AUTO-FECHADO: sessão expirada após 24h]'
    WHERE id = v_session.id;

    -- Notificar admins/gerentes da empresa
    FOR v_admin IN
      SELECT user_id FROM company_users
      WHERE company_id = v_session.company_id
        AND is_active = true
        AND role IN ('admin', 'gerente')
    LOOP
      INSERT INTO notifications (company_id, user_id, title, message, type)
      VALUES (
        v_session.company_id,
        v_admin.user_id,
        'Caixa fechado automaticamente',
        '⚠️ O caixa do terminal ' || COALESCE(v_session.terminal_id, 'N/A') ||
        ' estava aberto desde ' || to_char(v_session.opened_at, 'DD/MM HH24:MI') ||
        ' e foi fechado automaticamente após 24h. Vendas: ' || COALESCE(v_session.sales_count, 0) ||
        ' | Total: R$ ' || COALESCE(v_session.total_vendas, 0)::text,
        'warning'
      );
    END LOOP;

    -- Log de auditoria
    INSERT INTO action_logs (company_id, action, module, details)
    VALUES (
      v_session.company_id,
      'Sessão de caixa auto-expirada',
      'caixa',
      jsonb_build_object(
        'session_id', v_session.id,
        'terminal_id', v_session.terminal_id,
        'opened_at', v_session.opened_at,
        'reason', 'Aberta há mais de 24 horas'
      )::text
    );
  END LOOP;
END;
$$;

-- Agendar execução a cada hora
SELECT cron.schedule(
  'auto-expire-cash-sessions',
  '0 * * * *',
  $$SELECT auto_expire_stale_cash_sessions()$$
);
