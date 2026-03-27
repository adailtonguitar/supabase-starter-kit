-- =============================================================================
-- ATENCAO: arquivo GERADO — concatena todos os .sql desta pasta (exceto este e EXECUTAR_NO_SUPABASE.sql).
-- Pode haver dependências de ordem, duplicatas ou erros se já foi aplicado antes.
-- Para produção: use EXECUTAR_NO_SUPABASE.sql (só migrations oficiais).
-- =============================================================================


-- =========================================================================
-- ARQUIVO: sql/20260319_mark_financial_entry_paid_atomic_hardened.sql
-- =========================================================================
-- Migration: harden mark_financial_entry_paid_atomic
-- - fixes enum handling for status/type checks
-- - validates/casts payment method enum
-- - avoids invalid sale_id FK usage in cash_movements
-- - keeps generic error output to avoid leaking internals

CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid_atomic(
  p_company_id uuid,
  p_entry_id uuid,
  p_paid_amount numeric,
  p_payment_method text,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_entry record;
  v_session record;
  v_method text;
  v_payment_field text;
  v_movement_id uuid;
  v_session_id uuid := null;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.user_id = v_uid
      AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF p_entry_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LanÃ§amento invÃ¡lido');
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor pago invÃ¡lido');
  END IF;

  v_method := lower(coalesce(trim(p_payment_method), 'dinheiro'));
  IF v_method = '' THEN
    v_method := 'dinheiro';
  END IF;

  IF v_method NOT IN ('dinheiro','pix','debito','credito','voucher','outros','prazo') THEN
    v_method := 'outros';
  END IF;

  SELECT *
  INTO v_entry
  FROM financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LanÃ§amento nÃ£o encontrado');
  END IF;

  IF v_entry.status = 'pago' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'entry_id', p_entry_id);
  END IF;

  UPDATE financial_entries
  SET
    status = 'pago',
    paid_amount = p_paid_amount,
    paid_date = current_date,
    payment_method = v_method,
    updated_at = now()
  WHERE id = p_entry_id
    AND company_id = p_company_id;

  IF v_entry.type = 'receber' THEN
    SELECT *
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.company_id = p_company_id
      AND cs.status = 'aberto'
    ORDER BY cs.opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_session_id := v_session.id;
      v_payment_field := CASE
        WHEN v_method = 'dinheiro' THEN 'total_dinheiro'
        WHEN v_method = 'pix' THEN 'total_pix'
        WHEN v_method = 'debito' THEN 'total_debito'
        WHEN v_method = 'credito' THEN 'total_credito'
        WHEN v_method = 'voucher' THEN 'total_voucher'
        ELSE 'total_outros'
      END;

      INSERT INTO cash_movements (
        company_id,
        session_id,
        type,
        amount,
        performed_by,
        payment_method,
        description,
        sale_id
      ) VALUES (
        p_company_id,
        v_session.id,
        'suprimento',
        p_paid_amount,
        coalesce(p_performed_by, v_uid),
        v_method::payment_method,
        'Recebimento: ' || coalesce(v_entry.description, 'LanÃ§amento financeiro'),
        NULL
      )
      RETURNING id INTO v_movement_id;

      EXECUTE format(
        'UPDATE cash_sessions
           SET %I = coalesce(%I, 0) + $1,
               total_suprimento = coalesce(total_suprimento, 0) + $1
         WHERE id = $2',
        v_payment_field,
        v_payment_field
      )
      USING p_paid_amount, v_session.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', p_entry_id,
    'movement_id', v_movement_id,
    'session_id', v_session_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao registrar pagamento');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/acquisition_type.sql
-- =========================================================================
-- Add acquisition_type to stock_movements for fiscal origin tracking
-- Run this migration FIRST before deploying code changes

ALTER TABLE public.stock_movements
ADD COLUMN IF NOT EXISTS acquisition_type text
CHECK (acquisition_type IN ('cnpj', 'cpf', 'mixed'))
DEFAULT NULL;

COMMENT ON COLUMN public.stock_movements.acquisition_type IS
  'Fiscal origin of the stock entry: cnpj = with invoice, cpf = without invoice, mixed = both';

-- Index for FIFO fiscal queries (consume cnpj stock first)
CREATE INDEX IF NOT EXISTS idx_stock_movements_acquisition
ON public.stock_movements (product_id, acquisition_type, created_at)
WHERE type = 'entrada';


-- =========================================================================
-- ARQUIVO: sql/admin_delete_company.sql
-- =========================================================================
-- Execute this in the Supabase SQL Editor to create the admin delete function
-- This function uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete in strict dependency order (deepest children first)

  -- 1) sale_items (FK to sales AND products)
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);

  -- 2) inventory_count_items (FK to inventory_counts)
  DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE company_id = p_company_id);

  -- 3) product_labels (FK to products)
  DELETE FROM product_labels WHERE company_id = p_company_id;

  -- 4) price_history (FK to products)
  DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE company_id = p_company_id);

  -- 5) cash_movements (FK to cash_sessions)
  DELETE FROM cash_movements WHERE company_id = p_company_id;

  -- 6) Tables with only company_id FK
  DELETE FROM action_logs WHERE company_id = p_company_id;
  DELETE FROM loyalty_transactions WHERE company_id = p_company_id;
  DELETE FROM loyalty_config WHERE company_id = p_company_id;
  DELETE FROM cash_sessions WHERE company_id = p_company_id;
  DELETE FROM sales WHERE company_id = p_company_id;
  DELETE FROM stock_movements WHERE company_id = p_company_id;
  DELETE FROM stock_transfers WHERE company_id = p_company_id;
  DELETE FROM financial_entries WHERE company_id = p_company_id;
  DELETE FROM inventory_counts WHERE company_id = p_company_id;
  DELETE FROM product_lots WHERE company_id = p_company_id;
  DELETE FROM fiscal_categories WHERE company_id = p_company_id;
  DELETE FROM card_administrators WHERE company_id = p_company_id;
  DELETE FROM products WHERE company_id = p_company_id;
  DELETE FROM product_categories WHERE company_id = p_company_id;
  DELETE FROM clients WHERE company_id = p_company_id;
  DELETE FROM promotions WHERE company_id = p_company_id;
  DELETE FROM suppliers WHERE company_id = p_company_id;
  DELETE FROM carriers WHERE company_id = p_company_id;
  DELETE FROM employees WHERE company_id = p_company_id;
  DELETE FROM purchase_orders WHERE company_id = p_company_id;
  DELETE FROM quotes WHERE company_id = p_company_id;
  DELETE FROM company_users WHERE company_id = p_company_id;
  DELETE FROM subscriptions WHERE company_id = p_company_id;

  -- Company plans
  DELETE FROM company_plans WHERE company_id = p_company_id;

  -- Delete child companies first (recursive)
  DELETE FROM companies WHERE parent_company_id = p_company_id;
  -- Finally delete the company itself
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/admin_notifications.sql
-- =========================================================================
-- Admin notifications system
-- Run this in Supabase SQL Editor

-- Table for notifications sent by admin
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE, -- NULL = broadcast to all
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'alert', 'maintenance')),
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Table to track read status per user
CREATE TABLE IF NOT EXISTS notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid REFERENCES admin_notifications(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  read_at timestamptz DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

-- RLS
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

-- Users can read notifications targeted to their company or broadcast (company_id IS NULL)
CREATE POLICY "Users can view their notifications"
  ON admin_notifications FOR SELECT TO authenticated
  USING (
    company_id IS NULL
    OR company_id IN (
      SELECT cu.company_id FROM company_users cu WHERE cu.user_id = auth.uid()
    )
  );

-- Only service_role can insert notifications (via edge function)
-- No insert policy for regular users

-- Users can read their own read status
CREATE POLICY "Users can view own reads"
  ON notification_reads FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Users can mark as read
CREATE POLICY "Users can mark as read"
  ON notification_reads FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_company ON admin_notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_notification ON notification_reads(notification_id);


-- =========================================================================
-- ARQUIVO: sql/alert_negative_stock.sql
-- =========================================================================
-- ============================================================
-- Alerta proativo de estoque negativo
-- Roda diariamente Ã s 07:00 UTC, notifica admins/gerentes
-- ============================================================

CREATE OR REPLACE FUNCTION alert_negative_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_products text;
  v_count   int;
  v_admin   record;
BEGIN
  FOR v_company IN
    SELECT DISTINCT p.company_id, c.name as company_name
    FROM products p
    JOIN companies c ON c.id = p.company_id AND c.is_active = true
    WHERE p.stock_quantity < 0
  LOOP
    -- Buscar produtos com estoque negativo
    SELECT count(*), string_agg(name || ' (' || stock_quantity || ')', ', ' ORDER BY stock_quantity ASC)
    INTO v_count, v_products
    FROM products
    WHERE company_id = v_company.company_id
      AND stock_quantity < 0;

    -- Notificar admins/gerentes
    FOR v_admin IN
      SELECT user_id FROM company_users
      WHERE company_id = v_company.company_id
        AND is_active = true
        AND role IN ('admin', 'gerente')
    LOOP
      -- Evitar notificaÃ§Ã£o duplicada no mesmo dia
      IF NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE company_id = v_company.company_id
          AND user_id = v_admin.user_id
          AND title = 'Alerta: Estoque Negativo'
          AND created_at > now() - INTERVAL '20 hours'
      ) THEN
        INSERT INTO notifications (company_id, user_id, title, message, type)
        VALUES (
          v_company.company_id,
          v_admin.user_id,
          'Alerta: Estoque Negativo',
          'ðŸš¨ ' || v_count || ' produto(s) com estoque negativo (inconsistÃªncia): ' ||
          LEFT(v_products, 500) ||
          '. Verifique movimentaÃ§Ãµes recentes e faÃ§a inventÃ¡rio.',
          'warning'
        );
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Agendar execuÃ§Ã£o diÃ¡ria Ã s 07:00 UTC
SELECT cron.schedule(
  'alert-negative-stock',
  '0 7 * * *',
  $$SELECT alert_negative_stock()$$
);


-- =========================================================================
-- ARQUIVO: sql/appliance_fields.sql
-- =========================================================================
-- Add appliance/furniture-specific fields to products table
-- voltage: 110V, 220V, Bivolt
-- warranty_months: manufacturer warranty in months
-- serial_number: individual unit traceability

ALTER TABLE products ADD COLUMN IF NOT EXISTS voltage text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS warranty_months integer;
ALTER TABLE products ADD COLUMN IF NOT EXISTS serial_number text;

-- Add constraint for valid voltage values
ALTER TABLE products ADD CONSTRAINT chk_voltage CHECK (voltage IS NULL OR voltage IN ('110V', '220V', 'Bivolt'));


-- =========================================================================
-- ARQUIVO: sql/assemblies_showroom.sql
-- =========================================================================
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

-- Showroom Items table (Controle de ExposiÃ§Ã£o)
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


-- =========================================================================
-- ARQUIVO: sql/atomic_fiscal_number.sql
-- =========================================================================
-- ============================================================
-- RPC: next_fiscal_number
-- Atomically reads and increments fiscal_configs.next_number
-- using SELECT ... FOR UPDATE to prevent race conditions
-- between simultaneous terminals.
-- ============================================================

