-- =============================================
-- MODO DEMONSTRAÇÃO - Colunas auxiliares
-- Execute no SQL Editor do Supabase
-- =============================================

-- 1) Flag na tabela companies para marcar conta demo
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 2) Flag nos produtos para identificar dados demo
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 3) Flag nos clientes para identificar dados demo
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;

-- 4) Flag nas vendas para identificar dados demo
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT false;
