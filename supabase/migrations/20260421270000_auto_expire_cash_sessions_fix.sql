-- ============================================================================
-- Alinha auto_expire_stale_cash_sessions() com o enum cash_session_status
-- ----------------------------------------------------------------------------
-- Migration anterior (20260421260000) adicionou 'expirado' ao enum.
-- Agora a função pode usar esse valor com segurança.
--
-- Mantém a mesma lógica do script sql/auto_expire_cash_sessions.sql, apenas
-- trocando 'fechado' por 'expirado' e ajustando o texto do log.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_expire_stale_cash_sessions()
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
      FROM public.cash_sessions cs
      WHERE cs.status = 'aberto'
        AND cs.opened_at < now() - INTERVAL '24 hours'
      FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.cash_sessions
      SET status    = 'expirado',
          closed_at = now(),
          notes     = COALESCE(notes, '') || ' [Auto-expirado após 24h]'
      WHERE id = v_session.id;

    FOR v_admin IN
      SELECT user_id FROM public.company_users
       WHERE company_id = v_session.company_id
         AND is_active  = TRUE
         AND role IN ('admin', 'gerente')
    LOOP
      INSERT INTO public.notifications (company_id, user_id, title, message, type)
      VALUES (
        v_session.company_id,
        v_admin.user_id,
        'Caixa expirado automaticamente',
        'O caixa do terminal ' || COALESCE(v_session.terminal_id, 'N/A') ||
        ' estava aberto desde ' || to_char(v_session.opened_at, 'DD/MM HH24:MI') ||
        ' e foi expirado automaticamente após 24h. ' ||
        'Vendas: ' || COALESCE(v_session.sales_count, 0) ||
        ' | Total: R$ ' || COALESCE(v_session.total_vendas, 0)::text,
        'warning'
      );
    END LOOP;

    INSERT INTO public.action_logs (company_id, action, module, details)
    VALUES (
      v_session.company_id,
      'Sessão de caixa auto-expirada',
      'caixa',
      jsonb_build_object(
        'session_id',  v_session.id,
        'terminal_id', v_session.terminal_id,
        'opened_at',   v_session.opened_at,
        'reason',      'Aberta há mais de 24 horas'
      )::text
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.auto_expire_stale_cash_sessions() IS
  'Marca sessões de caixa abertas há mais de 24h como expirado (não fechado).
   Usa SKIP LOCKED para tolerar concorrência. Notifica admin/gerente via
   notifications e registra em action_logs. Agendado via pg_cron a cada hora.';
