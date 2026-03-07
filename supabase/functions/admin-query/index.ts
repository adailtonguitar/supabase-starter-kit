import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Allowed tables for admin queries (whitelist for safety)
const ALLOWED_TABLES = [
  "action_logs",
  "companies",
  "company_users",
  "subscriptions",
  "system_errors",
  "plan_subscriptions",
  "telemetry",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
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
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
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
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    const body = await req.json();
    const { table, select = "*", filters = [], order, limit = 300, count_only = false } = body;

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return new Response(JSON.stringify({ error: "Invalid table" }), { status: 400, headers: corsHeaders });
    }

    if (count_only) {
      const { count, error } = await adminClient
        .from(table)
        .select(select, { count: "exact", head: true });
      if (error) throw error;
      return new Response(JSON.stringify({ count }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = adminClient.from(table).select(select);

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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-query error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
