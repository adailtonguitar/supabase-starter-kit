-- ============================================================
-- Feature Flags / Kill Switch
--
-- Permite ao super_admin ligar/desligar módulos sem redeploy.
-- Casos de uso:
--   - Desligar emit-nfce durante instabilidade da SEFAZ
--   - Desligar chamadas de IA se OpenAI estiver cara
--   - Modo manutenção global (chave "maintenance_mode")
--   - Rollout gradual (rollout_percentage)
--   - Override por empresa (disabled_companies / enabled_companies)
--
-- Resolução (função is_feature_enabled):
--   1. Se flag não existe → retorna default (true)
--   2. Se company_id ∈ disabled_companies → false
--   3. Se enabled = true → true (a menos que disabled_companies)
--   4. Se enabled = false e company_id ∈ enabled_companies → true (beta)
--   5. Se rollout_percentage > 0 → hash estável(company_id + key) % 100 < pct
--   6. Caso contrário → false
-- ============================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  description text,
  enabled boolean NOT NULL DEFAULT true,
  rollout_percentage smallint NOT NULL DEFAULT 100
    CHECK (rollout_percentage BETWEEN 0 AND 100),
  disabled_companies uuid[] NOT NULL DEFAULT '{}',
  enabled_companies uuid[] NOT NULL DEFAULT '{}',
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_key ON public.feature_flags(key);

COMMENT ON TABLE public.feature_flags IS
  'Feature flags globais para kill switch e rollout gradual. Gerenciadas em /admin.';
COMMENT ON COLUMN public.feature_flags.enabled IS
  'Estado padrão da flag. Overrides por empresa são aplicados depois.';
COMMENT ON COLUMN public.feature_flags.rollout_percentage IS
  'Porcentagem estável de empresas que veem a flag ligada (0-100). Usado para rollout gradual.';
COMMENT ON COLUMN public.feature_flags.disabled_companies IS
  'Empresas para as quais a flag é forçadamente desligada, independente de enabled.';
COMMENT ON COLUMN public.feature_flags.enabled_companies IS
  'Empresas para as quais a flag é forçadamente ligada (beta testers), quando enabled=false.';

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.tg_feature_flags_touch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_feature_flags_touch ON public.feature_flags;
CREATE TRIGGER trg_feature_flags_touch
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.tg_feature_flags_touch();

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode LER (precisa saber se feature está ligada).
DROP POLICY IF EXISTS "feature_flags_select_authenticated" ON public.feature_flags;
CREATE POLICY "feature_flags_select_authenticated"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (true);

-- Anônimo também lê (para banners de manutenção antes do login).
DROP POLICY IF EXISTS "feature_flags_select_anon" ON public.feature_flags;
CREATE POLICY "feature_flags_select_anon"
  ON public.feature_flags
  FOR SELECT
  TO anon
  USING (true);

-- Só super_admin escreve.
DROP POLICY IF EXISTS "feature_flags_write_super_admin" ON public.feature_flags;
CREATE POLICY "feature_flags_write_super_admin"
  ON public.feature_flags
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- ── RPC: is_feature_enabled ─────────────────────────────────
-- Checa se uma flag está ativa para uma empresa específica.
-- Se a flag não existir → retorna default (true, fail-open).
-- Função estável: pode ser cacheada pelo planner.
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_key text,
  p_company_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_flag public.feature_flags%ROWTYPE;
  v_hash int;
BEGIN
  SELECT * INTO v_flag FROM public.feature_flags WHERE key = p_key;

  -- Flag não existe → default true (fail-open para não derrubar recurso).
  IF NOT FOUND THEN
    RETURN true;
  END IF;

  -- Override por empresa (desligado forçado)
  IF p_company_id IS NOT NULL AND p_company_id = ANY(v_flag.disabled_companies) THEN
    RETURN false;
  END IF;

  -- Override por empresa (ligado forçado - beta testers)
  IF p_company_id IS NOT NULL AND p_company_id = ANY(v_flag.enabled_companies) THEN
    RETURN true;
  END IF;

  -- Desligado globalmente
  IF NOT v_flag.enabled THEN
    RETURN false;
  END IF;

  -- Rollout gradual
  IF v_flag.rollout_percentage >= 100 THEN
    RETURN true;
  END IF;

  IF v_flag.rollout_percentage <= 0 THEN
    RETURN false;
  END IF;

  -- Hash estável: mesmo company_id sempre cai no mesmo bucket.
  -- Sem company_id → usa um hash do próprio key (global aleatório por sessão).
  IF p_company_id IS NULL THEN
    v_hash := abs(hashtext(p_key || '::' || gen_random_uuid()::text)) % 100;
  ELSE
    v_hash := abs(hashtext(p_key || '::' || p_company_id::text)) % 100;
  END IF;

  RETURN v_hash < v_flag.rollout_percentage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.is_feature_enabled(text, uuid) IS
  'Verifica se uma feature flag está ativa para a empresa dada. Fail-open: flag inexistente retorna true.';

-- ── Seeds: flags importantes já catalogadas (todas ativas por default) ──
INSERT INTO public.feature_flags (key, description, enabled) VALUES
  ('maintenance_mode', 'Quando TRUE, app mostra banner de manutenção no topo. Use para janelas planejadas.', false),
  ('emit_nfce', 'Liga/desliga emissão de NFCe globalmente. Desligue se SEFAZ estiver fora.', true),
  ('emit_nfe', 'Liga/desliga emissão de NFe globalmente.', true),
  ('ai_report', 'Liga/desliga relatórios com IA (generate-ai-report / ai-report).', true),
  ('ai_support', 'Liga/desliga chat de suporte com IA (ai-support).', true),
  ('ai_product_image', 'Liga/desliga análise de imagem de produto com IA (analyze-product-image).', true),
  ('ai_marketing_art', 'Liga/desliga geração de artes de marketing (generate-marketing-art).', true),
  ('mercadopago_checkout', 'Liga/desliga criação de checkout no MercadoPago.', true),
  ('auto_fetch_dfe', 'Liga/desliga busca automática de DF-e (auto-fetch-dfe).', true),
  ('bulk_email', 'Liga/desliga envio em massa via admin (send-bulk-email).', true)
ON CONFLICT (key) DO NOTHING;
