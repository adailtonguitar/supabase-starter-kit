-- Product Technical Specifications
CREATE TABLE IF NOT EXISTS public.product_tech_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  width TEXT DEFAULT '',
  height TEXT DEFAULT '',
  depth TEXT DEFAULT '',
  weight TEXT DEFAULT '',
  materials TEXT[] DEFAULT '{}',
  colors TEXT[] DEFAULT '{}',
  assembly_time TEXT DEFAULT '',
  assembly_instructions TEXT DEFAULT '',
  warranty TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, product_id)
);

ALTER TABLE public.product_tech_specs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_tech_specs_company" ON public.product_tech_specs
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_product_tech_specs_company ON public.product_tech_specs(company_id);
CREATE INDEX IF NOT EXISTS idx_product_tech_specs_product ON public.product_tech_specs(company_id, product_id);

-- Customer Reviews
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  ambiente_name TEXT DEFAULT '',
  photo_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_reviews_company" ON public.customer_reviews
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_customer_reviews_company ON public.customer_reviews(company_id);
