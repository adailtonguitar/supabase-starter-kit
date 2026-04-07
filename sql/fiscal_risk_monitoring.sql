-- =====================================================
-- Fiscal Risk Monitoring — Tabelas de risco e alertas
-- =====================================================

-- 1. Log de risco fiscal por nota emitida
CREATE TABLE IF NOT EXISTS public.fiscal_risk_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  note_id TEXT,
  note_type TEXT NOT NULL DEFAULT 'nfce' CHECK (note_type IN ('nfce', 'nfe')),
  score INTEGER NOT NULL DEFAULT 0,
  level TEXT NOT NULL DEFAULT 'low' CHECK (level IN ('low', 'medium', 'high', 'critical')),
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_risk_logs_company ON public.fiscal_risk_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_risk_logs_level ON public.fiscal_risk_logs(company_id, level);
CREATE INDEX IF NOT EXISTS idx_fiscal_risk_logs_created ON public.fiscal_risk_logs(company_id, created_at DESC);

ALTER TABLE public.fiscal_risk_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company fiscal_risk_logs" ON public.fiscal_risk_logs;
CREATE POLICY "Users can read own company fiscal_risk_logs"
  ON public.fiscal_risk_logs FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Service can insert fiscal_risk_logs" ON public.fiscal_risk_logs;
CREATE POLICY "Service can insert fiscal_risk_logs"
  ON public.fiscal_risk_logs FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- 2. Alertas fiscais
CREATE TABLE IF NOT EXISTS public.fiscal_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  risk_log_id UUID REFERENCES public.fiscal_risk_logs(id) ON DELETE SET NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  title TEXT NOT NULL,
  description TEXT,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  score INTEGER NOT NULL DEFAULT 0,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_alerts_company ON public.fiscal_alerts(company_id);
CREATE INDEX IF NOT EXISTS idx_fiscal_alerts_unresolved ON public.fiscal_alerts(company_id, is_resolved) WHERE NOT is_resolved;
CREATE INDEX IF NOT EXISTS idx_fiscal_alerts_created ON public.fiscal_alerts(company_id, created_at DESC);

ALTER TABLE public.fiscal_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own company fiscal_alerts" ON public.fiscal_alerts;
CREATE POLICY "Users can read own company fiscal_alerts"
  ON public.fiscal_alerts FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage own company fiscal_alerts" ON public.fiscal_alerts;
CREATE POLICY "Users can manage own company fiscal_alerts"
  ON public.fiscal_alerts FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid()));

-- 3. Função para contar riscos críticos recentes (bloqueio inteligente)
CREATE OR REPLACE FUNCTION public.count_recent_critical_risks(p_company_id UUID, p_hours INTEGER DEFAULT 24)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.fiscal_risk_logs
  WHERE company_id = p_company_id
    AND level = 'critical'
    AND created_at >= now() - (p_hours || ' hours')::interval;
$$;

-- 4. View de métricas fiscais
CREATE OR REPLACE VIEW public.fiscal_risk_metrics AS
SELECT
  company_id,
  COUNT(*) AS total_notes,
  COUNT(*) FILTER (WHERE level = 'low') AS low_count,
  COUNT(*) FILTER (WHERE level = 'medium') AS medium_count,
  COUNT(*) FILTER (WHERE level = 'high') AS high_count,
  COUNT(*) FILTER (WHERE level = 'critical') AS critical_count,
  ROUND(AVG(score), 1) AS avg_score,
  COUNT(*) FILTER (WHERE blocked) AS blocked_count,
  COUNT(*) FILTER (WHERE level IN ('high', 'critical')) * 100.0 / NULLIF(COUNT(*), 0) AS pct_high_risk
FROM public.fiscal_risk_logs
WHERE created_at >= now() - interval '30 days'
GROUP BY company_id;

COMMENT ON TABLE public.fiscal_risk_logs IS 'Log de score de risco fiscal por nota emitida';
COMMENT ON TABLE public.fiscal_alerts IS 'Alertas fiscais gerados automaticamente por risco elevado';
