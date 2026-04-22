import { createClient } from '@supabase/supabase-js';

// Use 'any' for Database type to ensure resilience across schema changes.
// Strict types for RPCs and critical tables are in database.types.ts.
type Database = any;

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SUPABASE_PUBLISHABLE_KEY = SUPABASE_ANON_KEY;

const baseSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
});

/**
 * Proxy wrapper for Supabase client to enforce logging, strict error handling,
 * and multi-tenant isolation validation.
 */
export const supabase = new Proxy(baseSupabase, {
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);

    if (prop === 'from' || prop === 'rpc') {
      return (...args: any[]) => {
        const tableName = args[0];
        const query = value.apply(target, args);
        
        // Skip validation for internal/auth tables or RPCs if needed
        const isGlobalTable = ['profiles', 'companies', 'company_users', 'subscriptions'].includes(tableName);
        const isRpc = prop === 'rpc';

        // Proxy the query object to intercept final execution and validation
        const originalThen = query.then;
        query.then = async (onfulfilled: any, onrejected: any) => {
          try {
            // Strict Validation Requirement:
            // "Before any DB operation: ensure currentCompanyId exists, ensure user is authenticated"
            const { data: { session } } = await baseSupabase.auth.getSession();
            const selectedCompanyId = localStorage.getItem('as_selected_company');

            if (!session) {
              console.error(`[Multi-tenant Block] Unauthorized access attempt to ${tableName}`);
              throw new Error("Sessão expirada ou usuário não autenticado.");
            }

            if (!isGlobalTable && !isRpc && !selectedCompanyId) {
              console.error(`[Multi-tenant Block] No company selected for table: ${tableName}`);
              throw new Error("Nenhuma empresa selecionada para realizar esta operação.");
            }

            // Execute the query
            const result = await originalThen.call(query);
            
            if (result.error) {
              console.error(`[Supabase Error] ${String(prop)} on ${tableName}:`, result.error);
              throw result.error;
            }
            return onfulfilled ? onfulfilled(result) : result;
          } catch (error) {
            console.error(`[Supabase Exception] ${String(prop)} on ${tableName}:`, error);
            if (onrejected) return onrejected(error);
            throw error;
          }
        };
        return query;
      };
    }
    return value;
  }
});

// ─── safeRpc: wrapper resiliente para RPCs ───
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
