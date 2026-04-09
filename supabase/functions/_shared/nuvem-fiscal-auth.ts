/**
 * Gerenciador central de token Nuvem Fiscal.
 * - Cache em memória com renovação antecipada (60s antes do vencimento)
 * - Retry automático em caso de 401
 * - Logs de geração, expiração e falhas
 */

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

const TOKEN_REFRESH_SKEW_MS = 60_000; // renova 60s antes de expirar

async function generateNewToken(): Promise<{ token: string; expiresAt: number }> {
  const clientId = Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("Credenciais Nuvem Fiscal não configuradas (NUVEM_FISCAL_CLIENT_ID / NUVEM_FISCAL_CLIENT_SECRET)");
  }

  console.log(`[NF-AUTH] Gerando novo token Nuvem Fiscal... ${new Date().toISOString()}`);

  const res = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "empresa cep cnpj nfe nfce distribuicao-nfe",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[NF-AUTH] Falha ao gerar token: HTTP ${res.status} — ${errText.slice(0, 300)}`);
    throw new Error(`Falha ao obter token Nuvem Fiscal (HTTP ${res.status})`);
  }

  const json = await res.json();

  if (!json.access_token) {
    console.error("[NF-AUTH] Resposta sem access_token:", JSON.stringify(json).slice(0, 300));
    throw new Error("Resposta inválida do auth Nuvem Fiscal (sem access_token)");
  }

  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  const expiresAt = Date.now() + expiresIn * 1000;

  console.log(`[NF-AUTH] Token gerado com sucesso. Expira em ${expiresIn}s (${new Date(expiresAt).toISOString()})`);

  return { token: json.access_token, expiresAt };
}

/**
 * Retorna um token válido (do cache ou gera um novo).
 */
export async function getValidNuvemFiscalToken(forceRefresh = false): Promise<string> {
  const now = Date.now();

  if (!forceRefresh && cachedToken && now < tokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
    return cachedToken;
  }

  if (forceRefresh) {
    console.log("[NF-AUTH] Forçando renovação de token (possível 401)");
  }

  const result = await generateNewToken();
  cachedToken = result.token;
  tokenExpiresAt = result.expiresAt;
  return cachedToken;
}

/**
 * Invalida o cache do token (chamado após receber 401).
 */
export function invalidateNuvemFiscalToken(): void {
  console.log("[NF-AUTH] Token invalidado manualmente");
  cachedToken = null;
  tokenExpiresAt = 0;
}

/**
 * Executa uma requisição à API Nuvem Fiscal com:
 * - Token válido (cache ou novo)
 * - Retry automático em caso de 401
 * - Logs de autenticação
 */
export async function nuvemFiscalRequest(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  let token = await getValidNuvemFiscalToken();

  if (!token || token.length < 20) {
    throw new Error("[NF-AUTH] JWT inválido obtido antes da requisição");
  }

  const makeRequest = (t: string) =>
    fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string> ?? {}),
        Authorization: `Bearer ${t}`,
      },
    });

  let response = await makeRequest(token);

  // Auto-retry on 401
  if (response.status === 401) {
    console.warn(`[NF-AUTH] 401 recebido para ${url}. Renovando token e tentando novamente...`);
    invalidateNuvemFiscalToken();

    token = await getValidNuvemFiscalToken(true);

    if (!token || token.length < 20) {
      throw new Error("[NF-AUTH] JWT inválido após renovação");
    }

    response = await makeRequest(token);

    if (response.status === 401) {
      console.error(`[NF-AUTH] 401 persistente após retry para ${url}`);
    } else {
      console.log(`[NF-AUTH] Retry bem-sucedido para ${url} (HTTP ${response.status})`);
    }
  }

  return response;
}
