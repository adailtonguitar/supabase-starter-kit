import { supabase } from "@/integrations/supabase/client";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/integrations/supabase/client";

type EdgeInvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

type EdgeInvokeResponse<T> = {
  data: T | null;
  error: {
    message?: string;
    context?: Response;
  } | null;
};

const JWT_REFRESH_SKEW_MS = 30_000;

function decodeJwtExp(token: string): number | null {
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const decoded = JSON.parse(atob(padded)) as { exp?: number };
    return typeof decoded.exp === "number" ? decoded.exp : null;
  } catch {
    return null;
  }
}

function isTokenStillValid(token: string | null | undefined): token is string {
  if (!token) return false;
  const exp = decodeJwtExp(token);
  if (!exp) return true;
  return exp * 1000 > Date.now() + JWT_REFRESH_SKEW_MS;
}

async function getValidAccessToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (isTokenStillValid(session?.access_token)) {
      return session.access_token;
    }
  }

  try {
    const { data } = await supabase.auth.refreshSession();
    if (isTokenStillValid(data.session?.access_token)) {
      return data.session.access_token;
    }
  } catch {
    // ignore and fall back to the latest in-memory session below
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return isTokenStillValid(session?.access_token) ? session.access_token : null;
}

async function invokeWithToken<T>(functionName: string, options: EdgeInvokeOptions, accessToken: string): Promise<{
  response: Response;
  text: string;
  parsed: T | null;
}> {
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(options.body ?? {}),
  });

  const text = await response.text();

  try {
    return {
      response,
      text,
      parsed: text ? (JSON.parse(text) as T) : null,
    };
  } catch {
    return {
      response,
      text,
      parsed: null,
    };
  }
}

function extractEdgeErrorMessage<T>(response: Response, text: string, parsed: T | null): string {
  if (!response.ok) {
    const errObj = parsed as Record<string, unknown> | null;
    return (
      (typeof errObj?.error === "string" ? errObj.error : null) ??
      (typeof errObj?.message === "string" ? errObj.message : null) ??
      text ??
      `HTTP ${response.status}`
    );
  }

  return "";
}

/**
 * Calls an Edge Function with a freshly-refreshed access token using raw fetch().
 * This bypasses the Supabase SDK's functions.invoke() which can silently
 * override the Authorization header, causing "Invalid JWT" errors.
 */
export async function invokeEdgeFunctionWithAuth<T = any>(
  functionName: string,
  options: EdgeInvokeOptions = {},
): Promise<EdgeInvokeResponse<T>> {
  let accessToken = await getValidAccessToken();

  if (!accessToken) {
    return {
      data: null,
      error: { message: "Sessão expirada. Faça login novamente." },
    };
  }

  let result = await invokeWithToken<T>(functionName, options, accessToken);
  let message = extractEdgeErrorMessage(result.response, result.text, result.parsed);

  if (
    result.response.status === 401 &&
    /invalid jwt|missing authorization header|invalid token/i.test(message)
  ) {
    const refreshedAccessToken = await getValidAccessToken(true);
    if (refreshedAccessToken && refreshedAccessToken !== accessToken) {
      accessToken = refreshedAccessToken;
      result = await invokeWithToken<T>(functionName, options, accessToken);
      message = extractEdgeErrorMessage(result.response, result.text, result.parsed);
    }
  }

  if (!result.response.ok) {
    return {
      data: result.parsed,
      error: { message, context: result.response },
    };
  }

  return { data: result.parsed, error: null };
}