CREATE OR REPLACE FUNCTION public.next_fiscal_number(
  p_config_id uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  -- Lock the row and read current value in one step
  SELECT next_number INTO v_next
  FROM fiscal_configs
  WHERE id = p_config_id
  FOR UPDATE;

  IF v_next IS NULL THEN
    RAISE EXCEPTION 'ConfiguraÃ§Ã£o fiscal nÃ£o encontrada (id=%)', p_config_id;
  END IF;

  -- Increment
  UPDATE fiscal_configs
  SET next_number = v_next + 1,
      updated_at = now()
  WHERE id = p_config_id;

  RETURN v_next;
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/auto_expire_cash_sessions.sql
-- =========================================================================
-- ============================================================
-- Auto-expirar sessÃµes de caixa abertas hÃ¡ mais de 24 horas
-- Roda a cada hora, fecha caixas esquecidos e notifica gerente
-- ============================================================

-- FunÃ§Ã£o que fecha caixas antigos e notifica
CREATE OR REPLACE FUNCTION auto_expire_stale_cash_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_admin   record;
BEGIN
  FOR v_session IN
    SELECT cs.id, cs.company_id, cs.terminal_id, cs.opened_at,
           cs.total_vendas, cs.sales_count
    FROM cash_sessions cs
    WHERE cs.status = 'aberto'
      AND cs.opened_at < now() - INTERVAL '24 hours'
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Fechar a sessÃ£o
    UPDATE cash_sessions
    SET status = 'fechado',
        closed_at = now(),
        notes = COALESCE(notes, '') || ' [AUTO-FECHADO: sessÃ£o expirada apÃ³s 24h]'
    WHERE id = v_session.id;

    -- Notificar admins/gerentes da empresa
    FOR v_admin IN
      SELECT user_id FROM company_users
      WHERE company_id = v_session.company_id
        AND is_active = true
        AND role IN ('admin', 'gerente')
    LOOP
      INSERT INTO notifications (company_id, user_id, title, message, type)
      VALUES (
        v_session.company_id,
        v_admin.user_id,
        'Caixa fechado automaticamente',
        'âš ï¸ O caixa do terminal ' || COALESCE(v_session.terminal_id, 'N/A') ||
        ' estava aberto desde ' || to_char(v_session.opened_at, 'DD/MM HH24:MI') ||
        ' e foi fechado automaticamente apÃ³s 24h. Vendas: ' || COALESCE(v_session.sales_count, 0) ||
        ' | Total: R$ ' || COALESCE(v_session.total_vendas, 0)::text,
        'warning'
      );
    END LOOP;

    -- Log de auditoria
    INSERT INTO action_logs (company_id, action, module, details)
    VALUES (
      v_session.company_id,
      'SessÃ£o de caixa auto-expirada',
      'caixa',
      jsonb_build_object(
        'session_id', v_session.id,
        'terminal_id', v_session.terminal_id,
        'opened_at', v_session.opened_at,
        'reason', 'Aberta hÃ¡ mais de 24 horas'
      )::text
    );
  END LOOP;
END;
$$;

-- Agendar execuÃ§Ã£o a cada hora
SELECT cron.schedule(
  'auto-expire-cash-sessions',
  '0 * * * *',
  $$SELECT auto_expire_stale_cash_sessions()$$
);


-- =========================================================================
-- ARQUIVO: sql/auto_fetch_dfe_cron.sql
-- =========================================================================
-- Cron job para busca automÃ¡tica de NF-e da SEFAZ (a cada 1 hora)
-- Execute este SQL no Supabase SQL Editor

-- 1. Habilitar extensÃµes
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Criar cron job
SELECT cron.schedule(
  'auto-fetch-dfe-hourly',
  '0 * * * *',
  $$
  SELECT
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/auto-fetch-dfe',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo"}'::jsonb,
      body := '{}'::jsonb
    ) AS request_id;
  $$
);


-- =========================================================================
-- ARQUIVO: sql/branch_system.sql
-- =========================================================================
-- =============================================
-- SISTEMA DE FILIAIS (Branch System)
-- Execute no Supabase SQL Editor
-- =============================================

-- 1) Hierarquia: parent_company_id na tabela companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS parent_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies(parent_company_id);

-- 2) Tabela de transferÃªncias de estoque entre filiais
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

-- PolÃ­tica: usuÃ¡rio vÃª transferÃªncias das suas empresas
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

-- Ãndices
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from ON stock_transfers(from_company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to ON stock_transfers(to_company_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);


-- =========================================================================
-- ARQUIVO: sql/cancel_sale_atomic.sql
-- =========================================================================
-- ============================================================
-- RPC atÃ´mica para cancelamento/devoluÃ§Ã£o de venda
-- Garante: status da venda + estorno de estoque + lanÃ§amento financeiro
-- em uma Ãºnica transaÃ§Ã£o (tudo ou nada).
-- ============================================================

-- PRÃ‰-REQUISITO: execute estes ALTERs apenas uma vez
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION cancel_sale_atomic(
  p_sale_id        uuid,
  p_company_id     uuid,
  p_user_id        uuid,
  p_items          jsonb,       -- [{ "product_id": "...", "product_name": "...", "quantity": 2 }]
  p_refund_amount  numeric,
  p_reason         text DEFAULT 'DevoluÃ§Ã£o via PDV'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item           jsonb;
  v_current_stock  numeric;
  v_sale_status    text;
  v_sale_total     numeric;
BEGIN
  -- STEP 1: Validate sale exists and belongs to company
  SELECT status, total INTO v_sale_status, v_sale_total
  FROM sales
  WHERE id = p_sale_id AND company_id = p_company_id
  FOR UPDATE;

  IF v_sale_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venda nÃ£o encontrada');
  END IF;

  IF v_sale_status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venda jÃ¡ foi cancelada anteriormente');
  END IF;

  -- STEP 2: Restore stock for each returned item (with row lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT stock_quantity INTO v_current_stock
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_current_stock IS NOT NULL THEN
      UPDATE products
      SET stock_quantity = stock_quantity + (v_item->>'quantity')::numeric
      WHERE id = (v_item->>'product_id')::uuid;

      -- Register stock movement for audit
      INSERT INTO stock_movements (
        company_id, product_id, type, quantity, reason, reference, created_by
      ) VALUES (
        p_company_id,
        (v_item->>'product_id')::uuid,
        'devolucao',
        (v_item->>'quantity')::numeric,
        p_reason,
        p_sale_id::text,
        p_user_id
      );
    END IF;
  END LOOP;

  -- STEP 3: Update sale status with cancellation metadata
  UPDATE sales
  SET status = 'cancelada',
      canceled_at = now(),
      canceled_by = p_user_id
  WHERE id = p_sale_id;

  -- STEP 4: Create financial entry for the refund
  INSERT INTO financial_entries (
    company_id, type, description, reference, amount,
    due_date, paid_date, paid_amount, payment_method, status, created_by
  ) VALUES (
    p_company_id,
    'pagar',
    'DevoluÃ§Ã£o - Venda #' || LEFT(p_sale_id::text, 8),
    p_sale_id::text,
    p_refund_amount,
    CURRENT_DATE,
    CURRENT_DATE,
    p_refund_amount,
    'devolucao',
    'pago',
    p_user_id
  );

  -- STEP 5: Audit log
  INSERT INTO action_logs (company_id, user_id, action, module, details)
  VALUES (
    p_company_id,
    p_user_id,
    'sale_return_atomic',
    'pdv',
    jsonb_build_object(
      'sale_id', p_sale_id,
      'refund_amount', p_refund_amount,
      'original_total', v_sale_total,
      'returned_items', p_items,
      'reason', p_reason
    )::text
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'DevoluÃ§Ã£o processada com sucesso',
    'refund_amount', p_refund_amount
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/daily_reconciliation_cron.sql
-- =========================================================================
-- ============================================================
-- Agenda reconciliaÃ§Ã£o diÃ¡ria automÃ¡tica via pg_cron
-- Roda todo dia Ã s 06:00 (apÃ³s fechamentos noturnos)
-- ============================================================

SELECT cron.schedule(
  'daily-reconciliation',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-reconciliation',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object('date', (CURRENT_DATE - INTERVAL '1 day')::date::text)
  );
  $$
);


-- =========================================================================
-- ARQUIVO: sql/daily_report_cron.sql
-- =========================================================================
-- Agendar relatÃ³rio diÃ¡rio para rodar Ã s 22h (horÃ¡rio de BrasÃ­lia = 01:00 UTC do dia seguinte)
-- IMPORTANTE: Execute este SQL manualmente no Supabase SQL Editor
-- Substitua YOUR_ANON_KEY pela anon key do projeto e project-ref pelo ID do projeto

-- 1. Habilitar extensÃµes necessÃ¡rias
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Criar o cron job
select cron.schedule(
  'daily-report-22h',
  '0 1 * * *',  -- 01:00 UTC = 22:00 BRT
  $$
  select
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/daily-report',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);


-- =========================================================================
-- ARQUIVO: sql/demo_cleanup.sql
-- =========================================================================
-- =============================================
-- LIMPEZA AUTOMÃTICA DE CONTAS DEMO EXPIRADAS
-- Execute no SQL Editor do Supabase
-- =============================================

-- FunÃ§Ã£o que limpa empresas demo expiradas hÃ¡ mais de 30 dias
CREATE OR REPLACE FUNCTION public.cleanup_expired_demo_companies()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company RECORD;
  v_count INT := 0;
BEGIN
  -- Find demo companies with plans expired > 30 days ago
  FOR v_company IN
    SELECT c.id AS company_id
    FROM companies c
    JOIN company_plans cp ON cp.company_id = c.id
    WHERE c.is_demo = true
      AND cp.expires_at IS NOT NULL
      AND cp.expires_at < now() - INTERVAL '30 days'
  LOOP
    -- Delete sale_items via sales
    DELETE FROM sale_items WHERE sale_id IN (
      SELECT id FROM sales WHERE company_id = v_company.company_id
    );

    -- Delete financial entries
    DELETE FROM financial_entries WHERE company_id = v_company.company_id;

    -- Delete sales
    DELETE FROM sales WHERE company_id = v_company.company_id;

    -- Delete stock movements
    DELETE FROM stock_movements WHERE company_id = v_company.company_id;

    -- Delete products
    DELETE FROM products WHERE company_id = v_company.company_id;

    -- Delete clients
    DELETE FROM clients WHERE company_id = v_company.company_id;

    -- Delete cash sessions/movements
    DELETE FROM cash_movements WHERE company_id = v_company.company_id;
    DELETE FROM cash_sessions WHERE company_id = v_company.company_id;

    -- Delete company_users (will cascade to user sessions)
    DELETE FROM company_users WHERE company_id = v_company.company_id;

    -- Delete company plan
    DELETE FROM company_plans WHERE company_id = v_company.company_id;

    -- Delete the company itself
    DELETE FROM companies WHERE id = v_company.company_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Para agendar via pg_cron (execute separadamente se pg_cron estiver habilitado):
-- SELECT cron.schedule('cleanup-demo', '0 3 * * *', 'SELECT public.cleanup_expired_demo_companies()');


-- =========================================================================
-- ARQUIVO: sql/demo_mode.sql
-- =========================================================================
-- =============================================
-- MODO DEMONSTRAÃ‡ÃƒO - Colunas auxiliares
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1) Flag na tabela companies para marcar conta demo
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 2) Flag nos produtos para identificar dados demo
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 3) Flag nos clientes para identificar dados demo
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 4) Flag nas vendas para identificar dados demo
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;


-- =========================================================================
-- ARQUIVO: sql/finalize_sale_atomic.sql
-- =========================================================================
-- ============================================================
-- INSTRUÃ‡ÃƒO: Execute este SQL manualmente no Dashboard do Supabase
-- (SQL Editor) do projeto fsvxpxziotklbxkivyug
-- ============================================================

-- 1) Tabela sale_items (relacional, substitui JSONB em sales.items)
CREATE TABLE IF NOT EXISTS sale_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sale_id     uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  quantity    numeric NOT NULL CHECK (quantity > 0),
  unit_price  numeric NOT NULL,
  discount_percent numeric NOT NULL DEFAULT 0,
  subtotal    numeric NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_company ON sale_items(company_id);

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- Suggested baseline RLS (align with other tables): company members only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sale_items' AND policyname = 'sale_items_company_members'
  ) THEN
    EXECUTE $p$
      CREATE POLICY sale_items_company_members ON sale_items
      USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.is_active = true))
      WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid() AND cu.is_active = true));
    $p$;
  END IF;
END $$;

