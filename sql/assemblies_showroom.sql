-- Assemblies table (Controle de Montagem)
CREATE TABLE IF NOT EXISTS public.assemblies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT DEFAULT '',
  assembler TEXT DEFAULT '',
  helper TEXT DEFAULT '',
  scheduled_date DATE NOT NULL,
  scheduled_time TEXT DEFAULT '08:00',
  items TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'agendada' CHECK (status IN ('agendada','em_andamento','concluida','reagendada','cancelada')),
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.assemblies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assemblies_company" ON public.assemblies
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_assemblies_company ON public.assemblies(company_id);
CREATE INDEX IF NOT EXISTS idx_assemblies_status ON public.assemblies(company_id, status);

-- Showroom Items table (Controle de Exposição)
CREATE TABLE IF NOT EXISTS public.showroom_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'desmontado' CHECK (status IN ('montado','desmontado','danificado','reposicao')),
  location TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_mostruario BOOLEAN DEFAULT false,
  mostruario_discount NUMERIC(5,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, product_id)
);

ALTER TABLE public.showroom_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "showroom_items_company" ON public.showroom_items
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_showroom_items_company ON public.showroom_items(company_id);
