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

/**
 * Calls an Edge Function with a freshly-refreshed access token using raw fetch().
 * This bypasses the Supabase SDK's functions.invoke() which can silently
 * override the Authorization header, causing "Invalid JWT" errors.
 */
export async function invokeEdgeFunctionWithAuth<T = any>(
  functionName: string,
  options: EdgeInvokeOptions = {},
): Promise<EdgeInvokeResponse<T>> {
  // 1. Get fresh access token
  let accessToken: string | null = null;

  try {
    const { data: refreshData } = await supabase.auth.refreshSession();
    accessToken = refreshData.session?.access_token ?? null;
  } catch {
    // refresh failed, try current session
  }

  if (!accessToken) {
    const { data: { session } } = await supabase.auth.getSession();
    accessToken = session?.access_token ?? null;
  }

  if (!accessToken) {
    return {
      data: null,
      error: { message: "Sessão expirada. Faça login novamente." },
    };
  }

  // 2. Call via raw fetch (bypasses SDK header issues)
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
      ...(options.headers ?? {}),
    },
    body: JSON.stringify(options.body ?? {}),
  });

  const text = await resp.text();
  let parsed: T | null = null;
  try {
    parsed = text ? (JSON.parse(text) as T) : null;
  } catch {
    if (!resp.ok) {
      return { data: null, error: { message: text || `HTTP ${resp.status}` } };
    }
    return { data: null, error: null };
  }

  if (!resp.ok) {
    const errObj = parsed as Record<string, unknown> | null;
    const msg =
      (typeof errObj?.error === "string" ? errObj.error : null) ??
      (typeof errObj?.message === "string" ? errObj.message : null) ??
      text ??
      `HTTP ${resp.status}`;
    return { data: parsed, error: { message: msg } };
  }

  return { data: parsed, error: null };
}