-- 2) FunÃ§Ã£o RPC atÃ´mica
CREATE OR REPLACE FUNCTION finalize_sale_atomic(
  p_company_id     uuid,
  p_terminal_id    text,
  p_session_id     uuid,
  p_items          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_val   numeric,
  p_total          numeric,
  p_payments       jsonb,
  p_sold_by        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id        uuid;
  v_item           jsonb;
  v_current_stock  numeric;
  v_product_name   text;
  v_session        record;
  v_uid            uuid;
  v_sum_items      numeric;
  v_sum_payments   numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- Authorization: user must belong to company
  IF NOT EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = v_uid AND cu.company_id = p_company_id AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- Validate session belongs to company and lock it
  SELECT total_vendas, total_dinheiro, total_debito, total_credito,
         total_pix, total_voucher, total_outros, sales_count, company_id, status
  INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL OR v_session.company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SessÃ£o de caixa invÃ¡lida');
  END IF;
  IF v_session.status IS NOT NULL AND v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa nÃ£o estÃ¡ aberto');
  END IF;

  -- Financial integrity: validate totals derived from items/payments (tolerance 1 cent)
  SELECT COALESCE(SUM((it->>'subtotal')::numeric), 0)
  INTO v_sum_items
  FROM jsonb_array_elements(p_items) it;

  SELECT COALESCE(SUM((pj->>'amount')::numeric), 0)
  INTO v_sum_payments
  FROM jsonb_array_elements(p_payments) pj;

  IF v_sum_items < 0 OR p_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total invÃ¡lido');
  END IF;
  IF abs(v_sum_payments - p_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Soma de pagamentos nÃ£o confere com o total');
  END IF;
  IF abs(v_sum_items - p_total) > 0.02 AND abs(v_sum_items - (p_total + COALESCE(p_discount_val,0))) > 0.02 THEN
    -- keep lenient due to rounding/discount splits, but block obvious tampering
    RETURN jsonb_build_object('success', false, 'error', 'Total nÃ£o confere com itens');
  END IF;

  -- STEP 1: Insert sale
  INSERT INTO sales (company_id, terminal_id, session_id, items, subtotal,
                     discount_percent, discount_value, total, payments, status, sold_by)
  VALUES (p_company_id, p_terminal_id, p_session_id, p_items, p_subtotal,
          p_discount_pct, p_discount_val, p_total, p_payments, 'completed', p_sold_by)
  RETURNING id INTO v_sale_id;

  -- STEP 2: Insert sale_items + decrement stock (with row lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (company_id, sale_id, product_id, product_name, quantity, unit_price, discount_percent, subtotal)
    VALUES (
      p_company_id,
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      (v_item->>'subtotal')::numeric
    );

    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Produto nÃ£o encontrado: %', v_item->>'product_id';
    END IF;

    IF v_current_stock < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": disponÃ­vel=%, solicitado=%',
        v_product_name, v_current_stock, (v_item->>'quantity')::numeric;
    END IF;

    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::numeric
    WHERE id = (v_item->>'product_id')::uuid;
  END LOOP;

  IF v_session IS NOT NULL THEN
    UPDATE cash_sessions SET
      total_vendas   = COALESCE(v_session.total_vendas, 0)   + p_total,
      sales_count    = COALESCE(v_session.sales_count, 0)    + 1,
      total_dinheiro = COALESCE(v_session.total_dinheiro, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'dinheiro'
      ), 0),
      total_debito = COALESCE(v_session.total_debito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'debito'
      ), 0),
      total_credito = COALESCE(v_session.total_credito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'credito'
      ), 0),
      total_pix = COALESCE(v_session.total_pix, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'pix'
      ), 0),
      total_voucher = COALESCE(v_session.total_voucher, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'voucher'
      ), 0),
      total_outros = COALESCE(v_session.total_outros, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj
        WHERE pj->>'method' NOT IN ('dinheiro','debito','credito','pix','voucher')
      ), 0)
    WHERE id = p_session_id;
  END IF;

  -- STEP 4: Financial entry
  INSERT INTO financial_entries (company_id, type, description, reference, amount,
                                 due_date, paid_date, paid_amount, payment_method, status, created_by)
  VALUES (
    p_company_id, 'receber',
    'Venda PDV #' || LEFT(v_sale_id::text, 8),
    v_sale_id::text, p_total, CURRENT_DATE, CURRENT_DATE, p_total,
    COALESCE(p_payments->0->>'method', 'outros'), 'pago',
    COALESCE(p_sold_by, v_uid)
  );

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'message', 'Venda finalizada com sucesso');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao finalizar venda');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/finalize_sale_discount_validation.sql
-- =========================================================================
-- ============================================================
-- Atualiza finalize_sale_atomic para validar desconto mÃ¡ximo
-- por role do usuÃ¡rio ANTES de aceitar a venda.
-- ============================================================

CREATE OR REPLACE FUNCTION finalize_sale_atomic(
  p_company_id     uuid,
  p_terminal_id    text,
  p_session_id     uuid,
  p_items          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_val   numeric,
  p_total          numeric,
  p_payments       jsonb,
  p_sold_by        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id        uuid;
  v_item           jsonb;
  v_current_stock  numeric;
  v_product_name   text;
  v_session        record;
  v_user_role      text;
  v_max_discount   numeric;
  v_item_discount  numeric;
  v_uid            uuid;
  v_sum_items      numeric;
  v_sum_payments   numeric;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = v_uid AND cu.company_id = p_company_id AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  SELECT total_vendas, total_dinheiro, total_debito, total_credito,
         total_pix, total_voucher, total_outros, sales_count, company_id, status
  INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL OR v_session.company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SessÃ£o de caixa invÃ¡lida');
  END IF;
  IF v_session.status IS NOT NULL AND v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa nÃ£o estÃ¡ aberto');
  END IF;

  SELECT COALESCE(SUM((it->>'subtotal')::numeric), 0)
  INTO v_sum_items
  FROM jsonb_array_elements(p_items) it;

  SELECT COALESCE(SUM((pj->>'amount')::numeric), 0)
  INTO v_sum_payments
  FROM jsonb_array_elements(p_payments) pj;

  IF v_sum_items < 0 OR p_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total invÃ¡lido');
  END IF;
  IF abs(v_sum_payments - p_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Soma de pagamentos nÃ£o confere com o total');
  END IF;
  IF abs(v_sum_items - p_total) > 0.02 AND abs(v_sum_items - (p_total + COALESCE(p_discount_val,0))) > 0.02 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total nÃ£o confere com itens');
  END IF;

  -- â•â•â• NEW: Validate discount against role limits â•â•â•
  IF p_sold_by IS NOT NULL AND p_discount_pct > 0 THEN
    SELECT cu.role INTO v_user_role
    FROM company_users cu
    WHERE cu.user_id = p_sold_by
      AND cu.company_id = p_company_id
      AND cu.is_active = true
    LIMIT 1;

    -- Check discount_limits table first, then fallback defaults
    SELECT dl.max_discount_percent INTO v_max_discount
    FROM discount_limits dl
    WHERE dl.company_id = p_company_id
      AND dl.role = COALESCE(v_user_role, 'caixa')
    LIMIT 1;

    IF v_max_discount IS NULL THEN
      v_max_discount := CASE COALESCE(v_user_role, 'caixa')
        WHEN 'admin' THEN 100
        WHEN 'gerente' THEN 50
        WHEN 'supervisor' THEN 20
        ELSE 5
      END;
    END IF;

    IF p_discount_pct > v_max_discount THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Desconto de %s%% excede o limite de %s%% para o cargo "%s"',
                        p_discount_pct, v_max_discount, COALESCE(v_user_role, 'caixa'))
      );
    END IF;

    -- Also validate per-item discounts
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_item_discount := COALESCE((v_item->>'discount_percent')::numeric, 0);
      IF v_item_discount > v_max_discount THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Desconto de %s%% no item "%s" excede o limite de %s%%',
                          v_item_discount, v_item->>'product_name', v_max_discount)
        );
      END IF;
    END LOOP;
  END IF;

  -- STEP 1: Insert sale
  INSERT INTO sales (company_id, terminal_id, session_id, items, subtotal,
                     discount_percent, discount_value, total, payments, status, sold_by)
  VALUES (p_company_id, p_terminal_id, p_session_id, p_items, p_subtotal,
          p_discount_pct, p_discount_val, p_total, p_payments, 'completed', p_sold_by)
  RETURNING id INTO v_sale_id;

  -- STEP 2: Insert sale_items + decrement stock (with row lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, discount_percent, subtotal, company_id)
    VALUES (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      (v_item->>'subtotal')::numeric,
      p_company_id
    );

    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Produto nÃ£o encontrado: %', v_item->>'product_id';
    END IF;

    IF v_current_stock < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": disponÃ­vel=%, solicitado=%',
        v_product_name, v_current_stock, (v_item->>'quantity')::numeric;
    END IF;

    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::numeric
    WHERE id = (v_item->>'product_id')::uuid;
  END LOOP;

  IF v_session IS NOT NULL THEN
    UPDATE cash_sessions SET
      total_vendas   = COALESCE(v_session.total_vendas, 0)   + p_total,
      sales_count    = COALESCE(v_session.sales_count, 0)    + 1,
      total_dinheiro = COALESCE(v_session.total_dinheiro, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'dinheiro'
      ), 0),
      total_debito = COALESCE(v_session.total_debito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'debito'
      ), 0),
      total_credito = COALESCE(v_session.total_credito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'credito'
      ), 0),
      total_pix = COALESCE(v_session.total_pix, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'pix'
      ), 0),
      total_voucher = COALESCE(v_session.total_voucher, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'voucher'
      ), 0),
      total_outros = COALESCE(v_session.total_outros, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj
        WHERE pj->>'method' NOT IN ('dinheiro','debito','credito','pix','voucher')
      ), 0)
    WHERE id = p_session_id;
  END IF;

  -- STEP 4: Financial entry
  INSERT INTO financial_entries (company_id, type, description, reference, amount,
                                 due_date, paid_date, paid_amount, payment_method, status, created_by)
  VALUES (
    p_company_id, 'receber',
    'Venda PDV #' || LEFT(v_sale_id::text, 8),
    v_sale_id::text, p_total, CURRENT_DATE, CURRENT_DATE, p_total,
    COALESCE(p_payments->0->>'method', 'outros'), 'pago',
    COALESCE(p_sold_by, v_uid)
  );

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'message', 'Venda finalizada com sucesso');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao finalizar venda');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/fiscal_performance_indexes.sql
-- =========================================================================
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- Ãndices de performance para tabelas fiscais + financeiras
-- + ExpiraÃ§Ã£o automÃ¡tica de sessÃµes de caixa abertas > 24h
-- + ReconciliaÃ§Ã£o vendas x fiscal_documents
-- + IdempotÃªncia em mark_financial_entry_paid
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- 1) Ãndices de performance em fiscal_documents
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_company_status
  ON fiscal_documents (company_id, status);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_created_at
  ON fiscal_documents (company_id, created_at DESC);

-- 2) Ãndices de performance em fiscal_queue
CREATE INDEX IF NOT EXISTS idx_fiscal_queue_status_created
  ON fiscal_queue (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_fiscal_queue_company_status
  ON fiscal_queue (company_id, status);

-- 3) Ãndice em financial_entries para idempotÃªncia
CREATE INDEX IF NOT EXISTS idx_financial_entries_company_status
  ON financial_entries (company_id, status);

-- 4) ExpiraÃ§Ã£o automÃ¡tica de sessÃµes de caixa abertas hÃ¡ mais de 24h
CREATE OR REPLACE FUNCTION auto_expire_stale_cash_sessions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
BEGIN
  FOR v_session IN
    SELECT id, company_id, opened_by
    FROM cash_sessions
    WHERE status = 'aberto'
      AND opened_at < now() - INTERVAL '24 hours'
  LOOP
    UPDATE cash_sessions
    SET status = 'expirado',
        closed_at = now(),
        notes = COALESCE(notes, '') || ' [Auto-expirado apÃ³s 24h]'
    WHERE id = v_session.id;

    -- Notificar admin
    INSERT INTO notifications (company_id, user_id, title, message, type)
    SELECT
      v_session.company_id,
      cu.user_id,
      'Caixa expirado automaticamente',
      'Uma sessÃ£o de caixa aberta hÃ¡ mais de 24 horas foi encerrada automaticamente. Verifique os valores.',
      'warning'
    FROM company_users cu
    WHERE cu.company_id = v_session.company_id
      AND cu.is_active = true
      AND cu.role IN ('admin', 'gerente');

    INSERT INTO action_logs (company_id, user_id, action, module, details)
    VALUES (
      v_session.company_id,
      v_session.opened_by,
      'SessÃ£o de caixa expirada automaticamente (>24h)',
      'caixa',
      jsonb_build_object('session_id', v_session.id)::text
    );
  END LOOP;
END;
$$;

-- Agendar para rodar a cada hora
SELECT cron.schedule(
  'auto-expire-cash-sessions',
  '0 * * * *',
  $$SELECT auto_expire_stale_cash_sessions()$$
);

-- 5) ReconciliaÃ§Ã£o vendas x fiscal_documents (diÃ¡ria)
CREATE OR REPLACE FUNCTION reconcile_sales_fiscal_documents()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company record;
  v_orphan_count int;
  v_mismatch_count int;
  v_admin record;
  v_details text;
