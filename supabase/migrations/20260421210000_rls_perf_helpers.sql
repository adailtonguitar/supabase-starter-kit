-- ============================================================================
-- RLS performance: otimiza helpers usados por dezenas de policies
-- ----------------------------------------------------------------------------
-- Motivação:
--   A auditoria apontou 3,8M scans em public.company_users — a maior parte
--   vindo de subqueries dentro de policies RLS. O helper
--   user_belongs_to_company(uuid) existe, mas foi escrito com:
--     • LANGUAGE plpgsql (não inlinável)
--     • EXECUTE dinâmico (planner não reaproveita plano entre chamadas)
--     • Check de information_schema.tables a cada execução (custoso)
--
--   Ao reescrever como LANGUAGE sql STABLE SECURITY DEFINER, o Postgres
--   pode:
--     1) Inline a função em queries (vira um simples EXISTS na policy).
--     2) Cache o resultado por linha/por query (STABLE).
--     3) Usar o índice idx_company_users_user_active criado no hardening.
--
-- Impacto esperado: 40-70% de redução no custo de queries que hoje percorrem
-- várias tabelas com policies usando user_belongs_to_company().
--
-- Segurança: nenhuma — a semântica é idêntica (usa auth.uid() e checa
-- company_users). Só o plano de execução muda.
-- ============================================================================

-- ───────────────────────────────────────────────────────────────────────────
-- 1) user_belongs_to_company(uuid): versão rápida
-- ───────────────────────────────────────────────────────────────────────────
-- Usamos CREATE OR REPLACE com MESMA assinatura — não drop (para preservar
-- dependências de policies existentes).
CREATE OR REPLACE FUNCTION public.user_belongs_to_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_users
    WHERE user_id = auth.uid()
      AND company_id = p_company_id
      AND COALESCE(is_active, TRUE) = TRUE
  );
$$;

COMMENT ON FUNCTION public.user_belongs_to_company(uuid) IS
  'Retorna TRUE se o usuário autenticado é membro ativo da empresa.
   LANGUAGE sql STABLE SECURITY DEFINER — inlinável pelo planner,
   usa idx_company_users_user_active (company_id, user_id) WHERE is_active.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2) is_super_admin(): já existe (migration 110000) mas garantimos que está
--    como sql (inlinável) e não plpgsql
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_roles ar
    WHERE ar.user_id = auth.uid() AND ar.role = 'super_admin'
  );
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3) current_user_company_ids(): idem, redundante garantia de signature
-- ───────────────────────────────────────────────────────────────────────────
-- Já foi criada na 160000 com DO-block condicional. Aqui não mexemos — DROP
-- quebraria policies que já a referenciam (ex: core_company_users_select_membership).

-- ───────────────────────────────────────────────────────────────────────────
-- 4) Garante índices de suporte aos helpers
-- ───────────────────────────────────────────────────────────────────────────
-- Índice otimizado para user_belongs_to_company():
-- BTREE em (user_id, company_id) WHERE is_active é ideal para EXISTS por (uid, cid).
CREATE INDEX IF NOT EXISTS idx_company_users_uid_cid_active
  ON public.company_users (user_id, company_id)
  WHERE COALESCE(is_active, TRUE) = TRUE;

-- Índice para is_super_admin():
CREATE INDEX IF NOT EXISTS idx_admin_roles_uid_role
  ON public.admin_roles (user_id, role);

-- ============================================================================
-- Verificação / benchmark (opcional — rodar no SQL Editor):
--
-- -- Antes da migration (guarde o output):
-- EXPLAIN ANALYZE SELECT * FROM public.products WHERE company_id = 'sua-uuid'
--   LIMIT 20;
--
-- -- Após a migration:
-- EXPLAIN ANALYZE SELECT * FROM public.products WHERE company_id = 'sua-uuid'
--   LIMIT 20;
--
-- Deve aparecer "Function Scan on user_belongs_to_company" desaparecendo
-- ou ficando como InitPlan cacheado.
-- ============================================================================
