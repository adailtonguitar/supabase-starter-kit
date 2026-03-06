-- ============================================================
-- KITS / COMBOS INTELIGENTES
-- ============================================================

-- Kit header
CREATE TABLE IF NOT EXISTS product_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  discount_type text NOT NULL DEFAULT 'percent' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value numeric NOT NULL DEFAULT 0,
  progressive_discount boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_kits_company" ON product_kits
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- Kit items
CREATE TABLE IF NOT EXISTS product_kit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES product_kits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0
);

ALTER TABLE product_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kit_items_via_kit" ON product_kit_items
  FOR ALL TO authenticated
  USING (kit_id IN (SELECT id FROM product_kits WHERE company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid())))
  WITH CHECK (kit_id IN (SELECT id FROM product_kits WHERE company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid())));

-- ============================================================
-- AGENDA DE FOLLOW-UP COMERCIAL
-- ============================================================

CREATE TABLE IF NOT EXISTS follow_ups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES quotes(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_type text NOT NULL DEFAULT 'whatsapp' CHECK (contact_type IN ('whatsapp', 'phone', 'email', 'visit')),
  due_date date NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped', 'rescheduled')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE follow_ups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "follow_ups_company" ON follow_ups
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

-- ============================================================
-- GESTÃO DE TROCAS E DEVOLUÇÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  client_name text,
  reason text NOT NULL,
  reason_category text NOT NULL DEFAULT 'defeito' CHECK (reason_category IN ('defeito', 'arrependimento', 'troca_modelo', 'troca_voltagem', 'avaria_transporte', 'outro')),
  type text NOT NULL DEFAULT 'troca' CHECK (type IN ('troca', 'devolucao')),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_analise', 'aprovado', 'recusado', 'concluido')),
  refund_amount numeric DEFAULT 0,
  refund_method text,
  stock_returned boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "returns_company" ON returns
  FOR ALL TO authenticated
  USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  condition text NOT NULL DEFAULT 'bom' CHECK (condition IN ('bom', 'avariado', 'defeituoso', 'usado'))
);

ALTER TABLE return_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "return_items_via_return" ON return_items
  FOR ALL TO authenticated
  USING (return_id IN (SELECT id FROM returns WHERE company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid())))
  WITH CHECK (return_id IN (SELECT id FROM returns WHERE company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid())));
