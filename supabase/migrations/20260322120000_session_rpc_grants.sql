-- invalidate_session: beforeunload usava Bearer anon → 401 no PostgREST.
-- Cliente agora envia JWT do usuário; este GRANT cobre fallback e consistência.
GRANT EXECUTE ON FUNCTION public.invalidate_session(TEXT) TO authenticated, anon;
