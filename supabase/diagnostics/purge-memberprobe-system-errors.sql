-- Opcional: remove registros antigos do bug memberProbe (para a contagem da última hora zerar mais rápido).
-- Rode no SQL Editor do Supabase se ainda aparecer pico por causa de linhas antigas.

DELETE FROM public.system_errors
WHERE error_message ILIKE '%memberProbe%'
  AND error_message ILIKE '%not defined%';
