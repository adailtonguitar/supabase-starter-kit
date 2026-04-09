import { createClient } from "npm:@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function getCorsHeaders(_req?: Request) {
  return corsHeaders;
}

export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader;
}

export function createUserClient(authHeader: string): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceKey);
}

async function resolveUserIdFromToken(token: string, authHeader: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await (userClient.auth as any).getClaims(token);
    if (!error && data?.claims?.sub) {
      console.log("[auth] getClaims OK, sub:", String(data.claims.sub).slice(0, 8));
      return String(data.claims.sub);
    }
    if (error) {
      console.warn("[auth] getClaims falhou:", error.message || JSON.stringify(error));
    }
  } catch {
    console.warn("[auth] getClaims exception, tentando getUser fallback");
  }

  try {
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await adminClient.auth.getUser(token);
    if (!error && data?.user?.id) {
      console.log("[auth] getUser OK, id:", String(data.user.id).slice(0, 8));
      return String(data.user.id);
    }
    if (error) {
      console.error("[auth] getUser também falhou:", error.message || JSON.stringify(error));
    }
  } catch {
    console.error("[auth] getUser exception — token completamente inválido");
  }

  console.error("[auth] Nenhum método conseguiu resolver o userId do token");
  return null;
}

export async function requireUser(req: Request): Promise<
  | { ok: true; authHeader: string; token: string; userId: string; supabase: SupabaseClient }
  | { ok: false; response: Response }
> {
  const authHeader = getAuthHeader(req);
  if (!authHeader) {
    return { ok: false, response: jsonResponse({ error: "Não autorizado" }, 401) };
  }

  const token = authHeader.replace("Bearer ", "");
  const supabase = createUserClient(authHeader);
  const userId = await resolveUserIdFromToken(token, authHeader);

  if (!userId) {
    return { ok: false, response: jsonResponse({ error: "Não autorizado" }, 401) };
  }

  return { ok: true, authHeader, token, userId, supabase };
}

export async function requireCompanyMembership(args: {
  supabase: SupabaseClient;
  userId: string;
  companyId: string;
}): Promise<{ ok: true } | { ok: false; response: Response }> {
  const { data, error } = await args.supabase
    .from("company_users")
    .select("id")
    .eq("user_id", args.userId)
    .eq("company_id", args.companyId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, response: jsonResponse({ error: "Forbidden" }, 403) };
  }

  return { ok: true };
}

