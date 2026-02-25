-- ============================================================
-- INSTRUÇÃO: Execute este SQL manualmente no Dashboard do Supabase
-- (SQL Editor) do projeto fsvxpxziotklbxkivyug
-- ============================================================

-- 1) Tabela sale_items (relacional, substitui JSONB em sales.items)
CREATE TABLE IF NOT EXISTS sale_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;

-- 2) Função RPC atômica
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
AS $$
DECLARE
  v_sale_id        uuid;
  v_item           jsonb;
  v_current_stock  numeric;
  v_product_name   text;
  v_session        record;
BEGIN
  -- STEP 1: Insert sale
  INSERT INTO sales (company_id, terminal_id, session_id, items, subtotal,
                     discount_percent, discount_value, total, payments, status, sold_by)
  VALUES (p_company_id, p_terminal_id, p_session_id, p_items, p_subtotal,
          p_discount_pct, p_discount_val, p_total, p_payments, 'completed', p_sold_by)
  RETURNING id INTO v_sale_id;

  -- STEP 2: Insert sale_items + decrement stock (with row lock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, discount_percent, subtotal)
    VALUES (
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

  -- STEP 3: Update cash session
  SELECT total_vendas, total_dinheiro, total_debito, total_credito,
         total_pix, total_voucher, total_outros, sales_count
  INTO v_session
  FROM cash_sessions
  WHERE id = p_session_id
  FOR UPDATE;

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
    p_sold_by
  );

  RETURN jsonb_build_object('success', true, 'sale_id', v_sale_id, 'message', 'Venda finalizada com sucesso');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
