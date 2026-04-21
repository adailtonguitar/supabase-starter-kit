-- ============================================================================
-- system_errors.metadata: contexto estruturado (breadcrumbs, web vitals, etc.)
-- ============================================================================
-- Motivação: até aqui system_errors só guarda o que o browser, device, page e
-- action. Para triagem eficaz em produção, precisamos dos ~20 últimos passos
-- do usuário antes do erro (breadcrumbs) e métricas de performance (LCP, CLS,
-- INP) no momento em que o erro foi capturado.
--
-- metadata é jsonb NULL — opcional, não quebra inserts antigos.
-- Índice GIN opcional caso queiramos filtrar por chaves específicas
-- (ex: metadata->'web_vitals'->>'LCP' > 4000).
-- ============================================================================

ALTER TABLE public.system_errors
  ADD COLUMN IF NOT EXISTS metadata jsonb NULL;

COMMENT ON COLUMN public.system_errors.metadata IS
  'Contexto estruturado do erro: breadcrumbs (últimas ações do usuário), web_vitals (LCP/FID/CLS/INP/FCP), support_code relacionado, etc. Preenchido pelo ErrorTracker do frontend.';

-- Índice GIN leve: permite filtrar por metadata->> chaves específicas.
-- Criado com jsonb_path_ops que é mais enxuto e otimizado para @> / ?.
CREATE INDEX IF NOT EXISTS idx_system_errors_metadata_gin
  ON public.system_errors
  USING gin (metadata jsonb_path_ops);
