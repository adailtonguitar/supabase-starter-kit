-- ============================================================
-- Políticas RLS para proteger roles e limites de desconto
-- Impede auto-elevação de privilégios e garante que apenas
-- admins possam alterar roles/limites.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- 1) COMPANY_USERS: impedir que usuários alterem o próprio role
-- ═══════════════════════════════════════════════════════════

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Users can view own company membership" ON company_users;
DROP POLICY IF EXISTS "Admins can manage company users" ON company_users;
DROP POLICY IF EXISTS "Users cannot change own role" ON company_users;

-- Leitura: usuário vê registros da sua empresa
CREATE POLICY "Users can view own company membership"
ON company_users
FOR SELECT
TO authenticated
USING (company_id IN (
  SELECT cu2.company_id FROM company_users cu2
  WHERE cu2.user_id = auth.uid() AND cu2.is_active = true
));

-- INSERT/DELETE: apenas admins da empresa
CREATE POLICY "Admins can insert company users"
ON company_users
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
);

CREATE POLICY "Admins can delete company users"
ON company_users
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
  -- Impedir que admin exclua a si mesmo
  AND user_id != auth.uid()
);

-- UPDATE: admin pode atualizar OUTROS, NUNCA a si mesmo
CREATE POLICY "Admins can update other users only"
ON company_users
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
  -- Impedir auto-alteração de role
  AND user_id != auth.uid()
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = company_users.company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
  AND user_id != auth.uid()
);

-- ═══════════════════════════════════════════════════════════
-- 2) DISCOUNT_LIMITS: apenas admins podem gerenciar
-- ═══════════════════════════════════════════════════════════

-- Criar tabela se não existir
CREATE TABLE IF NOT EXISTS discount_limits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        text NOT NULL,
  max_discount_percent numeric NOT NULL DEFAULT 5,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (company_id, role)
);

ALTER TABLE discount_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company users can view discount limits" ON discount_limits;
DROP POLICY IF EXISTS "Admins can manage discount limits" ON discount_limits;

-- Leitura: qualquer membro ativo da empresa
CREATE POLICY "Company users can view discount limits"
ON discount_limits
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = discount_limits.company_id
      AND cu.is_active = true
  )
);

-- Escrita: apenas admin da empresa
CREATE POLICY "Admins can manage discount limits"
ON discount_limits
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = discount_limits.company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = auth.uid()
      AND cu.company_id = discount_limits.company_id
      AND cu.role = 'admin'
      AND cu.is_active = true
  )
);

-- ═══════════════════════════════════════════════════════════
-- 3) Colunas canceled_at / canceled_by em sales
-- ═══════════════════════════════════════════════════════════

ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES auth.users(id);
