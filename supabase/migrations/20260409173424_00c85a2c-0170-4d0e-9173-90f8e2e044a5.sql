
-- =============================================
-- 1. PROFILES (user metadata)
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================
-- 2. COMPANIES
-- =============================================
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  trade_name text,
  cnpj text,
  ie text,
  state_registration text,
  crt integer DEFAULT 1,
  phone text,
  email text,
  street text,
  address text,
  address_street text,
  number text,
  address_number text,
  complement text,
  neighborhood text,
  address_neighborhood text,
  city text,
  address_city text,
  state text DEFAULT 'MA',
  address_state text,
  zip_code text,
  cep text,
  address_zip text,
  ibge_code text,
  city_code text,
  address_ibge_code text,
  parent_company_id uuid REFERENCES public.companies(id),
  is_demo boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- =============================================
-- 3. COMPANY_USERS (tenant membership)
-- =============================================
CREATE TABLE IF NOT EXISTS public.company_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);
ALTER TABLE public.company_users ENABLE ROW LEVEL SECURITY;

-- RLS for companies (depends on company_users existing)
CREATE POLICY "Users can view own companies" ON public.companies FOR SELECT
  USING (id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid() AND is_active = true));
CREATE POLICY "Users can update own companies" ON public.companies FOR UPDATE
  USING (id IN (SELECT company_id FROM public.company_users WHERE user_id = auth.uid() AND is_active = true));
CREATE POLICY "Users can insert companies" ON public.companies FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role full access companies" ON public.companies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS for company_users
CREATE POLICY "Users can view own memberships" ON public.company_users FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Users can insert memberships" ON public.company_users FOR INSERT
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role full access company_users" ON public.company_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- 4. FISCAL_CONFIGS
-- =============================================
CREATE TABLE IF NOT EXISTS public.fiscal_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'nfce',
  is_active boolean NOT NULL DEFAULT true,
  environment text NOT NULL DEFAULT 'homologacao',
  certificate_path text,
  certificate_password_hash text,
  a3_thumbprint text,
  serie integer NOT NULL DEFAULT 1,
  next_number integer NOT NULL DEFAULT 1,
  csc_id text,
  csc_token text,
  ie text,
  ambiente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fiscal_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company fiscal_configs" ON public.fiscal_configs FOR SELECT
  USING (user_belongs_to_company(company_id));
CREATE POLICY "Users can manage own company fiscal_configs" ON public.fiscal_configs FOR ALL TO authenticated
  USING (user_belongs_to_company(company_id)) WITH CHECK (user_belongs_to_company(company_id));
CREATE POLICY "Service role full access fiscal_configs" ON public.fiscal_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- 5. NOTAS_RECEBIDAS
-- =============================================
CREATE TABLE IF NOT EXISTS public.notas_recebidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  chave_nfe text NOT NULL,
  nsu bigint,
  cnpj_emitente text,
  nome_emitente text,
  data_emissao timestamptz,
  valor_total numeric(12,2),
  numero_nfe integer,
  serie integer,
  schema_tipo text DEFAULT 'NF-e',
  situacao text DEFAULT 'resumo',
  status_manifestacao text DEFAULT 'pendente',
  xml_completo text,
  nuvem_fiscal_id text,
  importado boolean DEFAULT false,
  importado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, chave_nfe)
);
ALTER TABLE public.notas_recebidas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own company notas_recebidas" ON public.notas_recebidas FOR SELECT
  USING (user_belongs_to_company(company_id));
CREATE POLICY "Users can insert own company notas_recebidas" ON public.notas_recebidas FOR INSERT
  WITH CHECK (user_belongs_to_company(company_id));
CREATE POLICY "Users can update own company notas_recebidas" ON public.notas_recebidas FOR UPDATE
  USING (user_belongs_to_company(company_id));
CREATE POLICY "Service role full access notas_recebidas" ON public.notas_recebidas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- 6. DFE_SYNC_CONTROL
-- =============================================
CREATE TABLE IF NOT EXISTS public.dfe_sync_control (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE UNIQUE,
  ultimo_nsu bigint DEFAULT 0,
  ultima_consulta timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dfe_sync_control ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own dfe_sync_control" ON public.dfe_sync_control FOR SELECT
  USING (user_belongs_to_company(company_id));
CREATE POLICY "Service role full access dfe_sync_control" ON public.dfe_sync_control FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================
-- 7. RPC for memberships (used by client)
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_company_memberships()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'company_id', cu.company_id,
    'is_active', cu.is_active
  )), '[]'::jsonb)
  FROM public.company_users cu
  WHERE cu.user_id = auth.uid()
$$;

-- =============================================
-- 8. INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_company_users_user ON public.company_users(user_id);
CREATE INDEX IF NOT EXISTS idx_company_users_company ON public.company_users(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_cnpj ON public.companies(cnpj);
CREATE INDEX IF NOT EXISTS idx_fiscal_configs_company ON public.fiscal_configs(company_id);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_company ON public.notas_recebidas(company_id);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_chave ON public.notas_recebidas(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_situacao ON public.notas_recebidas(company_id, situacao);

-- =============================================
-- 9. ADD FK on nfe_documents to companies
-- =============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'nfe_documents_company_id_fkey' AND table_name = 'nfe_documents'
  ) THEN
    ALTER TABLE public.nfe_documents ADD CONSTRAINT nfe_documents_company_id_fkey 
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;
  END IF;
END $$;
