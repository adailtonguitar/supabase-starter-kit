import { supabase } from "@/integrations/supabase/client";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-edge-auth";

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
  response?: Response;
};

export async function invokeEdgeFunctionWithAuth<T = any>(
  functionName: string,
  options: EdgeInvokeOptions = {},
): Promise<EdgeInvokeResponse<T>> {
  const auth = await getAccessTokenForEdgeFunctions();

  if ("error" in auth) {
    throw new Error(auth.error);
  }

  return await supabase.functions.invoke<T>(functionName, {
    body: options.body,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${auth.token}`,
    },
  }) as EdgeInvokeResponse<T>;
}