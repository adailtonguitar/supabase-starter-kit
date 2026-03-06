-- Tabela para contadores de recibo por empresa
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  counter_type text NOT NULL DEFAULT 'credit_receipt',
  last_number integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, counter_type)
);

ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own company counters"
  ON public.receipt_counters
  FOR ALL
  TO authenticated
  USING (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM public.profiles WHERE id = auth.uid()));

-- Função atômica para incrementar e retornar o próximo número
CREATE OR REPLACE FUNCTION public.next_receipt_number(p_company_id uuid, p_type text DEFAULT 'credit_receipt')
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  INSERT INTO receipt_counters (company_id, counter_type, last_number, updated_at)
  VALUES (p_company_id, p_type, 1, now())
  ON CONFLICT (company_id, counter_type)
  DO UPDATE SET last_number = receipt_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO v_next;
  
  RETURN v_next;
END;
$$;
