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
    RETURN jsonb_build_object('success', false, 'error', 'Cliente inválido');
  END IF;

  IF p_paid_amount IS NULL OR p_paid_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Valor pago inválido');
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
    RETURN jsonb_build_object('success', false, 'error', 'Cliente não encontrado');
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
