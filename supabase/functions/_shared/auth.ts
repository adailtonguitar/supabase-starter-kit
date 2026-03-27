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

  // Validate JWT and extract subject (consistent with admin-action)
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claimsData?.claims?.sub) {
    return { ok: false, response: jsonResponse({ error: "Não autorizado" }, 401) };
  }

  return { ok: true, authHeader, token, userId: String(claimsData.claims.sub), supabase };
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

