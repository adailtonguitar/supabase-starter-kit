import { createClient } from "@supabase/supabase-js";

type Database = any;

export const SUPABASE_URL = "https://fsvxpxziotklbxkivyug.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

export interface SafeRpcResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
}

export async function safeRpc<T = any>(
  fnName: string,
  params?: Record<string, unknown>,
): Promise<SafeRpcResult<T>> {
  try {
    const { data, error } = await supabase.rpc(fnName, params);
    if (error) return { success: false, data: null, error: error.message };
    return { success: true, data: data as T, error: null };
  } catch (e: any) {
    return { success: false, data: null, error: e?.message || "RPC failed" };
  }
}

export default supabase;