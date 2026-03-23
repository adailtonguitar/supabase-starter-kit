-- ============================================================
-- RPC: register_cash_movement_atomic
-- Registra sangria/suprimento de forma atômica, evitando
-- race condition do padrão read-then-write.
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
    RETURN jsonb_build_object('success', false, 'error', 'Tipo inválido: use sangria ou suprimento');
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
    RETURN jsonb_build_object('success', false, 'error', 'Sessão de caixa inválida');
  END IF;

  IF v_session.status <> 'aberto' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caixa não está aberto');
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

  RETURN jsonb_build_object('success', true, 'movement_id', v_movement_id, 'message', 'Movimentação registrada');

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', 'Erro interno ao registrar movimentação');
END;
$$;
