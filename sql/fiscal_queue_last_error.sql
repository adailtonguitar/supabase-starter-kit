-- Adiciona coluna last_error à tabela fiscal_queue (se não existir)
-- EXECUTAR NO SUPABASE SQL EDITOR

ALTER TABLE public.fiscal_queue ADD COLUMN IF NOT EXISTS last_error TEXT DEFAULT NULL;
