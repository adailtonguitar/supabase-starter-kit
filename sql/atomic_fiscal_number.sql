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
    RAISE EXCEPTION 'Configuração fiscal não encontrada (id=%)', p_config_id;
  END IF;

  -- Increment
  UPDATE fiscal_configs
  SET next_number = v_next + 1,
      updated_at = now()
  WHERE id = p_config_id;

  RETURN v_next;
END;
$$;