BEGIN
  FOR v_company IN
    SELECT id, name FROM companies WHERE is_active = true
  LOOP
    -- Vendas autorizadas sem fiscal_document correspondente
    SELECT count(*) INTO v_orphan_count
    FROM sales s
    WHERE s.company_id = v_company.id
      AND s.status = 'autorizada'
      AND s.created_at > now() - INTERVAL '48 hours'
      AND NOT EXISTS (
        SELECT 1 FROM fiscal_documents fd
        WHERE fd.sale_id = s.id
          AND fd.status = 'autorizada'
      );

    -- fiscal_documents autorizados sem venda correspondente
    SELECT count(*) INTO v_mismatch_count
    FROM fiscal_documents fd
    WHERE fd.company_id = v_company.id
      AND fd.status = 'autorizada'
      AND fd.created_at > now() - INTERVAL '48 hours'
      AND fd.sale_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sales s
        WHERE s.id = fd.sale_id
          AND (s.status IS NULL OR s.status NOT IN ('cancelada'))
      );

    IF v_orphan_count > 0 OR v_mismatch_count > 0 THEN
      v_details := '';
      IF v_orphan_count > 0 THEN
        v_details := v_orphan_count || ' venda(s) autorizada(s) sem documento fiscal. ';
      END IF;
      IF v_mismatch_count > 0 THEN
        v_details := v_details || v_mismatch_count || ' documento(s) fiscal(is) sem venda vÃ¡lida.';
      END IF;

      FOR v_admin IN
        SELECT user_id FROM company_users
        WHERE company_id = v_company.id
          AND is_active = true
          AND role IN ('admin', 'gerente')
      LOOP
        INSERT INTO notifications (company_id, user_id, title, message, type)
        VALUES (
          v_company.id,
          v_admin.user_id,
          'âš ï¸ DivergÃªncia Vendas x Fiscal',
          v_details || ' Verifique em Fiscal > Documentos.',
          'warning'
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

-- Agendar reconciliaÃ§Ã£o vendas x fiscal para 06:30 UTC (apÃ³s reconciliaÃ§Ã£o financeira Ã s 06:00)
SELECT cron.schedule(
  'reconcile-sales-fiscal',
  '30 6 * * *',
  $$SELECT reconcile_sales_fiscal_documents()$$
);


-- =========================================================================
-- ARQUIVO: sql/fix_stock_transfers_rls.sql
-- =========================================================================
-- =============================================
-- FIX: Allow destination branch to UPDATE stock_transfers (receive)
-- Execute no Supabase SQL Editor
-- =============================================

-- Drop the old combined policy
DROP POLICY IF EXISTS "Users see own company transfers" ON stock_transfers;

-- 1) SELECT: both origin and destination can read
CREATE POLICY "Users can view own transfers" ON stock_transfers
  FOR SELECT TO authenticated
  USING (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- 2) INSERT: only origin company can create
CREATE POLICY "Users can create transfers from own company" ON stock_transfers
  FOR INSERT TO authenticated
  WITH CHECK (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- 3) UPDATE: both origin and destination can update (origin cancels, destination receives)
CREATE POLICY "Users can update own transfers" ON stock_transfers
  FOR UPDATE TO authenticated
  USING (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  )
  WITH CHECK (
    from_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
    OR to_company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid() AND is_active = true)
  );


-- =========================================================================
-- ARQUIVO: sql/furniture_mode.sql
-- =========================================================================
-- =====================================================
-- Furniture Mode: Full Schema Migration
-- Tables for all 10 differentiating features
-- =====================================================

-- 1. Before & After Gallery
CREATE TABLE IF NOT EXISTS public.furniture_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  room TEXT NOT NULL,
  description TEXT DEFAULT '',
  before_url TEXT DEFAULT '',
  after_url TEXT DEFAULT '',
  rating INTEGER DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.furniture_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "furniture_projects_company" ON public.furniture_projects
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 2. Room Measurements
CREATE TABLE IF NOT EXISTS public.room_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  room TEXT NOT NULL,
  notes TEXT DEFAULT '',
  walls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.room_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_measurements_company" ON public.room_measurements
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 3. Technical Assistance Tickets
CREATE TABLE IF NOT EXISTS public.technical_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_number TEXT NOT NULL,
  client_name TEXT NOT NULL,
  product TEXT NOT NULL,
  issue TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_andamento','aguardando_peca','concluido')),
  priority TEXT NOT NULL DEFAULT 'media' CHECK (priority IN ('baixa','media','alta','urgente')),
  sla_deadline DATE,
  notes JSONB DEFAULT '[]'::jsonb,
  photos TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.technical_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "technical_tickets_company" ON public.technical_tickets
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 4. Credit System (CrediÃ¡rio)
CREATE TABLE IF NOT EXISTS public.credit_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id),
  name TEXT NOT NULL,
  cpf TEXT,
  phone TEXT,
  score INTEGER DEFAULT 500 CHECK (score >= 0 AND score <= 1000),
  credit_limit NUMERIC(12,2) DEFAULT 0,
  credit_used NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado','inadimplente')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_clients_company" ON public.credit_clients
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS public.credit_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_client_id UUID NOT NULL REFERENCES public.credit_clients(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id TEXT,
  installment_number TEXT NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  due_date DATE NOT NULL,
  paid BOOLEAN DEFAULT false,
  paid_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.credit_installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_installments_company" ON public.credit_installments
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 5. Room Plans (Montador de Ambientes)
CREATE TABLE IF NOT EXISTS public.room_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Novo Ambiente',
  items JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.room_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_plans_company" ON public.room_plans
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 6. Delivery Tracking
CREATE TABLE IF NOT EXISTS public.delivery_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  address TEXT NOT NULL,
  driver_name TEXT,
  driver_phone TEXT,
  status TEXT DEFAULT 'em_separacao' CHECK (status IN ('em_separacao','em_rota','proximo','entregue')),
  eta TEXT,
  timeline JSONB DEFAULT '[]'::jsonb,
  tracking_code TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at TIMESTAMPTZ DEFAULT now(),
  delivered_at TIMESTAMPTZ
);

ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "delivery_tracking_company" ON public.delivery_tracking
  FOR ALL TO authenticated
  USING (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()))
  WITH CHECK (company_id IN (SELECT cu.company_id FROM public.company_users cu WHERE cu.user_id = auth.uid()));

-- 7. Storage bucket for furniture photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('furniture-photos', 'furniture-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "furniture_photos_select" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'furniture-photos');

CREATE POLICY "furniture_photos_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'furniture-photos');

CREATE POLICY "furniture_photos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'furniture-photos');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_furniture_projects_company ON public.furniture_projects(company_id);
CREATE INDEX IF NOT EXISTS idx_room_measurements_company ON public.room_measurements(company_id);
CREATE INDEX IF NOT EXISTS idx_technical_tickets_company ON public.technical_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_technical_tickets_status ON public.technical_tickets(company_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_clients_company ON public.credit_clients(company_id);
CREATE INDEX IF NOT EXISTS idx_credit_installments_client ON public.credit_installments(credit_client_id);
CREATE INDEX IF NOT EXISTS idx_credit_installments_due ON public.credit_installments(company_id, due_date) WHERE NOT paid;
CREATE INDEX IF NOT EXISTS idx_room_plans_company ON public.room_plans(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_company ON public.delivery_tracking(company_id);
CREATE INDEX IF NOT EXISTS idx_delivery_tracking_status ON public.delivery_tracking(company_id, status);


-- =========================================================================
-- ARQUIVO: sql/idempotency_key_sales.sql
-- =========================================================================
-- ============================================================
-- Adiciona idempotency_key na tabela sales e atualiza a RPC
-- finalize_sale_atomic para evitar vendas duplicadas por retry.
-- ============================================================

-- 1) Coluna idempotency_key (nullable para vendas antigas)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS idempotency_key uuid UNIQUE;

CREATE INDEX IF NOT EXISTS idx_sales_idempotency ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2) Atualiza a RPC para aceitar e validar idempotency_key
CREATE OR REPLACE FUNCTION finalize_sale_atomic(
  p_company_id     uuid,
  p_terminal_id    text,
  p_session_id     uuid,
  p_items          jsonb,
  p_subtotal       numeric,
  p_discount_pct   numeric,
  p_discount_val   numeric,
  p_total          numeric,
  p_payments       jsonb,
  p_sold_by        uuid DEFAULT NULL,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id        uuid;
  v_item           jsonb;
  v_current_stock  numeric;
  v_product_name   text;
  v_session        record;
  v_user_role      text;
  v_max_discount   numeric;
  v_item_discount  numeric;
  v_uid            uuid;
  v_sum_items      numeric;
  v_sum_payments   numeric;
  v_existing_sale  uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = v_uid AND cu.company_id = p_company_id AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  -- â•â•â• IDEMPOTENCY CHECK â•â•â•
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_sale
    FROM sales
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_sale IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale, 'message', 'Venda jÃ¡ processada (idempotente)');
    END IF;
  END IF;

  SELECT total_vendas, total_dinheiro, total_debito, total_credito,
         total_pix, total_voucher, total_outros, sales_count, company_id, status
  INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL OR v_session.company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SessÃ£o de caixa invÃ¡lida');
  END IF;
  IF v_session.status IS NOT NULL AND v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa nÃ£o estÃ¡ aberto');
  END IF;

  SELECT COALESCE(SUM((it->>'subtotal')::numeric), 0)
  INTO v_sum_items
  FROM jsonb_array_elements(p_items) it;

  SELECT COALESCE(SUM((pj->>'amount')::numeric), 0)
  INTO v_sum_payments
  FROM jsonb_array_elements(p_payments) pj;

  IF v_sum_items < 0 OR p_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total invÃ¡lido');
  END IF;
  IF abs(v_sum_payments - p_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Soma de pagamentos nÃ£o confere com o total');
  END IF;
  IF abs(v_sum_items - p_total) > 0.02 AND abs(v_sum_items - (p_total + COALESCE(p_discount_val,0))) > 0.02 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total nÃ£o confere com itens');
  END IF;

  -- â•â•â• Validate discount against role limits â•â•â•
  IF p_sold_by IS NOT NULL AND p_discount_pct > 0 THEN
    SELECT cu.role INTO v_user_role
    FROM company_users cu
    WHERE cu.user_id = p_sold_by
      AND cu.company_id = p_company_id
      AND cu.is_active = true
    LIMIT 1;

    SELECT dl.max_discount_percent INTO v_max_discount
    FROM discount_limits dl
    WHERE dl.company_id = p_company_id
      AND dl.role = COALESCE(v_user_role, 'caixa')
    LIMIT 1;

    IF v_max_discount IS NULL THEN
      v_max_discount := CASE COALESCE(v_user_role, 'caixa')
        WHEN 'admin' THEN 100
        WHEN 'gerente' THEN 50
        WHEN 'supervisor' THEN 20
        ELSE 5
      END;
    END IF;

    IF p_discount_pct > v_max_discount THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Desconto de %s%% excede o limite de %s%% para o cargo "%s"',
                        p_discount_pct, v_max_discount, COALESCE(v_user_role, 'caixa'))
      );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_item_discount := COALESCE((v_item->>'discount_percent')::numeric, 0);
      IF v_item_discount > v_max_discount THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Desconto de %s%% no item "%s" excede o limite de %s%%',
                          v_item_discount, v_item->>'product_name', v_max_discount)
        );
      END IF;
    END LOOP;
  END IF;

  -- STEP 1: Insert sale (with idempotency_key)
  INSERT INTO sales (company_id, terminal_id, session_id, items, subtotal,
                     discount_percent, discount_value, total, payments, status, sold_by, idempotency_key)
  VALUES (p_company_id, p_terminal_id, p_session_id, p_items, p_subtotal,
          p_discount_pct, p_discount_val, p_total, p_payments, 'completed', p_sold_by, p_idempotency_key)
  RETURNING id INTO v_sale_id;

  -- STEP 2: Insert sale_items + decrement stock (with row lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, discount_percent, subtotal, company_id)
    VALUES (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      (v_item->>'quantity')::numeric,
      (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'discount_percent')::numeric, 0),
      (v_item->>'subtotal')::numeric,
      p_company_id
    );

    SELECT stock_quantity, name INTO v_current_stock, v_product_name
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_current_stock IS NULL THEN
      RAISE EXCEPTION 'Produto nÃ£o encontrado: %', v_item->>'product_id';
    END IF;

    IF v_current_stock < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": disponÃ­vel=%, solicitado=%',
        v_product_name, v_current_stock, (v_item->>'quantity')::numeric;
    END IF;

    UPDATE products
    SET stock_quantity = stock_quantity - (v_item->>'quantity')::numeric
    WHERE id = (v_item->>'product_id')::uuid;
  END LOOP;

  IF v_session IS NOT NULL THEN
    UPDATE cash_sessions SET
      total_vendas   = COALESCE(v_session.total_vendas, 0)   + p_total,
      sales_count    = COALESCE(v_session.sales_count, 0)    + 1,
      total_dinheiro = COALESCE(v_session.total_dinheiro, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'dinheiro'
      ), 0),
      total_debito = COALESCE(v_session.total_debito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'debito'
      ), 0),
      total_credito = COALESCE(v_session.total_credito, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'credito'
      ), 0),
      total_pix = COALESCE(v_session.total_pix, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'pix'
      ), 0),
      total_voucher = COALESCE(v_session.total_voucher, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj WHERE pj->>'method' = 'voucher'
      ), 0),
      total_outros = COALESCE(v_session.total_outros, 0) + COALESCE((
        SELECT SUM((pj->>'amount')::numeric) FROM jsonb_array_elements(p_payments) pj
        WHERE pj->>'method' NOT IN ('dinheiro','debito','credito','pix','voucher')
      ), 0)
    WHERE id = p_session_id;
  END IF;

  -- STEP 4: Financial entry
  INSERT INTO financial_entries (company_id, type, description, reference, amount,
                                 due_date, paid_date, paid_amount, payment_method, status, created_by)
  VALUES (
    p_company_id, 'receber',
    'Venda PDV #' || LEFT(v_sale_id::text, 8),
    v_sale_id::text, p_total, CURRENT_DATE, CURRENT_DATE, p_total,
    COALESCE(p_payments->0->>'method', 'outros'), 'pago',
    COALESCE(p_sold_by, v_uid)
  );

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'message', 'Venda finalizada com sucesso');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao finalizar venda');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/kits_followup_returns.sql
-- =========================================================================
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
-- GESTÃƒO DE TROCAS E DEVOLUÃ‡Ã•ES
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


