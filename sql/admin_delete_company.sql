-- Execute this in the Supabase SQL Editor to create the admin delete function
-- This function uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete in strict dependency order (deepest children first)

  -- 1) sale_items (FK to sales AND products)
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);

  -- 2) inventory_count_items (FK to inventory_counts)
  DELETE FROM inventory_count_items WHERE inventory_count_id IN (SELECT id FROM inventory_counts WHERE company_id = p_company_id);

  -- 3) product_labels (FK to products)
  DELETE FROM product_labels WHERE company_id = p_company_id;

  -- 4) price_history (FK to products)
  DELETE FROM price_history WHERE product_id IN (SELECT id FROM products WHERE company_id = p_company_id);

  -- 5) cash_movements (FK to cash_sessions)
  DELETE FROM cash_movements WHERE company_id = p_company_id;

  -- 6) Tables with only company_id FK
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

  -- Company plans
  DELETE FROM company_plans WHERE company_id = p_company_id;

  -- Delete child companies first (recursive)
  DELETE FROM companies WHERE parent_company_id = p_company_id;
  -- Finally delete the company itself
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;
