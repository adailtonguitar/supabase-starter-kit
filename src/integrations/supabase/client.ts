import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Database = Record<string, any>;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: SupabaseClient<Database>;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    }
  });
} else {
  console.warn('[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY não configurados.');

  const noopSubscription = { unsubscribe: () => {} };

  const authStub = {
    onAuthStateChange: () => ({ data: { subscription: noopSubscription } }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
    signInWithPassword: () => Promise.resolve({ data: { session: null, user: null }, error: { message: 'Supabase not configured' } }),
    signUp: () => Promise.resolve({ data: { session: null, user: null }, error: { message: 'Supabase not configured' } }),
    signInWithOAuth: () => Promise.resolve({ data: { url: null, provider: null }, error: { message: 'Supabase not configured' } }),
    resetPasswordForEmail: () => Promise.resolve({ data: null, error: { message: 'Supabase not configured' } }),
    updateUser: () => Promise.resolve({ data: { user: null }, error: { message: 'Supabase not configured' } }),
  };

  const chainable = () => {
    const chain: any = {
      select: () => chain, eq: () => chain, neq: () => chain, gt: () => chain,
      gte: () => chain, lt: () => chain, lte: () => chain, like: () => chain,
      ilike: () => chain, is: () => chain, in: () => chain, order: () => chain,
      limit: () => chain, range: () => chain, single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
      insert: () => chain, update: () => chain, upsert: () => chain, delete: () => chain,
    };
    return chain;
  };

  supabase = {
    auth: authStub,
    from: () => chainable(),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }), list: () => Promise.resolve({ data: [], error: null }), remove: () => Promise.resolve({ data: null, error: null }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
  } as unknown as SupabaseClient<Database>;
}

export { supabase };
