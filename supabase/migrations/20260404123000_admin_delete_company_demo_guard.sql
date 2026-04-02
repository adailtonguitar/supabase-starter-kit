-- Trava no servidor: admin_delete_company só apaga empresa com is_demo = true,
-- exceto quando o cliente passa p_allow_non_demo = true (Admin > Empresas, exclusão de filial).

DROP FUNCTION IF EXISTS public.admin_delete_company(uuid);

CREATE OR REPLACE FUNCTION public.admin_delete_company(
  p_company_id uuid,
  p_allow_non_demo boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_is_demo boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p_company_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Empresa não encontrada';
  END IF;

  SELECT COALESCE(c.is_demo, false) INTO v_is_demo FROM public.companies c WHERE c.id = p_company_id;

  IF NOT v_is_demo AND NOT p_allow_non_demo THEN
    RAISE EXCEPTION
      'admin_delete_company: só empresas demo (is_demo = true) podem ser excluídas. Para empresa real, use Admin > Empresas ou exclusão de filial com confirmação explícita no app.';
  END IF;

  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);
  DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE company_id = p_company_id);
  DELETE FROM product_labels WHERE company_id = p_company_id;
  DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE company_id = p_company_id);
  DELETE FROM cash_movements WHERE company_id = p_company_id;
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
  DELETE FROM company_plans WHERE company_id = p_company_id;
  DELETE FROM companies WHERE parent_company_id = p_company_id;
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_company(uuid, boolean) IS
  'Exclui empresa e dados relacionados. Por padrão só permite is_demo = true; p_allow_non_demo exige fluxo explícito no app (Admin Empresas / filial).';

GRANT EXECUTE ON FUNCTION public.admin_delete_company(uuid, boolean) TO authenticated;
