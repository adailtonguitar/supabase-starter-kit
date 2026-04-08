import { supabase } from "@/integrations/supabase/client";
import { getAccessTokenForEdgeFunctions } from "@/lib/supabase-edge-auth";

type EdgeInvokeOptions = {
  body?: unknown;
  headers?: Record<string, string>;
};

export async function invokeEdgeFunctionWithAuth<T = unknown>(
  functionName: string,
  options: EdgeInvokeOptions = {},
) {
  const auth = await getAccessTokenForEdgeFunctions();

  if ("error" in auth) {
    throw new Error(auth.error);
  }

  return supabase.functions.invoke<T>(functionName, {
    body: options.body,
    headers: {
      ...(options.headers ?? {}),
      Authorization: `Bearer ${auth.token}`,
    },
  });
}