-- =========================================================================
-- ARQUIVO: sql/log_retention.sql
-- =========================================================================
-- =====================================================
-- RetenÃ§Ã£o AutomÃ¡tica de Logs (Cron)
-- Arquiva logs com mais de 90 dias
-- Execute no Supabase SQL Editor
-- =====================================================

-- 1. Tabela de arquivo de logs antigos
CREATE TABLE IF NOT EXISTS public.action_logs_archive (
  id UUID PRIMARY KEY,
  company_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,
  module TEXT,
  details TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE public.action_logs_archive ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_admin_select" ON public.action_logs_archive
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

CREATE INDEX IF NOT EXISTS idx_archive_company ON public.action_logs_archive(company_id);
CREATE INDEX IF NOT EXISTS idx_archive_created ON public.action_logs_archive(created_at DESC);

-- 2. FunÃ§Ã£o de arquivamento
CREATE OR REPLACE FUNCTION public.archive_old_action_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ := now() - INTERVAL '90 days';
  moved INT;
BEGIN
  -- Move logs antigos para archive
  INSERT INTO action_logs_archive (id, company_id, user_id, action, module, details, user_name, created_at)
  SELECT id, company_id, user_id, action, module, details, user_name, created_at
  FROM action_logs
  WHERE created_at < cutoff
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS moved = ROW_COUNT;

  -- Remove da tabela principal
  DELETE FROM action_logs WHERE created_at < cutoff;

  RAISE NOTICE 'Archived % action_logs older than 90 days', moved;
END;
$$;

-- 3. Cron job (requer pg_cron habilitado)
-- Executa todo domingo Ã s 3h da manhÃ£
SELECT cron.schedule(
  'archive-old-logs',
  '0 3 * * 0',
  $$SELECT public.archive_old_action_logs()$$
);

-- 4. RetenÃ§Ã£o de system_errors (180 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_system_errors()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM system_errors WHERE created_at < now() - INTERVAL '180 days';
END;
$$;

SELECT cron.schedule(
  'cleanup-old-errors',
  '0 4 * * 0',
  $$SELECT public.cleanup_old_system_errors()$$
);


-- =========================================================================
-- ARQUIVO: sql/mark_financial_entry_paid_atomic.sql
-- =========================================================================
-- Atomic settlement of financial entries with optional cash session movement
-- Execute in Supabase SQL editor / migration pipeline.

CREATE OR REPLACE FUNCTION public.mark_financial_entry_paid_atomic(
  p_company_id uuid,
  p_entry_id uuid,
  p_paid_amount numeric,
  p_payment_method text,
  p_performed_by uuid,
  p_idempotency_key uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_entry record;
  v_session record;
  v_method text;
  v_payment_field text;
  v_movement_id uuid;
  v_session_id uuid := null;
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_entry record;
  v_session record;
  v_method text;
  v_payment_field text;
  v_movement_id uuid;
  v_session_id uuid := null;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  -- IdempotÃªncia: se a mesma chave jÃ¡ processou, retornar sucesso sem duplicar
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM action_logs
      WHERE company_id = p_company_id
        AND action = 'mark_paid_idempotent'
        AND details LIKE '%' || p_idempotency_key::text || '%'
    ) THEN
      RETURN jsonb_build_object('success', true, 'idempotent_hit', true, 'entry_id', p_entry_id);
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.user_id = v_uid
      AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF p_entry_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'LanÃ§amento invÃ¡lido');
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor pago invÃ¡lido');
  END IF;

  v_method := lower(coalesce(trim(p_payment_method), 'dinheiro'));
  IF v_method = '' THEN
    v_method := 'dinheiro';
  END IF;

  -- Keep payment method aligned to enum values used by cash_movements.
  IF v_method NOT IN ('dinheiro','pix','debito','credito','voucher','outros','prazo') THEN
    v_method := 'outros';
  END IF;

  SELECT *
  INTO v_entry
  FROM financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'LanÃ§amento nÃ£o encontrado');
  END IF;

  IF v_entry.status = 'pago' THEN
    RETURN jsonb_build_object('success', true, 'already_paid', true, 'entry_id', p_entry_id);
  END IF;

  UPDATE financial_entries
  SET
    status = 'pago',
    paid_amount = p_paid_amount,
    paid_date = current_date,
    payment_method = v_method,
    updated_at = now()
  WHERE id = p_entry_id
    AND company_id = p_company_id;

  -- Only "receber" affects cash register totals.
  IF v_entry.type = 'receber' THEN
    SELECT *
    INTO v_session
    FROM cash_sessions cs
    WHERE cs.company_id = p_company_id
      AND cs.status = 'aberto'
    ORDER BY cs.opened_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      v_session_id := v_session.id;
      v_payment_field := CASE
        WHEN v_method = 'dinheiro' THEN 'total_dinheiro'
        WHEN v_method = 'pix' THEN 'total_pix'
        WHEN v_method = 'debito' THEN 'total_debito'
        WHEN v_method = 'credito' THEN 'total_credito'
        WHEN v_method = 'voucher' THEN 'total_voucher'
        ELSE 'total_outros'
      END;

      INSERT INTO cash_movements (
        company_id,
        session_id,
        type,
        amount,
        performed_by,
        payment_method,
        description,
        sale_id
      ) VALUES (
        p_company_id,
        v_session.id,
        'suprimento',
        p_paid_amount,
        coalesce(p_performed_by, v_uid),
        v_method::payment_method,
        'Recebimento: ' || coalesce(v_entry.description, 'LanÃ§amento financeiro'),
        NULL
      )
      RETURNING id INTO v_movement_id;

      EXECUTE format(
        'UPDATE cash_sessions
           SET %I = coalesce(%I, 0) + $1,
               total_suprimento = coalesce(total_suprimento, 0) + $1
         WHERE id = $2',
        v_payment_field,
        v_payment_field
      )
      USING p_paid_amount, v_session.id;
    END IF;
  END IF;

  -- Registrar idempotency key para prevenir duplicidade
  IF p_idempotency_key IS NOT NULL THEN
    INSERT INTO action_logs (company_id, user_id, action, module, details)
    VALUES (p_company_id, v_uid, 'mark_paid_idempotent', 'financeiro',
            jsonb_build_object('entry_id', p_entry_id, 'idempotency_key', p_idempotency_key, 'amount', p_paid_amount)::text);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', p_entry_id,
    'movement_id', v_movement_id,
    'session_id', v_session_id
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao registrar pagamento');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/mark_financial_entry_paid_atomic_validation.sql
-- =========================================================================
-- Validation script for mark_financial_entry_paid_atomic
-- Run each block independently in Supabase SQL Editor.
-- Replace placeholders before executing.

/*
PLACEHOLDERS
  {{USER_ID}}     -> authenticated user uuid (company member)
  {{COMPANY_ID}}  -> company uuid
  {{ENTRY_ID}}    -> financial_entries.id to be paid
  {{AMOUNT}}      -> positive numeric amount
*/

-- ============================================================
-- BLOCK 1) SAFE TEST WITH PIX (ROLLBACK)
-- ============================================================
begin;

select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_financial_entry_paid_atomic(
  '{{COMPANY_ID}}'::uuid,
  '{{ENTRY_ID}}'::uuid,
  {{AMOUNT}},
  'pix',
  '{{USER_ID}}'::uuid
) as result;

-- Validation: entry fields
select id, status, paid_amount, paid_date, payment_method, updated_at
from financial_entries
where id = '{{ENTRY_ID}}'::uuid;

-- Validation: latest movements
select id, session_id, type, amount, payment_method, description, created_at
from cash_movements
where company_id = '{{COMPANY_ID}}'::uuid
order by created_at desc
limit 5;

-- Validation: opened cash session totals
select id, status, total_suprimento, total_dinheiro, total_pix, total_debito, total_credito, total_voucher, total_outros
from cash_sessions
where company_id = '{{COMPANY_ID}}'::uuid
  and status = 'aberto'
order by opened_at desc
limit 1;

rollback;

-- ============================================================
-- BLOCK 2) IDEMPOTENCY TEST (already_paid)
-- ============================================================
-- Use an entry that is already paid.
-- Expected result JSON:
--   { "success": true, "already_paid": true, "entry_id": "..." }

begin;

select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.mark_financial_entry_paid_atomic(
  '{{COMPANY_ID}}'::uuid,
  '{{ENTRY_ID}}'::uuid,
  {{AMOUNT}},
  'pix',
  '{{USER_ID}}'::uuid
) as result;

rollback;

-- ============================================================
-- BLOCK 3) EFFECTIVE EXECUTION (COMMIT)
-- ============================================================
-- Execute only after successful rollback tests.

-- begin;
-- select set_config('request.jwt.claim.sub', '{{USER_ID}}', true);
-- select set_config('request.jwt.claim.role', 'authenticated', true);
--
-- select public.mark_financial_entry_paid_atomic(
--   '{{COMPANY_ID}}'::uuid,
--   '{{ENTRY_ID}}'::uuid,
--   {{AMOUNT}},
--   'pix',
--   '{{USER_ID}}'::uuid
-- ) as result;
--
-- commit;

-- ============================================================
-- BLOCK 4) POST-COMMIT FINAL CHECK
-- ============================================================
-- select id, status, paid_amount, paid_date, payment_method, updated_at
-- from financial_entries
-- where id = '{{ENTRY_ID}}'::uuid;
--
-- select id, session_id, type, amount, payment_method, description, created_at
-- from cash_movements
-- where company_id = '{{COMPANY_ID}}'::uuid
-- order by created_at desc
-- limit 5;
--
-- select id, status, total_suprimento, total_dinheiro, total_pix, total_debito, total_credito, total_voucher, total_outros
-- from cash_sessions
-- where company_id = '{{COMPANY_ID}}'::uuid
--   and status = 'aberto'
-- order by opened_at desc
-- limit 1;


-- =========================================================================
-- ARQUIVO: sql/nfe_imports.sql
-- =========================================================================
-- Tabela para controle de NF-e jÃ¡ importadas (evitar duplicidade)
CREATE TABLE IF NOT EXISTS nfe_imports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access_key text NOT NULL,            -- chave de acesso (44 dÃ­gitos)
  nfe_number text,                     -- nÃºmero da NF-e
  supplier_name text,
  supplier_cnpj text,
  total_value numeric(12,2),
  products_count integer,
  imported_at timestamptz DEFAULT now(),
  imported_by uuid REFERENCES auth.users(id),
  UNIQUE(company_id, access_key)
);

-- RLS
ALTER TABLE nfe_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company nfe_imports"
  ON nfe_imports FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own company nfe_imports"
  ON nfe_imports FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));


-- =========================================================================
-- ARQUIVO: sql/notas_recebidas.sql
-- =========================================================================
-- Tabela para persistir NF-e recebidas da SEFAZ (via DF-e / Nuvem Fiscal)
CREATE TABLE IF NOT EXISTS notas_recebidas (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  chave_nfe text NOT NULL,
  nsu bigint,
  cnpj_emitente text,
  nome_emitente text,
  data_emissao timestamptz,
  valor_total numeric(12,2),
  numero_nfe integer,
  serie integer,
  schema_tipo text DEFAULT 'NF-e',
  situacao text DEFAULT 'resumo',          -- resumo | manifesto | completo
  status_manifestacao text DEFAULT 'pendente', -- pendente | ciencia | confirmado | desconhecido | nao_realizada
  xml_completo text,
  nuvem_fiscal_id text,                    -- ID do documento na Nuvem Fiscal
  importado boolean DEFAULT false,         -- se jÃ¡ foi importado para estoque
  importado_em timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(company_id, chave_nfe)
);

