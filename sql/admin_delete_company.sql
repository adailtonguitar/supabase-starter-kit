-- Função SECURITY DEFINER: exclusão em cascata de uma empresa.
-- Por padrão só executa se companies.is_demo = true (protege matrizes reais).
-- Admin > Empresas e exclusão de filial no app passam p_allow_non_demo := true.

DROP FUNCTION IF EXISTS public.admin_delete_company(uuid);
DROP FUNCTION IF EXISTS public.admin_delete_company(uuid, boolean);

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
  v_child_id uuid;
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

  -- Recursively delete child companies (branches) first
  FOR v_child_id IN SELECT id FROM public.companies WHERE parent_company_id = p_company_id
  LOOP
    PERFORM public.admin_delete_company(v_child_id, true);
  END LOOP;

  -- Delete dependent records in correct order (children before parents)
  -- sale_items depends on sales
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);
  -- inventory_count_items depends on inventory_counts
  DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE company_id = p_company_id);
  -- price_history depends on products
  DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE company_id = p_company_id);
  -- product_labels depends on products
  DELETE FROM product_labels WHERE company_id = p_company_id;
  -- cash_movements depends on cash_sessions
  DELETE FROM cash_movements WHERE company_id = p_company_id;
  -- cash_sessions depends on companies
  DELETE FROM cash_sessions WHERE company_id = p_company_id;
  -- sales depends on companies
  DELETE FROM sales WHERE company_id = p_company_id;
  -- Other company-level tables
  DELETE FROM action_logs WHERE company_id = p_company_id;
  DELETE FROM loyalty_transactions WHERE company_id = p_company_id;
  DELETE FROM loyalty_config WHERE company_id = p_company_id;
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

  -- Tables added after original function (safe: skip if they don't exist via ON DELETE CASCADE)
  BEGIN DELETE FROM system_errors WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM admin_notifications WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM notas_recebidas WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM dfe_sync_control WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM nfe_imports WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM telemetry WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM fiscal_documents WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM payments WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM discount_limits WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM product_extras WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM product_kits WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM follow_ups WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM returns WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM assemblies WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM showroom_items WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM product_tech_specs WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM customer_reviews WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM furniture_projects WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM room_measurements WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM technical_tickets WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM receipt_counters WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;
  BEGIN DELETE FROM support_messages WHERE company_id = p_company_id; EXCEPTION WHEN undefined_table THEN NULL; END;

  -- Finally delete the company itself
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;
