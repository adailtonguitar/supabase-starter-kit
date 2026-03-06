-- Product Extras: Volumes and Variations
CREATE TABLE IF NOT EXISTS public.product_extras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  volumes JSONB DEFAULT '[]'::jsonb,
  variations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, product_id)
);

ALTER TABLE public.product_extras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_extras_company" ON public.product_extras
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_product_extras_company ON public.product_extras(company_id);
CREATE INDEX IF NOT EXISTS idx_product_extras_product ON public.product_extras(company_id, product_id);
