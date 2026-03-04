-- Price History table for tracking product price changes
-- Run this migration in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field_changed text NOT NULL CHECK (field_changed IN ('price', 'cost_price')),
  old_value numeric NOT NULL DEFAULT 0,
  new_value numeric NOT NULL DEFAULT 0,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'batch', 'xml_import')),
  CONSTRAINT price_changed CHECK (old_value IS DISTINCT FROM new_value)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_price_history_product ON public.price_history(product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_company ON public.price_history(company_id, changed_at DESC);

-- Enable RLS
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

-- SELECT: users can only see records from their company
CREATE POLICY "Users can view own company price history"
ON public.price_history FOR SELECT TO authenticated
USING (
  company_id IN (
    SELECT company_id FROM public.company_users WHERE user_id = auth.uid()
  )
);

-- INSERT: users can only insert records for their company
CREATE POLICY "Users can insert own company price history"
ON public.price_history FOR INSERT TO authenticated
WITH CHECK (
  company_id IN (
    SELECT company_id FROM public.company_users WHERE user_id = auth.uid()
  )
);

-- No UPDATE or DELETE policies = append-only table
