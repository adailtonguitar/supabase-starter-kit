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

  -- ═══ IDEMPOTENCY CHECK ═══
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_sale
    FROM sales
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_sale IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'sale_id', v_existing_sale, 'message', 'Venda já processada (idempotente)');
    END IF;
  END IF;

  SELECT total_vendas, total_dinheiro, total_debito, total_credito,
         total_pix, total_voucher, total_outros, sales_count, company_id, status
  INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_session IS NULL OR v_session.company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sessão de caixa inválida');
  END IF;
  IF v_session.status IS NOT NULL AND v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa não está aberto');
  END IF;

  SELECT COALESCE(SUM((it->>'subtotal')::numeric), 0)
  INTO v_sum_items
  FROM jsonb_array_elements(p_items) it;

  SELECT COALESCE(SUM((pj->>'amount')::numeric), 0)
  INTO v_sum_payments
  FROM jsonb_array_elements(p_payments) pj;

  IF v_sum_items < 0 OR p_total <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total inválido');
  END IF;
  IF abs(v_sum_payments - p_total) > 0.01 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Soma de pagamentos não confere com o total');
  END IF;
  IF abs(v_sum_items - p_total) > 0.02 AND abs(v_sum_items - (p_total + COALESCE(p_discount_val,0))) > 0.02 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Total não confere com itens');
  END IF;

  -- ═══ Validate discount against role limits ═══
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
      RAISE EXCEPTION 'Produto não encontrado: %', v_item->>'product_id';
    END IF;

    IF v_current_stock < (v_item->>'quantity')::numeric THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%": disponível=%, solicitado=%',
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
