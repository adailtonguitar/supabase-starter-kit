-- ============================================================
-- Fluxo de cancelamento e reembolso de assinaturas
--
-- Decisões de negócio:
--   * Cliente tem 7 dias de arrependimento a partir do pagamento
--     (CDC art. 49) → reembolso integral.
--   * Após 7 dias: não há reembolso. Assinatura é marcada como
--     "scheduled_cancel", cliente mantém acesso até subscription_end
--     (pagamento já feito), e a renovação automática não é cobrada.
--   * Motivo do cancelamento é OBRIGATÓRIO (padronizado + detalhe livre).
--   * Reembolsos são processados manualmente no painel do MP pelo admin;
--     o sistema só registra o pedido e o resultado.
-- ============================================================

-- 1) Colunas de cancelamento e reembolso
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS canceled_at           timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancel_effective_date timestamptz NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason         text        NULL,
  ADD COLUMN IF NOT EXISTS cancel_reason_details text        NULL,
  ADD COLUMN IF NOT EXISTS canceled_by           uuid        NULL,
  ADD COLUMN IF NOT EXISTS refund_requested      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS refund_status         text        NULL,
  ADD COLUMN IF NOT EXISTS refund_amount         numeric(12,2) NULL,
  ADD COLUMN IF NOT EXISTS refund_processed_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS refund_processed_by   uuid        NULL,
  ADD COLUMN IF NOT EXISTS refund_notes          text        NULL;

-- 2) FKs para auth.users (não bloqueia delete de usuário)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_canceled_by_fkey'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_canceled_by_fkey
      FOREIGN KEY (canceled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_refund_processed_by_fkey'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_refund_processed_by_fkey
      FOREIGN KEY (refund_processed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- 3) Constraint: motivos padronizados
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_cancel_reason_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_cancel_reason_check
  CHECK (
    cancel_reason IS NULL OR cancel_reason IN (
      'price_too_high',
      'low_usage',
      'missing_features',
      'bugs_issues',
      'poor_support',
      'switched_provider',
      'business_closed',
      'other'
    )
  );

-- 4) Constraint: status de reembolso
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_refund_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_refund_status_check
  CHECK (
    refund_status IS NULL OR refund_status IN (
      'pending',
      'processed',
      'denied'
    )
  );

-- 5) Coerência: se refund_requested=true → amount > 0 obrigatório
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_refund_amount_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_refund_amount_check
  CHECK (
    refund_requested = false
    OR (refund_requested = true AND refund_amount IS NOT NULL AND refund_amount > 0)
  );

-- 6) Coerência: se status='scheduled_cancel' ou 'canceled', canceled_at é obrigatório
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_canceled_at_coherent;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_canceled_at_coherent
  CHECK (
    status NOT IN ('scheduled_cancel', 'canceled')
    OR canceled_at IS NOT NULL
  );

-- 7) Índice para admin listar reembolsos pendentes
CREATE INDEX IF NOT EXISTS idx_subscriptions_refund_pending
  ON public.subscriptions (refund_requested, refund_status)
  WHERE refund_status = 'pending';

-- 8) Índice para cron/job que processa cancelamentos agendados
CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_cancel
  ON public.subscriptions (cancel_effective_date)
  WHERE status = 'scheduled_cancel';

-- 9) Comentários de documentação
COMMENT ON COLUMN public.subscriptions.canceled_at           IS 'Momento em que o cliente (ou admin) solicitou cancelamento. Preenchido quando status passa a scheduled_cancel/canceled.';
COMMENT ON COLUMN public.subscriptions.cancel_effective_date IS 'Data efetiva em que o acesso encerra. Cliente mantém acesso até esta data. Geralmente = subscription_end no momento do cancelamento.';
COMMENT ON COLUMN public.subscriptions.cancel_reason         IS 'Motivo padronizado (enum texto): price_too_high | low_usage | missing_features | bugs_issues | poor_support | switched_provider | business_closed | other';
COMMENT ON COLUMN public.subscriptions.cancel_reason_details IS 'Comentário livre do cliente sobre o motivo (obrigatório quando reason=other).';
COMMENT ON COLUMN public.subscriptions.canceled_by           IS 'Usuário que disparou o cancelamento (próprio cliente ou admin). NULL se foi o sistema.';
COMMENT ON COLUMN public.subscriptions.refund_requested      IS 'Cliente solicitou reembolso no ato do cancelamento. Só elegível dentro de 7 dias do pagamento (CDC art. 49).';
COMMENT ON COLUMN public.subscriptions.refund_status         IS 'Status do reembolso: pending (aguarda ação do admin no MP) | processed (estornado) | denied (negado).';
COMMENT ON COLUMN public.subscriptions.refund_amount         IS 'Valor em BRL a ser reembolsado.';
COMMENT ON COLUMN public.subscriptions.refund_processed_at   IS 'Momento em que admin marcou reembolso como processado/negado.';
COMMENT ON COLUMN public.subscriptions.refund_processed_by   IS 'Admin que processou o reembolso no MP.';
COMMENT ON COLUMN public.subscriptions.refund_notes          IS 'Observações do admin ao processar (ID do estorno no MP, etc).';

-- 10) Expande policy de UPDATE em subscriptions para permitir o dono atualizar
--     apenas colunas de cancelamento (não pode mexer em status, plan_key, etc direto).
--     O cancelamento real passa pela Edge Function (service_role), mas deixamos
--     esta policy pra caso futuro. Por ora, nada muda — SELECT já existia.
--     OBS: o fluxo real de cancel vai via Edge Function (service_role),
--     portanto NÃO criamos UPDATE policy pro dono aqui.
--     Service role já tem FOR ALL.
