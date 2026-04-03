-- Ensure admin_delete_company deletes action_logs rows before companies.

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

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales' AND column_name='company_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='sale_items') THEN
    EXECUTE 'DELETE FROM public.sale_items WHERE sale_id IN (SELECT id FROM public.sales WHERE company_id = $1)' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='inventory_count_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_counts') THEN
    EXECUTE 'DELETE FROM public.inventory_count_items WHERE inventory_count_id IN (SELECT id FROM public.inventory_counts WHERE company_id = $1)' USING p_company_id;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='inventory_count_items' AND column_name='inventory_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='inventory_counts') THEN
    EXECUTE 'DELETE FROM public.inventory_count_items WHERE inventory_id IN (SELECT id FROM public.inventory_counts WHERE company_id = $1)' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='action_logs' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.action_logs WHERE company_id = $1' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='price_history' AND column_name='product_id')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.price_history WHERE product_id IN (SELECT id FROM public.products WHERE company_id = $1)' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.products WHERE company_id = $1' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_users' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.company_users WHERE company_id = $1' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='company_plans' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.company_plans WHERE company_id = $1' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='company_id') THEN
    EXECUTE 'DELETE FROM public.subscriptions WHERE company_id = $1' USING p_company_id;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='companies' AND column_name='parent_company_id') THEN
    EXECUTE 'DELETE FROM public.companies WHERE parent_company_id = $1' USING p_company_id;
  END IF;

  EXECUTE 'DELETE FROM public.companies WHERE id = $1' USING p_company_id;
END;
$$;