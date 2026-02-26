-- =============================================
-- SISTEMA DE FILIAIS (Branch System)
-- Execute no Supabase SQL Editor
-- =============================================

-- 1) Hierarquia: parent_company_id na tabela companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS parent_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_company_id);

-- 2) Tabela de transferências de estoque entre filiais
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company_id UUID NOT NULL REFERENCES companies(id),
  to_company_id UUID NOT NULL REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'received', 'cancelled')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  received_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  received_at TIMESTAMPTZ,
  CONSTRAINT different_companies CHECK (from_company_id <> to_company_id)
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  product_sku TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC DEFAULT 0
);

-- RLS
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items ENABLE ROW LEVEL SECURITY;

-- Política: usuário vê transferências das suas empresas
CREATE POLICY "Users see own company transfers" ON stock_transfers
  FOR ALL TO authenticated
  USING (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Users see transfer items" ON stock_transfer_items
  FOR ALL TO authenticated
  USING (
    transfer_id IN (SELECT id FROM stock_transfers WHERE 
      from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
      OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    )
  )
  WITH CHECK (
    transfer_id IN (SELECT id FROM stock_transfers WHERE 
      from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    )
  );

-- Índices
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);
