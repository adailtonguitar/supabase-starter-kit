-- ============================================================
-- RPC atômica para cancelamento/devolução de venda
-- Garante: status da venda + estorno de estoque + lançamento financeiro
-- em uma única transação (tudo ou nada).
-- ============================================================

CREATE OR REPLACE FUNCTION cancel_sale_atomic(
  p_sale_id        uuid,
  p_company_id     uuid,
  p_user_id        uuid,
  p_items          jsonb,       -- [{ "product_id": "...", "product_name": "...", "quantity": 2 }]
  p_refund_amount  numeric,
  p_reason         text DEFAULT 'Devolução via PDV'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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
    RETURN jsonb_build_object('success', false, 'error', 'Venda não encontrada');
  END IF;

  IF v_sale_status = 'cancelada' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venda já foi cancelada anteriormente');
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

  -- STEP 3: Update sale status
  UPDATE sales
  SET status = 'cancelada'
  WHERE id = p_sale_id;

  -- STEP 4: Create financial entry for the refund
  INSERT INTO financial_entries (
    company_id, type, description, reference, amount,
    due_date, paid_date, paid_amount, payment_method, status, created_by
  ) VALUES (
    p_company_id,
    'pagar',
    'Devolução - Venda #' || LEFT(p_sale_id::text, 8),
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
    'message', 'Devolução processada com sucesso',
    'refund_amount', p_refund_amount
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'code', SQLSTATE);
END;
$$;