-- Tabela para controlar Ãºltimo NSU consultado por empresa
CREATE TABLE IF NOT EXISTS dfe_sync_control (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  ultimo_nsu bigint DEFAULT 0,
  ultima_consulta timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE notas_recebidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE dfe_sync_control ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own company notas_recebidas"
  ON notas_recebidas FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert own company notas_recebidas"
  ON notas_recebidas FOR INSERT
  WITH CHECK (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update own company notas_recebidas"
  ON notas_recebidas FOR UPDATE
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access notas_recebidas"
  ON notas_recebidas FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can view own dfe_sync_control"
  ON dfe_sync_control FOR SELECT
  USING (company_id IN (
    SELECT company_id FROM company_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Service role full access dfe_sync_control"
  ON dfe_sync_control FOR ALL
  USING (true)
  WITH CHECK (true);

-- Ãndices
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_company ON notas_recebidas(company_id);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_chave ON notas_recebidas(chave_nfe);
CREATE INDEX IF NOT EXISTS idx_notas_recebidas_situacao ON notas_recebidas(company_id, situacao);


-- =========================================================================
-- ARQUIVO: sql/payment_webhook_logs.sql
-- =========================================================================
-- =============================================
-- TABELA DE LOGS DE WEBHOOK DE PAGAMENTO
-- Execute no Supabase SQL Editor
-- =============================================

CREATE TABLE IF NOT EXISTS public.payment_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id TEXT,
  event_type TEXT NOT NULL,
  status TEXT,
  amount NUMERIC(12,2),
  plan_key TEXT,
  user_id UUID,
  company_id UUID,
  raw_payload JSONB,
  error_message TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_webhook_logs ENABLE ROW LEVEL SECURITY;

-- Somente super admins podem ler logs de webhook
CREATE POLICY "Super admins read webhook logs" ON public.payment_webhook_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Ãndices para consulta eficiente
CREATE INDEX IF NOT EXISTS idx_webhook_logs_mp_payment ON public.payment_webhook_logs(mp_payment_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created ON public.payment_webhook_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_unprocessed ON public.payment_webhook_logs(processed) WHERE processed = false;


-- =========================================================================
-- ARQUIVO: sql/payments_system.sql
-- =========================================================================
-- =============================================
-- SISTEMA DE PAGAMENTOS E RENOVAÃ‡ÃƒO - AnthOS
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Tabela payments
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan_key TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  method TEXT, -- 'pix', 'credit_card', 'boleto', 'mp_balance'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'refunded'
  transaction_id TEXT UNIQUE,
  mp_preference_id TEXT,
  mp_payment_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON public.payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_mp_payment ON public.payments(mp_payment_id);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Users can see their company's payments
DROP POLICY IF EXISTS "Users see own company payments" ON public.payments;
CREATE POLICY "Users see own company payments" ON public.payments
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

-- Super admins can see all
DROP POLICY IF EXISTS "Super admins manage payments" ON public.payments;
CREATE POLICY "Super admins manage payments" ON public.payments
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- 2) Function to process approved payment (SECURITY DEFINER - called by webhook)
CREATE OR REPLACE FUNCTION public.process_payment_approval(
  p_mp_payment_id TEXT,
  p_transaction_id TEXT,
  p_method TEXT,
  p_amount NUMERIC,
  p_user_id UUID,
  p_plan_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_payment_id UUID;
  v_existing_payment UUID;
BEGIN
  -- Idempotency: check if already processed
  SELECT id INTO v_existing_payment
  FROM public.payments
  WHERE mp_payment_id = p_mp_payment_id AND status = 'approved';
  
  IF v_existing_payment IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'action', 'already_processed', 'payment_id', v_existing_payment);
  END IF;

  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Empresa nÃ£o encontrada para o usuÃ¡rio.');
  END IF;

  -- Insert payment record
  INSERT INTO public.payments (company_id, user_id, plan_key, amount, method, status, transaction_id, mp_payment_id)
  VALUES (v_company_id, p_user_id, p_plan_key, p_amount, p_method, 'approved', p_transaction_id, p_mp_payment_id)
  RETURNING id INTO v_payment_id;

  -- Update subscription: extend 30 days from now (or from current expiry if still active)
  UPDATE public.subscriptions
  SET status = 'active',
      subscription_end = GREATEST(
        now() + INTERVAL '30 days',
        COALESCE(subscription_end, now()) + INTERVAL '30 days'
      ),
      plan_key = p_plan_key,
      updated_at = now()
  WHERE user_id = p_user_id;

  -- If no subscription exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.subscriptions (user_id, plan_key, status, subscription_end, created_at)
    VALUES (p_user_id, p_plan_key, 'active', now() + INTERVAL '30 days', now());
  END IF;

  RETURN jsonb_build_object('success', true, 'action', 'approved', 'payment_id', v_payment_id, 'company_id', v_company_id);
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/plan_system.sql
-- =========================================================================
-- =============================================
-- SISTEMA DE PLANOS SaaS - AnthOS
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Enum de planos
DO $$ BEGIN
  CREATE TYPE public.plan_tier AS ENUM ('starter', 'business', 'pro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('active', 'suspended', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.financial_level AS ENUM ('basic', 'full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabela company_plans (por empresa, nÃ£o por usuÃ¡rio)
CREATE TABLE IF NOT EXISTS public.company_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan plan_tier NOT NULL DEFAULT 'starter',
  status subscription_status NOT NULL DEFAULT 'active',
  max_users INT NOT NULL DEFAULT 1,
  fiscal_enabled BOOLEAN NOT NULL DEFAULT false,
  advanced_reports_enabled BOOLEAN NOT NULL DEFAULT false,
  financial_module_level financial_level NOT NULL DEFAULT 'basic',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id)
);

ALTER TABLE public.company_plans ENABLE ROW LEVEL SECURITY;

-- RLS: empresa pode ler seu prÃ³prio plano
CREATE POLICY "Users can read own company plan" ON public.company_plans
  FOR SELECT TO authenticated
  USING (
    company_id IN (
      SELECT cu.company_id FROM public.company_users cu
      WHERE cu.user_id = auth.uid() AND cu.is_active = true
    )
  );

-- Super admins podem gerenciar todos os planos
CREATE POLICY "Super admins manage all plans" ON public.company_plans
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- 3) FunÃ§Ã£o SECURITY DEFINER para validar limites no backend
CREATE OR REPLACE FUNCTION public.check_plan_limit(
  p_company_id UUID,
  p_feature TEXT -- 'add_user', 'fiscal', 'advanced_reports', 'financial_full'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan RECORD;
  v_current_users INT;
BEGIN
  SELECT * INTO v_plan FROM public.company_plans
  WHERE company_id = p_company_id AND status = 'active'
  LIMIT 1;

  -- Sem plano = starter defaults
  IF NOT FOUND THEN
    IF p_feature = 'fiscal' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter nÃ£o inclui emissÃ£o fiscal.');
    ELSIF p_feature = 'advanced_reports' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter nÃ£o inclui relatÃ³rios avanÃ§ados.');
    ELSIF p_feature = 'financial_full' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter possui financeiro limitado.');
    ELSIF p_feature = 'add_user' THEN
      SELECT COUNT(*) INTO v_current_users FROM public.company_users WHERE company_id = p_company_id AND is_active = true;
      IF v_current_users >= 1 THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'Plano Starter permite apenas 1 usuÃ¡rio.');
      END IF;
    END IF;
    RETURN jsonb_build_object('allowed', true);
  END IF;

  -- Plano expirado?
  IF v_plan.expires_at IS NOT NULL AND v_plan.expires_at < now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'Assinatura expirada. Renove para continuar.');
  END IF;

  -- VerificaÃ§Ãµes por feature
  IF p_feature = 'add_user' THEN
    SELECT COUNT(*) INTO v_current_users FROM public.company_users WHERE company_id = p_company_id AND is_active = true;
    IF v_plan.max_users > 0 AND v_current_users >= v_plan.max_users THEN
      RETURN jsonb_build_object('allowed', false, 'reason',
        format('Seu plano permite no mÃ¡ximo %s usuÃ¡rio(s). Atual: %s.', v_plan.max_users, v_current_users));
    END IF;
  ELSIF p_feature = 'fiscal' THEN
    IF NOT v_plan.fiscal_enabled THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Seu plano nÃ£o inclui emissÃ£o fiscal. FaÃ§a upgrade.');
    END IF;
  ELSIF p_feature = 'advanced_reports' THEN
    IF NOT v_plan.advanced_reports_enabled THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Seu plano nÃ£o inclui relatÃ³rios avanÃ§ados. FaÃ§a upgrade.');
    END IF;
  ELSIF p_feature = 'financial_full' THEN
    IF v_plan.financial_module_level != 'full' THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'Financeiro completo requer plano Pro.');
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', true);
END;
$$;

-- 4) Inserir plano starter default para empresas existentes que nÃ£o tÃªm plano
INSERT INTO public.company_plans (company_id, plan, status, max_users, fiscal_enabled, advanced_reports_enabled, financial_module_level)
SELECT c.id, 'starter', 'active', 1, false, false, 'basic'
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.company_plans cp WHERE cp.company_id = c.id)
ON CONFLICT (company_id) DO NOTHING;


-- =========================================================================
-- ARQUIVO: sql/price_history.sql
-- =========================================================================
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


-- =========================================================================
-- ARQUIVO: sql/product_extras.sql
-- =========================================================================
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


-- =========================================================================
-- ARQUIVO: sql/promotions_advanced_columns.sql
-- =========================================================================
-- Add advanced columns to promotions table for product-specific and category-specific promos
-- Run this in your Supabase SQL Editor

ALTER TABLE promotions ADD COLUMN IF NOT EXISTS scope text DEFAULT 'all';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS product_ids uuid[] DEFAULT '{}';
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS category_name text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS fixed_price numeric DEFAULT 0;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS buy_quantity integer DEFAULT 3;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS pay_quantity integer DEFAULT 2;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS min_quantity integer DEFAULT 1;
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS active_days integer[] DEFAULT '{}';


-- =========================================================================
-- ARQUIVO: sql/purchase_entries_columns.sql
-- =========================================================================
-- Adicionar colunas de controle de entrada Ã  tabela nfe_imports
ALTER TABLE nfe_imports
  ADD COLUMN IF NOT EXISTS nfe_series text,
  ADD COLUMN IF NOT EXISTS nfe_model text DEFAULT '55-NFe',
  ADD COLUMN IF NOT EXISTS entry_number serial,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pendente' CHECK (status IN ('pendente', 'finalizado', 'estornado')),
  ADD COLUMN IF NOT EXISTS reversal_reason text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by uuid REFERENCES auth.users(id);

-- Ãndice para consulta rÃ¡pida de entradas por empresa
CREATE INDEX IF NOT EXISTS idx_nfe_imports_company_status ON nfe_imports(company_id, status);

-- Policy de update para poder finalizar entradas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nfe_imports' AND policyname = 'Users can update own company nfe_imports'
  ) THEN
    CREATE POLICY "Users can update own company nfe_imports"
      ON nfe_imports FOR UPDATE
      USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
  END IF;
END$$;

-- Policy de delete
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'nfe_imports' AND policyname = 'Users can delete own company nfe_imports'
  ) THEN
    CREATE POLICY "Users can delete own company nfe_imports"
      ON nfe_imports FOR DELETE
      USING (company_id IN (SELECT company_id FROM company_users WHERE user_id = auth.uid()));
  END IF;
END$$;


-- =========================================================================
-- ARQUIVO: sql/rate_limiting.sql
-- =========================================================================
-- ============================================================
-- Rate Limiting: tabela + funÃ§Ã£o RPC para throttle por tenant
-- ============================================================

-- Tabela para registrar chamadas por funÃ§Ã£o/tenant
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  fn_name    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ãndice para consulta rÃ¡pida por funÃ§Ã£o + tenant + janela de tempo
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_lookup
  ON rate_limit_log (fn_name, company_id, created_at DESC);

-- Limpeza automÃ¡tica: apagar registros com mais de 1 hora (evita crescimento)
SELECT cron.schedule(
  'cleanup-rate-limit-log',
  '*/10 * * * *',
  $$DELETE FROM rate_limit_log WHERE created_at < now() - INTERVAL '1 hour'$$
);

