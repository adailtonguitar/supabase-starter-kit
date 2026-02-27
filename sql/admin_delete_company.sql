-- Execute this in the Supabase SQL Editor to create the admin delete function
-- This function uses SECURITY DEFINER to bypass RLS policies

CREATE OR REPLACE FUNCTION public.admin_delete_company(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete in dependency order (children first)
  DELETE FROM sale_items WHERE sale_id IN (SELECT id FROM sales WHERE company_id = p_company_id);
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
  -- Delete child companies first
  DELETE FROM companies WHERE parent_company_id = p_company_id;
  -- Finally delete the company itself
  DELETE FROM companies WHERE id = p_company_id;
END;
$$;
