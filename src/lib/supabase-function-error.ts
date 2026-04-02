function humanizeKnownEdgeMessages(msg: string): string {
  if (/invalid jwt/i.test(msg)) {
    return "Sessão expirada ou token inválido. Atualize a página ou faça login novamente e tente de novo.";
  }
  return msg;
}

/**
 * Extrai mensagem legível de supabase.functions.invoke quando error != null.
 * O SDK 2.x devolve { data, error, response? }; em HTTP de erro, `response` é o Response bruto.
 */
export async function messageFromFunctionsInvokeError(
  error: unknown,
  response?: Response | null,
): Promise<string> {
  const fallback =
    error instanceof Error ? error.message : "Erro ao chamar função";

  const res =
    response ??
    (error && typeof error === "object" && "context" in error
      ? (error as { context?: Response }).context
      : undefined);

  if (!res || typeof res.clone !== "function") return fallback;

  try {
    const raw = (await res.clone().text()).trim();
    if (raw) {
      try {
        const j = JSON.parse(raw) as { error?: string; message?: string };
        if (typeof j.error === "string" && j.error.length > 0) return humanizeKnownEdgeMessages(j.error);
        if (typeof j.message === "string" && j.message.length > 0) return humanizeKnownEdgeMessages(j.message);
      } catch {
        if (raw.length < 600) return humanizeKnownEdgeMessages(raw);
      }
    }
  } catch {
    /* ignore */
  }

  if (fallback.includes("non-2xx") && res.status) {
    return `Falha na função (HTTP ${res.status}). Se acabou de alterar o código, faça deploy da Edge Function no Supabase e confira os logs.`;
  }

  return humanizeKnownEdgeMessages(fallback);
}
