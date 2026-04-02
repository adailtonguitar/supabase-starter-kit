-- Auditoria completa de UMA empresa no banco.
-- Supabase → SQL Editor → role postgres.
--
-- Altere o UUID em TODOS os blocos abaixo (busque e substitua se mudar de empresa).

-- ========== 1) Empresa + painel de contagens (uma linha só) ==========
WITH p AS (
  SELECT 'b9698509-6620-4f62-8de2-e17569f51ae2'::uuid AS cid
)
SELECT
  (SELECT id FROM companies WHERE id = (SELECT cid FROM p)) AS company_id,
  (SELECT name FROM companies WHERE id = (SELECT cid FROM p)) AS nome,
  (SELECT cnpj FROM companies WHERE id = (SELECT cid FROM p)) AS cnpj,
  (SELECT is_demo FROM companies WHERE id = (SELECT cid FROM p)) AS is_demo,
  (SELECT is_blocked FROM companies WHERE id = (SELECT cid FROM p)) AS is_blocked,
  (SELECT count(*)::bigint FROM suppliers WHERE company_id = (SELECT cid FROM p)) AS suppliers,
  (SELECT count(*)::bigint FROM clients WHERE company_id = (SELECT cid FROM p)) AS clients,
  (SELECT count(*)::bigint FROM employees WHERE company_id = (SELECT cid FROM p)) AS employees,
  (SELECT count(*)::bigint FROM products WHERE company_id = (SELECT cid FROM p)) AS products,
  (SELECT count(*)::bigint FROM cash_sessions WHERE company_id = (SELECT cid FROM p)) AS cash_sessions,
  (SELECT count(*)::bigint FROM sales WHERE company_id = (SELECT cid FROM p)) AS sales,
  (SELECT count(*)::bigint FROM financial_entries WHERE company_id = (SELECT cid FROM p)) AS financial_entries,
  (SELECT count(*)::bigint FROM stock_movements WHERE company_id = (SELECT cid FROM p)) AS stock_movements,
  (SELECT count(*)::bigint FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE s.company_id = (SELECT cid FROM p)) AS sale_items,
  (SELECT count(*)::bigint FROM company_users WHERE company_id = (SELECT cid FROM p)) AS company_users,
  (SELECT count(*)::bigint
     FROM products p2
     JOIN suppliers s ON s.id = p2.supplier_id
     WHERE s.company_id = (SELECT cid FROM p)
       AND p2.company_id IS DISTINCT FROM (SELECT cid FROM p)
  ) AS produtos_outros_tenants_presos_nestes_fornecedores;

-- ========== 2) Amostra de produtos desta empresa (últimos 15) ==========
WITH p AS (
  SELECT 'b9698509-6620-4f62-8de2-e17569f51ae2'::uuid AS cid
)
SELECT id, name, sku, is_active, supplier_id, created_at
FROM public.products
WHERE company_id = (SELECT cid FROM p)
ORDER BY created_at DESC NULLS LAST
LIMIT 15;

-- ========== 3) Membros / acesso ==========
WITH p AS (
  SELECT 'b9698509-6620-4f62-8de2-e17569f51ae2'::uuid AS cid
)
SELECT cu.user_id, cu.role, cu.is_active, au.email
FROM public.company_users cu
LEFT JOIN auth.users au ON au.id = cu.user_id
WHERE cu.company_id = (SELECT cid FROM p);
