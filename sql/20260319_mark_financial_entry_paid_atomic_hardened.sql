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
    RETURN jsonb_build_object('success', false, 'error', 'Lançamento inválido');
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
  INTO v_entry
  FROM financial_entries fe
  WHERE fe.id = p_entry_id
    AND fe.company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Lançamento não encontrado');
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
        'Recebimento: ' || coalesce(v_entry.description, 'Lançamento financeiro'),
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
