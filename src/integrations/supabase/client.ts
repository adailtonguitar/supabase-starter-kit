import { createClient, SupabaseClient } from '@supabase/supabase-js';

type Database = Record<string, unknown>;

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || 'https://fsvxpxziotklbxkivyug.supabase.co').trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzdnhweHppb3RrbGJ4a2l2eXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3ODU5NTMsImV4cCI6MjA4NzM2MTk1M30.8I3ABsRZBZuE1IpK_g9z3PdRUd9Omt_F5qNx0Pgqvyo').trim();

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
    type ChainResult = { data: unknown; error: null };
    type ChainArrayResult = { data: unknown[]; error: null };
    type Chain = Record<string, (...args: unknown[]) => unknown> & {
      single: () => Promise<ChainResult>;
      maybeSingle: () => Promise<ChainResult>;
      then: (resolve: (value: ChainArrayResult) => unknown) => unknown;
    };

    const chain = {} as Chain;
    const ret = () => chain;

    Object.assign(chain, {
      select: ret, eq: ret, neq: ret, gt: ret,
      gte: ret, lt: ret, lte: ret, like: ret,
      ilike: ret, is: ret, in: ret, order: ret,
      limit: ret, range: ret,
      insert: ret, update: ret, upsert: ret, delete: ret,
      single: () => Promise.resolve({ data: null, error: null } as const),
      maybeSingle: () => Promise.resolve({ data: null, error: null } as const),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: [], error: null }),
    } satisfies Partial<Chain>);

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
