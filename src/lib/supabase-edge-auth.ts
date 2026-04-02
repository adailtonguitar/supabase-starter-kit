import { supabase } from "@/integrations/supabase/client";

/**
 * Obtém um access_token atualizado para chamar Edge Functions.
 * Evita "Invalid JWT" quando a aba ficou aberta e o token expirou antes do auto-refresh.
 */
export async function getAccessTokenForEdgeFunctions(): Promise<{ token: string } | { error: string }> {
  const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshData.session?.access_token) {
    return { token: refreshData.session.access_token };
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { token: session.access_token };
  }

  return {
    error:
      refreshErr?.message?.includes("JWT") || refreshErr?.message?.includes("refresh")
        ? "Sessão expirada. Faça login novamente e tente restaurar o backup."
        : refreshErr?.message || "Faça login novamente para restaurar o backup.",
  };
}
