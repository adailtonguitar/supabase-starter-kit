import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// 🔐 Public keys (anon key is safe to expose — RLS protects data)
// Fix: do not depend on build-time env injection here, because a stale/invalid
// build secret can override the correct public key in production.
const SUPABASE_URL = "https://fsvxpxziotklbxkivyug.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo";

// 🚀 CLIENT
export const supabase = createClient<any>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// ✅ RPC SEGURO (VERSÃO CORRETA)
export async function safeRpc<T = unknown>(
  fn: string,
  params?: Record<string, unknown>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const { data, error } = await supabase.rpc(fn, params || {});

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data as T };
  } catch (err) {
    return { success: false, error: safeError(err) };
  }
}

// ✅ TRATAMENTO DE ERRO
export function safeError(error: unknown): string {
  if (!error) return "Erro desconhecido";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && "message" in error) {
    return String((error as any).message);
  }
  return "Erro inesperado";
}