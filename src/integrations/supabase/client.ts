import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// 🔐 ENV
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL) throw new Error("VITE_SUPABASE_URL não definida");
if (!SUPABASE_ANON_KEY) throw new Error("VITE_SUPABASE_ANON_KEY não definida");

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