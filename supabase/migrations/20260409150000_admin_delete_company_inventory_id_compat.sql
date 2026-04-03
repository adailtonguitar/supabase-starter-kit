-- Fix admin_delete_company for schemas that use inventory_count_items.inventory_id
-- while keeping legacy inventory_count_id compatibility.

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
    RAISE EXCEPTION 'Empresa nao encontrada';
  END IF;

  SELECT COALESCE(c.is_demo, false) INTO v_is_demo FROM public.companies c WHERE c.id = p_company_id;

  IF NOT v_is_demo AND NOT p_allow_non_demo THEN
    RAISE EXCEPTION
      'admin_delete_company: so empresas demo (is_demo = true) podem ser excluidas. Para empresa real, use Admin > Empresas ou exclusao de filial com confirmacao explicita no app.';
  END IF;

  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_count_items'
      AND column_name = 'inventory_count_id'
  ) THEN
    EXECUTE 'DELETE FROM public.inventory_count_items WHERE inventory_count_id IN (SELECT id FROM public.inventory_counts WHERE company_id = $1)'
      USING p_company_id;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inventory_count_items'
      AND column_name = 'inventory_id'
  ) THEN
    EXECUTE 'DELETE FROM public.inventory_count_items WHERE inventory_id IN (SELECT id FROM public.inventory_counts WHERE company_id = $1)'
      USING p_company_id;
  END IF;

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
  'Deletes company and related data. Compatible with inventory_id and legacy inventory_count_id.';