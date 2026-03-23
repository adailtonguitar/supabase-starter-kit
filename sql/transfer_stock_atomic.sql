-- ============================================================
-- RPC: transfer_stock_atomic
-- Transferência de estoque com FOR UPDATE para prevenir
-- race conditions e estoque negativo em concorrência
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
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- Validar acesso à empresa de origem
  IF NOT EXISTS (
    SELECT 1 FROM company_users
    WHERE user_id = v_uid AND company_id = p_from_company_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sem permissão na empresa de origem');
  END IF;

  -- Criar transferência
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
      RAISE EXCEPTION 'Produto % não encontrado na origem', v_item->>'product_name';
    END IF;

    -- Validar estoque suficiente
    IF v_product.stock_quantity < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'Estoque insuficiente para "%". Disponível: %, Solicitado: %',
        v_product.name, v_product.stock_quantity, (v_item->>'quantity')::int;
    END IF;

    -- Baixar estoque da origem
    v_new_stock := v_product.stock_quantity - (v_item->>'quantity')::int;
    UPDATE products
    SET stock_quantity = v_new_stock
    WHERE id = v_product.id AND company_id = p_from_company_id;

    -- Registrar item da transferência
    INSERT INTO stock_transfer_items (transfer_id, product_id, product_name, product_sku, quantity, unit_cost)
    VALUES (
      v_transfer_id,
      (v_item->>'product_id')::uuid,
      v_item->>'product_name',
      COALESCE(v_item->>'product_sku', ''),
      (v_item->>'quantity')::int,
      COALESCE((v_item->>'unit_cost')::numeric, 0)
    );

    -- Registrar movimentação de saída
    INSERT INTO stock_movements (company_id, product_id, type, quantity, previous_stock, new_stock, unit_cost, reason, reference, performed_by)
    VALUES (
      p_from_company_id,
      (v_item->>'product_id')::uuid,
      'saida',
      (v_item->>'quantity')::int,
      v_product.stock_quantity,
      v_new_stock,
      COALESCE((v_item->>'unit_cost')::numeric, 0),
      'Transferência para filial',
      v_transfer_id::text,
      p_user_id
    );
  END LOOP;

  -- Log de auditoria
  INSERT INTO action_logs (company_id, user_id, action, module, details)
  VALUES (
    p_from_company_id,
    p_user_id,
    'Transferência de estoque criada (atômica)',
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
-- Recebimento de transferência com FOR UPDATE
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
    RETURN jsonb_build_object('success', false, 'error', 'Não autenticado');
  END IF;

  -- Lock da transferência
  SELECT id, from_company_id, to_company_id, status INTO v_transfer
  FROM stock_transfers
  WHERE id = p_transfer_id
  FOR UPDATE;

  IF v_transfer IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transferência não encontrada');
  END IF;

  IF v_transfer.to_company_id <> p_company_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transferência não pertence a esta empresa');
  END IF;

  IF v_transfer.status = 'received' THEN
    RETURN jsonb_build_object('success', true, 'message', 'Já recebida anteriormente');
  END IF;

  IF v_transfer.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Transferência cancelada');
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
              'Transferência recebida', p_transfer_id::text, p_user_id);
    END IF;
    -- Se produto não existe no destino, o frontend pode cloná-lo separadamente
  END LOOP;

  INSERT INTO action_logs (company_id, user_id, action, module, details)
  VALUES (p_company_id, p_user_id, 'Transferência recebida (atômica)', 'estoque',
          jsonb_build_object('transfer_id', p_transfer_id)::text);

  RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
