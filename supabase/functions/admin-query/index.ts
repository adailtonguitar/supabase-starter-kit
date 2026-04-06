import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// Allowed tables for admin queries (whitelist for safety)
const ALLOWED_TABLES = [
  "action_logs",
  "companies",
  "company_users",
  "company_plans",
  "subscriptions",
  "system_errors",
  "plan_subscriptions",
  "telemetry",
  "products",
  "sales",
  "cash_sessions",
  "admin_notifications",
  "payment_webhook_logs",
  "payments",
  "profiles",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = claimsData.claims.sub as string;

    // Verify super_admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: getCorsHeaders(req) });
    }

    const body = await req.json();
    const { table, select = "*", filters = [], order, limit = 300, count_only = false } = body;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: "Invalid table" }), { status: 400, headers: getCorsHeaders(req) });
    }

    if (count_only) {
      const { count, error } = await adminClient
        .from(table)
        .select(select, { count: "exact", head: true });
      if (error) throw error;
      return new Response(JSON.stringify({ count }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    let query: any = adminClient.from(table).select(select);

    // Apply filters
    for (const f of filters) {
      if (f.op === "eq") query = query.eq(f.column, f.value);
      else if (f.op === "neq") query = query.neq(f.column, f.value);
      else if (f.op === "in") query = query.in(f.column, f.value);
      else if (f.op === "gte") query = query.gte(f.column, f.value);
      else if (f.op === "lte") query = query.lte(f.column, f.value);
      else if (f.op === "is") query = query.is(f.column, f.value);
      else if (f.op === "ilike") query = query.ilike(f.column, f.value);
    }

    if (order) {
      query = query.order(order.column, { ascending: order.ascending ?? false });
    }

    query = query.limit(limit);

    const { data, error } = await query;
    if (error) throw error;

    return new Response(JSON.stringify({ data }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("admin-query error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