-- RPC: check_rate_limit
-- Retorna true se dentro do limite, false se excedido.
-- Registra a chamada atomicamente.
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_company_id uuid,
  p_fn_name    text,
  p_max_calls  int,
  p_window_sec int DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  -- Contar chamadas na janela
  SELECT count(*) INTO v_count
  FROM rate_limit_log
  WHERE fn_name = p_fn_name
    AND company_id = p_company_id
    AND created_at > now() - (p_window_sec || ' seconds')::interval;

  IF v_count >= p_max_calls THEN
    RETURN false;
  END IF;

  -- Registrar esta chamada
  INSERT INTO rate_limit_log (company_id, fn_name)
  VALUES (p_company_id, p_fn_name);

  RETURN true;
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/receipt_counter.sql
-- =========================================================================
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

-- FunÃ§Ã£o atÃ´mica para incrementar e retornar o prÃ³ximo nÃºmero
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


-- =========================================================================
-- ARQUIVO: sql/receive_credit_payment_atomic.sql
-- =========================================================================
-- Atomic receive-credit operation for fiado settlements.
-- Ensures client balance, financial entries, and cash session movement
-- are updated in a single transaction.

CREATE OR REPLACE FUNCTION public.receive_credit_payment_atomic(
  p_company_id uuid,
  p_client_id uuid,
  p_paid_amount numeric,
  p_payment_method text,
  p_performed_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid;
  v_client record;
  v_entry record;
  v_remaining numeric;
  v_apply numeric;
  v_new_balance numeric;
  v_method text;
  v_payment_field text;
  v_session record;
  v_session_id uuid := null;
  v_movement_id uuid := null;
  v_touched_entry_ids uuid[] := ARRAY[]::uuid[];
  v_touched_references text[] := ARRAY[]::text[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM company_users cu
    WHERE cu.company_id = p_company_id
      AND cu.user_id = v_uid
      AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF p_client_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente invÃ¡lido');
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor pago invÃ¡lido');
  END IF;

  v_method := lower(coalesce(trim(p_payment_method), 'dinheiro'));
  IF v_method = '' THEN
    v_method := 'dinheiro';
  END IF;
  IF v_method NOT IN ('dinheiro','pix','debito','credito','voucher','outros','prazo') THEN
    v_method := 'outros';
  END IF;

  SELECT *
  INTO v_client
  FROM clients c
  WHERE c.id = p_client_id
    AND c.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente nÃ£o encontrado');
  END IF;

  v_remaining := LEAST(p_paid_amount, GREATEST(coalesce(v_client.credit_balance, 0), 0));
  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cliente sem saldo devedor');
  END IF;

  FOR v_entry IN
    SELECT fe.*
    FROM financial_entries fe
    WHERE fe.company_id = p_company_id
      AND fe.type = 'receber'
      AND fe.status = 'pendente'
      AND fe.counterpart = v_client.name
    ORDER BY fe.due_date ASC, fe.created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    v_apply := LEAST(v_remaining, GREATEST(coalesce(v_entry.amount, 0) - coalesce(v_entry.paid_amount, 0), 0));
    IF v_apply <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE financial_entries
    SET
      paid_amount = coalesce(paid_amount, 0) + v_apply,
      payment_method = v_method,
      status = CASE
        WHEN coalesce(paid_amount, 0) + v_apply >= amount THEN 'pago'
        ELSE status
      END,
      paid_date = CASE
        WHEN coalesce(paid_amount, 0) + v_apply >= amount THEN current_date
        ELSE paid_date
      END,
      updated_at = now()
    WHERE id = v_entry.id;

    v_touched_entry_ids := array_append(v_touched_entry_ids, v_entry.id);
    IF v_entry.reference IS NOT NULL AND v_entry.reference <> '' THEN
      v_touched_references := array_append(v_touched_references, v_entry.reference);
    END IF;
    v_remaining := v_remaining - v_apply;
  END LOOP;

  v_new_balance := GREATEST(coalesce(v_client.credit_balance, 0) - (p_paid_amount - v_remaining), 0);
  UPDATE clients
  SET
    credit_balance = v_new_balance,
    updated_at = now()
  WHERE id = p_client_id
    AND company_id = p_company_id;

  SELECT *
  INTO v_session
  FROM cash_sessions cs
  WHERE cs.company_id = p_company_id
    AND cs.status = 'aberto'
  ORDER BY cs.opened_at DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_session_id := v_session.id;
    v_payment_field := CASE
      WHEN v_method = 'dinheiro' THEN 'total_dinheiro'
      WHEN v_method = 'pix' THEN 'total_pix'
      WHEN v_method = 'debito' THEN 'total_debito'
      WHEN v_method = 'credito' THEN 'total_credito'
      WHEN v_method = 'voucher' THEN 'total_voucher'
      ELSE 'total_outros'
    END;

    INSERT INTO cash_movements (
      company_id,
      session_id,
      type,
      amount,
      performed_by,
      payment_method,
      description,
      sale_id
    ) VALUES (
      p_company_id,
      v_session.id,
      'suprimento',
      (p_paid_amount - v_remaining),
      coalesce(p_performed_by, v_uid),
      v_method::payment_method,
      'Recebimento fiado: ' || coalesce(v_client.name, 'Cliente'),
      null
    )
    RETURNING id INTO v_movement_id;

    EXECUTE format(
      'UPDATE cash_sessions
         SET %I = coalesce(%I, 0) + $1,
             total_suprimento = coalesce(total_suprimento, 0) + $1
       WHERE id = $2',
      v_payment_field,
      v_payment_field
    )
    USING (p_paid_amount - v_remaining), v_session.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'client_id', p_client_id,
    'new_balance', v_new_balance,
    'applied_amount', (p_paid_amount - v_remaining),
    'session_id', v_session_id,
    'movement_id', v_movement_id,
    'entry_ids', v_touched_entry_ids,
    'references', (
      SELECT coalesce(jsonb_agg(distinct ref), '[]'::jsonb)
      FROM unnest(v_touched_references) AS ref
    )
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao receber fiado');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/register_cash_movement_atomic.sql
-- =========================================================================
-- ============================================================
-- RPC: register_cash_movement_atomic
-- Registra sangria/suprimento de forma atÃ´mica, evitando
-- race condition do padrÃ£o read-then-write.
-- ============================================================

CREATE OR REPLACE FUNCTION register_cash_movement_atomic(
  p_company_id   uuid,
  p_session_id   uuid,
  p_type         text,        -- 'sangria' | 'suprimento'
  p_amount       numeric,
  p_performed_by uuid,
  p_description  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid;
  v_movement_id uuid;
  v_session    record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthorized');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_users cu
    WHERE cu.user_id = v_uid AND cu.company_id = p_company_id AND cu.is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Forbidden');
  END IF;

  IF p_type NOT IN ('sangria', 'suprimento') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Tipo invÃ¡lido: use sangria ou suprimento');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor deve ser positivo');
  END IF;

  -- Lock session row
  SELECT id, status, company_id INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL OR v_session.company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'SessÃ£o de caixa invÃ¡lida');
  END IF;

  IF v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa nÃ£o estÃ¡ aberto');
  END IF;

  -- Insert movement
  INSERT INTO cash_movements (company_id, session_id, type, amount, performed_by, description)
  VALUES (p_company_id, p_session_id, p_type, p_amount, p_performed_by, p_description)
  RETURNING id INTO v_movement_id;

  -- Atomic increment (no read-then-write race condition)
  IF p_type = 'sangria' THEN
    UPDATE cash_sessions
    SET total_sangria = COALESCE(total_sangria, 0) + p_amount
    WHERE id = p_session_id;
  ELSE
    UPDATE cash_sessions
    SET total_suprimento = COALESCE(total_suprimento, 0) + p_amount
    WHERE id = p_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id, 'message', 'MovimentaÃ§Ã£o registrada');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao registrar movimentaÃ§Ã£o');
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/rls_role_protection.sql
-- =========================================================================
-- ============================================================
-- PolÃ­ticas RLS para proteger roles e limites de desconto
-- Impede auto-elevaÃ§Ã£o de privilÃ©gios e garante que apenas
-- admins possam alterar roles/limites.
-- ============================================================

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 1) COMPANY_USERS: impedir que usuÃ¡rios alterem o prÃ³prio role
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Drop existing policies if they exist (safe re-run)
DROP POLICY IF EXISTS "Users can view own company membership" ON company_users;
DROP POLICY IF EXISTS "Admins can manage company users" ON company_users;
DROP POLICY IF EXISTS "Users cannot change own role" ON company_users;

-- Leitura: usuÃ¡rio vÃª registros da sua empresa
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
  -- Impedir auto-alteraÃ§Ã£o de role
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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 2) DISCOUNT_LIMITS: apenas admins podem gerenciar
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

-- Criar tabela se nÃ£o existir
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

-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
-- 3) Colunas canceled_at / canceled_by em sales
-- â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_at timestamptz;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS canceled_by uuid REFERENCES auth.users(id);


-- =========================================================================
-- ARQUIVO: sql/session_control.sql
-- =========================================================================
-- =============================================
-- CONTROLE DE SESSÃ•ES - Anti-compartilhamento
-- Execute este SQL no Supabase SQL Editor
-- =============================================

-- 1) Tabela user_sessions
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  device_info TEXT,
  ip_address TEXT,
  session_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON public.user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON public.user_sessions(session_token);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own sessions
