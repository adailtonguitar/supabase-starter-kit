CREATE TABLE IF NOT EXISTS public.fiscal_tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  is_global BOOLEAN NOT NULL DEFAULT false,
  ncm_prefix TEXT NOT NULL,
  cest TEXT,
  uf_origem VARCHAR(2) NOT NULL DEFAULT '*',
  uf_destino VARCHAR(2) NOT NULL DEFAULT '*',
  regime TEXT NOT NULL CHECK (regime IN ('simples', 'normal')),
  tem_st BOOLEAN NOT NULL DEFAULT false,
  tipo_pis_cofins TEXT NOT NULL DEFAULT 'normal' CHECK (tipo_pis_cofins IN ('monofasico', 'isento', 'normal')),
  aliq_pis NUMERIC(5,2) NOT NULL DEFAULT 0,
  aliq_cofins NUMERIC(5,2) NOT NULL DEFAULT 0,
  icms_aliquota NUMERIC(5,2) NOT NULL DEFAULT 0,
  icms_reducao_base NUMERIC(5,2) NOT NULL DEFAULT 0,
  mva NUMERIC(7,2) NOT NULL DEFAULT 0,
  csosn TEXT,
  cst TEXT,
  vigencia_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim DATE,
  prioridade INTEGER NOT NULL DEFAULT 0,
  descricao TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiscal_tax_rules_lookup ON public.fiscal_tax_rules(ncm_prefix, regime, is_active);
CREATE INDEX IF NOT EXISTS idx_fiscal_tax_rules_company ON public.fiscal_tax_rules(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_tax_rules_global ON public.fiscal_tax_rules(is_global, is_active) WHERE is_global = true;

ALTER TABLE public.fiscal_tax_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read global fiscal_tax_rules"
  ON public.fiscal_tax_rules FOR SELECT TO authenticated
  USING (is_global = true AND is_active = true);

CREATE POLICY "Users can read own company fiscal_tax_rules"
  ON public.fiscal_tax_rules FOR SELECT TO authenticated
  USING (company_id IS NOT NULL AND user_belongs_to_company(company_id));

CREATE POLICY "Users can manage own company fiscal_tax_rules"
  ON public.fiscal_tax_rules FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND user_belongs_to_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND user_belongs_to_company(company_id));

CREATE POLICY "Service role full access fiscal_tax_rules"
  ON public.fiscal_tax_rules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER set_fiscal_tax_rules_updated_at
  BEFORE UPDATE ON public.fiscal_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.validate_fiscal_tax_rule()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.ncm_prefix := regexp_replace(COALESCE(NEW.ncm_prefix, ''), '\D', '', 'g');
  NEW.uf_origem := UPPER(TRIM(COALESCE(NEW.uf_origem, '*')));
  NEW.uf_destino := UPPER(TRIM(COALESCE(NEW.uf_destino, '*')));
  IF length(NEW.ncm_prefix) < 2 AND NEW.ncm_prefix != '*' THEN
    RAISE EXCEPTION 'ncm_prefix deve ter no mínimo 2 dígitos ou ser *: %', NEW.ncm_prefix;
  END IF;
  IF NEW.uf_origem != '*' AND NEW.uf_origem !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF origem inválida: %', NEW.uf_origem;
  END IF;
  IF NEW.uf_destino != '*' AND NEW.uf_destino !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'UF destino inválida: %', NEW.uf_destino;
  END IF;
  IF COALESCE(NEW.is_global, false) = false AND NEW.company_id IS NULL THEN
    RAISE EXCEPTION 'Regras não globais exigem company_id';
  END IF;
  IF NEW.vigencia_fim IS NOT NULL AND NEW.vigencia_fim < NEW.vigencia_inicio THEN
    RAISE EXCEPTION 'Vigência fim anterior ao início';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_fiscal_tax_rule_trigger
  BEFORE INSERT OR UPDATE ON public.fiscal_tax_rules
  FOR EACH ROW EXECUTE FUNCTION public.validate_fiscal_tax_rule();

COMMENT ON TABLE public.fiscal_tax_rules IS 'Motor fiscal dinâmico: regras tributárias por NCM/UF/regime para ICMS/ST/PIS/COFINS';