-- Rodar no Supabase → SQL Editor (role: postgres ou service).
-- Ajuste o e-mail se for outro usuário.

-- 1) Empresas vinculadas ao login
SELECT
  c.id AS company_id,
  c.name,
  cu.is_active,
  cu.role,
  au.email
FROM public.company_users cu
JOIN public.companies c ON c.id = cu.company_id
JOIN auth.users au ON au.id = cu.user_id
WHERE au.email = 'adailtonguitar@gmail.com'
ORDER BY c.name;

-- 2) Contagens por empresa encontrada pelo nome (ajuste o ILIKE se precisar)

WITH target AS (
  SELECT id::uuid AS company_id
  FROM public.companies
  WHERE name ILIKE '%ADAILTON PAULO DA ROCHA%'
  LIMIT 1
)
SELECT
  (SELECT company_id FROM target) AS resolved_company_id,
  (SELECT count(*)::int FROM public.products p WHERE p.company_id = (SELECT company_id FROM target)) AS products,
  (SELECT count(*)::int FROM public.clients p WHERE p.company_id = (SELECT company_id FROM target)) AS clients,
  (SELECT count(*)::int FROM public.sales p WHERE p.company_id = (SELECT company_id FROM target)) AS sales,
  (SELECT count(*)::int FROM public.suppliers p WHERE p.company_id = (SELECT company_id FROM target)) AS suppliers,
  (SELECT count(*)::int FROM public.sale_items si
     JOIN public.sales s ON s.id = si.sale_id
     WHERE s.company_id = (SELECT company_id FROM target)) AS sale_items;

-- 3) Problema típico do restore: produtos que ainda referenciam fornecedores desta empresa
--    mas com company_id diferente (bloqueia DELETE em suppliers)
WITH target AS (
  SELECT id::uuid AS company_id
  FROM public.companies
  WHERE name ILIKE '%ADAILTON PAULO DA ROCHA%'
  LIMIT 1
),
sup AS (
  SELECT s.id FROM public.suppliers s
  WHERE s.company_id = (SELECT company_id FROM target)
)
SELECT
  p.id AS product_id,
  p.company_id AS product_company_id,
  p.name,
  p.supplier_id
FROM public.products p
WHERE p.supplier_id IN (SELECT id FROM sup)
  AND (p.company_id IS DISTINCT FROM (SELECT company_id FROM target))
LIMIT 50;

-- 4) Se a linha 2 retornar resolved_company_id NULL, o nome não bateu — use o UUID da query 1.