CREATE POLICY "Users see own sessions" ON public.user_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- RLS: users can update their own sessions (for heartbeat)
CREATE POLICY "Users update own sessions" ON public.user_sessions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2) Function to get max sessions per plan (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.get_max_sessions_for_user(p_user_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_plan TEXT;
  v_is_super_admin BOOLEAN;
BEGIN
  -- Check if user is super_admin â†’ unlimited sessions
  SELECT EXISTS(
    SELECT 1 FROM public.admin_roles
    WHERE user_id = p_user_id AND role = 'super_admin'
  ) INTO v_is_super_admin;

  IF v_is_super_admin THEN
    RETURN 0; -- unlimited
  END IF;

  -- Get user's company
  SELECT company_id INTO v_company_id
  FROM public.company_users
  WHERE user_id = p_user_id AND is_active = true
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN 1;
  END IF;

  -- Get company plan
  SELECT plan::TEXT INTO v_plan
  FROM public.company_plans
  WHERE company_id = v_company_id AND status = 'active'
  LIMIT 1;

  IF v_plan IS NULL OR v_plan = 'starter' THEN
    RETURN 3;
  ELSIF v_plan = 'business' THEN
    RETURN 8;
  ELSIF v_plan = 'pro' THEN
    RETURN 0;
  END IF;

  RETURN 1;
END;
$$;

-- 3) Function to register session (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.register_session(
  p_user_id UUID,
  p_company_id UUID,
  p_session_token TEXT,
  p_device_info TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_sessions INT;
  v_active_count INT;
  v_oldest_session_id UUID;
BEGIN
  -- Get max sessions for plan
  v_max_sessions := public.get_max_sessions_for_user(p_user_id);

  -- Invalidate sessions older than 24h
  UPDATE public.user_sessions
  SET is_active = false
  WHERE user_id = p_user_id
    AND is_active = true
    AND last_activity < now() - INTERVAL '24 hours';

  -- Count active sessions
  SELECT COUNT(*) INTO v_active_count
  FROM public.user_sessions
  WHERE user_id = p_user_id AND is_active = true;

  -- If unlimited (pro), just insert
  IF v_max_sessions = 0 THEN
    INSERT INTO public.user_sessions (user_id, company_id, session_token, device_info, ip_address)
    VALUES (p_user_id, p_company_id, p_session_token, p_device_info, p_ip_address);
    RETURN jsonb_build_object('success', true, 'action', 'created');
  END IF;

  -- If at limit, invalidate oldest session
  IF v_active_count >= v_max_sessions THEN
    SELECT id INTO v_oldest_session_id
    FROM public.user_sessions
    WHERE user_id = p_user_id AND is_active = true
    ORDER BY last_activity ASC
    LIMIT 1;

    IF v_oldest_session_id IS NOT NULL THEN
      UPDATE public.user_sessions SET is_active = false WHERE id = v_oldest_session_id;
    END IF;
  END IF;

  -- Insert new session
  INSERT INTO public.user_sessions (user_id, company_id, session_token, device_info, ip_address)
  VALUES (p_user_id, p_company_id, p_session_token, p_device_info, p_ip_address);

  RETURN jsonb_build_object(
    'success', true,
    'action', CASE WHEN v_active_count >= v_max_sessions THEN 'replaced_oldest' ELSE 'created' END,
    'max_sessions', v_max_sessions
  );
END;
$$;

-- 4) Function to validate session is still active
CREATE OR REPLACE FUNCTION public.validate_session(p_session_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session RECORD;
  v_is_super_admin BOOLEAN;
BEGIN
  SELECT * INTO v_session
  FROM public.user_sessions
  WHERE session_token = p_session_token AND is_active = true
  LIMIT 1;

  IF NOT FOUND THEN
    -- Check if this is a super_admin â€” they should never be kicked
    SELECT EXISTS(
      SELECT 1 FROM public.admin_roles
      WHERE user_id = auth.uid() AND role = 'super_admin'
    ) INTO v_is_super_admin;

    IF v_is_super_admin THEN
      RETURN jsonb_build_object('valid', true);
    END IF;

    RETURN jsonb_build_object('valid', false, 'reason', 'SessÃ£o invalidada. Outro dispositivo pode ter feito login.');
  END IF;

  -- Update heartbeat
  UPDATE public.user_sessions
  SET last_activity = now()
  WHERE id = v_session.id;

  RETURN jsonb_build_object('valid', true);
END;
$$;

-- 5) Function to invalidate session on logout
CREATE OR REPLACE FUNCTION public.invalidate_session(p_session_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_sessions
  SET is_active = false
  WHERE session_token = p_session_token;
END;
$$;

-- 6) Cleanup: auto-invalidate stale sessions (> 24h inactive)
-- Can be called via pg_cron or manually
CREATE OR REPLACE FUNCTION public.cleanup_stale_sessions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.user_sessions
  SET is_active = false
  WHERE is_active = true AND last_activity < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- PermissÃ£o explÃ­cita (invalidate_session no fechamento da aba; sem GRANT pode retornar 401)
GRANT EXECUTE ON FUNCTION public.invalidate_session(TEXT) TO authenticated, anon;


-- =========================================================================
-- ARQUIVO: sql/storage_company_assets.sql
-- =========================================================================
-- 1. Criar o bucket (pÃºblico para leitura de logos)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-assets', 'company-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2. PolÃ­tica: usuÃ¡rios autenticados podem fazer upload
CREATE POLICY "Authenticated users can upload company assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'company-assets');

-- 3. PolÃ­tica: usuÃ¡rios autenticados podem atualizar (upsert)
CREATE POLICY "Authenticated users can update company assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'company-assets');

-- 4. PolÃ­tica: leitura pÃºblica (bucket jÃ¡ Ã© pÃºblico, mas garante)
CREATE POLICY "Public read access for company assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'company-assets');

-- 5. PolÃ­tica: usuÃ¡rios autenticados podem deletar seus assets
CREATE POLICY "Authenticated users can delete company assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'company-assets');


-- =========================================================================
-- ARQUIVO: sql/support_messages.sql
-- =========================================================================
-- Create support_messages table for AI Assistant chat history
-- Run this SQL in your Supabase SQL Editor

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  company_id uuid references public.companies(id) on delete cascade not null,
  message text not null,
  sender text not null check (sender in ('user', 'bot')),
  created_at timestamptz default now() not null
);

-- Enable RLS
alter table public.support_messages enable row level security;

-- Users can only read/write their own messages
create policy "Users can insert own messages"
  on public.support_messages for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own messages"
  on public.support_messages for select
  to authenticated
  using (auth.uid() = user_id);

-- Index for fast lookup
create index if not exists idx_support_messages_user
  on public.support_messages(user_id, created_at desc);


-- =========================================================================
-- ARQUIVO: sql/system_errors.sql
-- =========================================================================
-- =====================================================
-- System Error Tracking
-- =====================================================

CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  page TEXT NOT NULL DEFAULT '',
  action TEXT DEFAULT '',
  error_message TEXT NOT NULL,
  error_stack TEXT DEFAULT '',
  browser TEXT DEFAULT '',
  device TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read errors
CREATE POLICY "system_errors_admin_select" ON public.system_errors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Any authenticated user can insert errors (so errors get logged)
CREATE POLICY "system_errors_insert" ON public.system_errors
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow anonymous inserts too (for errors before login)
CREATE POLICY "system_errors_anon_insert" ON public.system_errors
  FOR INSERT TO anon
  WITH CHECK (true);

-- Only super_admin can delete errors
CREATE POLICY "system_errors_admin_delete" ON public.system_errors
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_roles ar
      WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_system_errors_created ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_user ON public.system_errors(user_email);
CREATE INDEX IF NOT EXISTS idx_system_errors_page ON public.system_errors(page);


-- =========================================================================
-- ARQUIVO: sql/tech_specs_reviews.sql
-- =========================================================================
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


-- =========================================================================
-- ARQUIVO: sql/transfer_stock_atomic.sql
-- =========================================================================
-- ============================================================
-- RPC: transfer_stock_atomic
-- TransferÃªncia de estoque com FOR UPDATE para prevenir
-- race conditions e estoque negativo em concorrÃªncia
-- ============================================================

CREATE OR REPLACE FUNCTION transfer_stock_atomic(
  p_from_company_id  uuid,
  p_to_company_id    uuid,
  p_items            jsonb,    -- [{product_id, quantity, product_name, product_sku, unit_cost}]
  p_user_id          uuid,
  p_notes            text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid;
  v_transfer_id  uuid;
  v_item         jsonb;
  v_product      record;
  v_new_stock    int;
  v_dest_product record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NÃ£o autenticado');
  END IF;

  -- Validar acesso Ã  empresa de origem
  IF NOT EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = v_uid AND company_id = p_from_company_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissÃ£o na empresa de origem');
  END IF;

  -- Criar transferÃªncia
  INSERT INTO stock_transfers (from_company_id, to_company_id, notes, status, created_by)
  VALUES (p_from_company_id, p_to_company_id, p_notes, 'pending', p_user_id)
  RETURNING id INTO v_transfer_id;

  -- Processar cada item com lock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- Lock do produto na origem (FOR UPDATE previne race condition)
    SELECT id, stock_quantity, name INTO v_product
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
      AND company_id = p_from_company_id
    FOR UPDATE;

    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Produto % nÃ£o encontrado na origem', v_item->>'product_name';
    END IF;

    -- Validar estoque suficiente
    IF v_product.stock_quantity < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%". DisponÃ­vel: %, Solicitado: %',
        v_product.name, v_product.stock_quantity, (v_item->>'quantity')::int;
    END IF;

    -- Baixar estoque da origem
    v_new_stock := v_product.stock_quantity - (v_item->>'quantity')::int;
    UPDATE products
    SET stock_quantity = v_new_stock
    WHERE id = v_product.id AND company_id = p_from_company_id;

    -- Registrar item da transferÃªncia
    INSERT INTO stock_transfer_items (transfer_id, product_id, product_name, product_sku, quantity, unit_cost)
    VALUES (
      v_transfer_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      COALESCE(v_item->>'product_sku', ''),
      (v_item->>'quantity')::int,
      COALESCE((v_item->>'unit_cost')::numeric, 0)
    );

    -- Registrar movimentaÃ§Ã£o de saÃ­da
    INSERT INTO stock_movements (company_id, product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference, performed_by)
    VALUES (
      p_from_company_id,
      (v_item->>'product_id')::uuid,
      'saida',
      (v_item->>'quantity')::int,
      v_product.stock_quantity,
      v_new_stock,
      COALESCE((v_item->>'unit_cost')::numeric, 0),
      'TransferÃªncia para filial',
      v_transfer_id::text,
      p_user_id
    );
  END LOOP;

  -- Log de auditoria
  INSERT INTO action_logs (company_id, user_id, action, module, details)
  VALUES (
    p_from_company_id,
    p_user_id,
    'TransferÃªncia de estoque criada (atÃ´mica)',
    'estoque',
    jsonb_build_object(
      'transfer_id', v_transfer_id,
      'to_company_id', p_to_company_id,
      'items_count', jsonb_array_length(p_items)
    )::text
  );

  RETURN jsonb_build_object('success', true, 'transfer_id', v_transfer_id);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- ============================================================
-- RPC: receive_transfer_atomic
-- Recebimento de transferÃªncia com FOR UPDATE
-- ============================================================

CREATE OR REPLACE FUNCTION receive_transfer_atomic(
  p_transfer_id   uuid,
  p_company_id    uuid,
  p_user_id       uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid;
  v_transfer   record;
  v_item       record;
  v_product    record;
  v_new_stock  int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NÃ£o autenticado');
  END IF;

  -- Lock da transferÃªncia
  SELECT id, from_company_id, to_company_id, status INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TransferÃªncia nÃ£o encontrada');
  END IF;

  IF v_transfer.to_company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'TransferÃªncia nÃ£o pertence a esta empresa');
  END IF;

  IF v_transfer.status = 'received' THEN
    RETURN jsonb_build_object('success', true, 'message', 'JÃ¡ recebida anteriormente');
  END IF;

  IF v_transfer.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'TransferÃªncia cancelada');
  END IF;

  -- Atualizar status
  UPDATE stock_transfers
  SET status = 'received', received_by = p_user_id, received_at = now()
  WHERE id = p_transfer_id;

  -- Processar itens
  FOR v_item IN
    SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    -- Tentar encontrar produto no destino (por ID ou SKU)
    SELECT id, stock_quantity INTO v_product
    FROM products
    WHERE company_id = p_company_id
      AND (id = v_item.product_id OR (v_item.product_sku <> '' AND sku = v_item.product_sku))
    LIMIT 1
    FOR UPDATE;

    IF v_product IS NOT NULL THEN
      v_new_stock := COALESCE(v_product.stock_quantity, 0) + v_item.quantity;
      UPDATE products SET stock_quantity = v_new_stock
      WHERE id = v_product.id AND company_id = p_company_id;

      INSERT INTO stock_movements (company_id, product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference, performed_by)
      VALUES (p_company_id, v_product.id, 'entrada', v_item.quantity,
              COALESCE(v_product.stock_quantity, 0), v_new_stock, v_item.unit_cost,
              'TransferÃªncia recebida', p_transfer_id::text, p_user_id);
    END IF;
    -- Se produto nÃ£o existe no destino, o frontend pode clonÃ¡-lo separadamente
  END LOOP;

  INSERT INTO action_logs (company_id, user_id, action, module, details)
  VALUES (p_company_id, p_user_id, 'TransferÃªncia recebida (atÃ´mica)', 'estoque',
          jsonb_build_object('transfer_id', p_transfer_id)::text);

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


-- =========================================================================
-- ARQUIVO: sql/uptime_monitor.sql
-- =========================================================================
-- Monitoramento de Uptime â€” Health Check a cada 5 minutos
-- Execute no Supabase SQL Editor

-- 1. Criar tabela de logs
create table if not exists public.uptime_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  status text not null check (status in ('ok', 'degraded', 'critical')),
  checks jsonb,
  total_latency_ms integer,
  failed_services text[] default '{}'
);

-- RLS: apenas service_role e super_admin leem
alter table public.uptime_logs enable row level security;

create policy "Super admin reads uptime_logs"
  on public.uptime_logs for select
  to authenticated
  using (
    public.has_role(auth.uid(), 'super_admin')
  );

-- 2. Habilitar extensÃµes
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3. Cron job a cada 5 minutos
select cron.schedule(
  'health-check-5min',
  '*/5 * * * *',
  $$
  select
    net.http_post(
      url := 'https://fsvxpxziotklbxkivyug.supabase.co/functions/v1/health-check',
      headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
      body := '{}'::jsonb
    ) as request_id;
  $$
);

-- 4. Limpeza automÃ¡tica: manter apenas 30 dias de logs
select cron.schedule(
  'cleanup-uptime-logs',
  '0 3 * * 0',  -- Todo domingo Ã s 3h UTC
  $$
  delete from public.uptime_logs where created_at < now() - interval '30 days';
  $$
);


-- =========================================================================
-- ARQUIVO: sql/user_roles_migration.sql
-- =========================================================================
-- ============================================================
-- MigraÃ§Ã£o: Tabela dedicada user_roles (RBAC seguro)
-- Segue as melhores prÃ¡ticas de RLS sem recursÃ£o infinita.
-- ============================================================

-- 1) Criar enum de roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'gerente', 'supervisor', 'caixa');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Tabela user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role      app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) FunÃ§Ã£o SECURITY DEFINER para checar role (sem recursÃ£o RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 4) RLS policies para user_roles
CREATE POLICY "Users can view own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) Migrar roles existentes de company_users para user_roles
-- (Executar apenas uma vez)
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT cu.user_id,
  CASE cu.role
    WHEN 'admin' THEN 'admin'::app_role
    WHEN 'gerente' THEN 'gerente'::app_role
    WHEN 'supervisor' THEN 'supervisor'::app_role
    ELSE 'caixa'::app_role
  END
FROM public.company_users cu
WHERE cu.is_active = true
ON CONFLICT (user_id, role) DO NOTHING;

