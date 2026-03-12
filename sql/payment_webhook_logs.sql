-- =============================================
-- TABELA DE LOGS DE WEBHOOK DE PAGAMENTO
-- Execute no Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  amount NUMERIC(12,2),
  plan_key TEXT,
  user_id UUID,
  company_id UUID,
  raw_payload JSONB,
  error_message TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Somente super admins podem ler logs de webhook
CREATE POLICY "Super admins read webhook logs" ON public.payment_webhook_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Índices para consulta eficiente
CREATE INDEX IF NOT EXISTS idx_webhook_logs_mp_payment ON public.payment_webhook_logs(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON public.payment_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed ON public.payment_webhook_logs(processed) WHERE processed = false;
