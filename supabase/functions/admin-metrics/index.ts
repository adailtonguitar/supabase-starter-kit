import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    // Verify the caller is a super_admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify user with their JWT using getClaims
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }
    const userId = claimsData.claims.sub as string;

    // Check super_admin role
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

    // Fetch all metrics using service role (bypasses RLS)
    const [companiesRes, usersRes, subsRes, recentRes] = await Promise.all([
      adminClient.from("companies").select("id, is_blocked, is_demo"),
      adminClient.from("company_users").select("id", { count: "exact", head: true }),
      adminClient.from("subscriptions").select("status"),
      adminClient
        .from("companies")
        .select("id, name, created_at")
        .eq("is_demo", false)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    const companies = (companiesRes.data ?? []).filter((c: any) => !c.is_demo);
    const subs = subsRes.data ?? [];

    const metrics = {
      totalCompanies: companies.length,
      activeCompanies: companies.filter((c: any) => !c.is_blocked).length,
      blockedCompanies: companies.filter((c: any) => c.is_blocked).length,
      totalUsers: usersRes.count ?? 0,
      activeSubscriptions: subs.filter((s: any) => s.status === "active").length,
      trialSubscriptions: subs.filter((s: any) => s.status === "trial" || s.status === "trialing").length,
      expiredSubscriptions: subs.filter((s: any) => s.status === "expired" || s.status === "canceled" || s.status === "past_due").length,
      recentCompanies: recentRes.data ?? [],
    };

    return new Response(JSON.stringify(metrics), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("admin-metrics error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: getCorsHeaders(req),
    });
  }
});
