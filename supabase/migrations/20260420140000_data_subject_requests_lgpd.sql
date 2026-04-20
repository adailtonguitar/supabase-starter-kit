-- ============================================================
-- LGPD: tabela de audit trail para pedidos de titulares.
-- Art. 18 — Direitos do titular dos dados pessoais.
--
-- Tipos suportados:
--   export          — direito de acesso / portabilidade (art. 18, II e V)
--   deletion        — direito de eliminação (art. 18, VI)
--   correction      — direito de correção (art. 18, III)
--   info            — direito de informação sobre tratamento (art. 18, I, VII, VIII)
--   revoke_consent  — revogação de consentimento (art. 8º, §5º)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text NOT NULL,
  user_name text,
  type text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  details text,
  response_notes text,
  ip_address text,
  user_agent text,
  CONSTRAINT data_subject_requests_type_check CHECK (
    type IN ('export', 'deletion', 'correction', 'info', 'revoke_consent')
  ),
  CONSTRAINT data_subject_requests_status_check CHECK (
    status IN ('pending', 'in_progress', 'completed', 'denied', 'canceled')
  ),
  CONSTRAINT data_subject_requests_processed_coherence CHECK (
    (status IN ('pending', 'in_progress') AND processed_at IS NULL) OR
    (status IN ('completed', 'denied', 'canceled') AND processed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_user
  ON public.data_subject_requests (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_data_subject_requests_pending
  ON public.data_subject_requests (requested_at DESC)
  WHERE status IN ('pending', 'in_progress');

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;

-- Usuário vê e cria apenas seus próprios pedidos
DROP POLICY IF EXISTS "dsr_user_select_own" ON public.data_subject_requests;
CREATE POLICY "dsr_user_select_own"
  ON public.data_subject_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "dsr_user_insert_own" ON public.data_subject_requests;
CREATE POLICY "dsr_user_insert_own"
  ON public.data_subject_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Apenas service_role/admins leem/atualizam todos (via Edge Functions ou admin panel)
-- Nenhuma policy de UPDATE para authenticated — quem processa é o admin via service_role.

COMMENT ON TABLE public.data_subject_requests IS
  'Audit trail dos pedidos LGPD (art. 18). Pedidos são registrados aqui pelos próprios titulares e processados manualmente pelo admin no prazo legal de 15 dias úteis.';

COMMENT ON COLUMN public.data_subject_requests.type IS
  'Tipo de solicitação LGPD: export (portabilidade), deletion (eliminação), correction (retificação), info (informação), revoke_consent (revogação).';

COMMENT ON COLUMN public.data_subject_requests.status IS
  'pending = aguardando processamento; in_progress = em análise pelo admin; completed = atendido; denied = negado com justificativa; canceled = cancelado pelo titular.';
