import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TABLES_TO_EXPORT = [
  "products",
  "sales",
  "clients",
  "suppliers",
  "financial_entries",
  "stock_movements",
  "employees",
  "cash_sessions",
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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const body = await req.json();
    const { company_id } = body;

    if (!company_id) {
      return new Response(JSON.stringify({ error: "company_id required" }), { status: 400, headers: corsHeaders });
    }

    // Verify super_admin
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: roleData } = await adminClient
      .from("admin_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "super_admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Get company name
    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    const backup: Record<string, any[]> = {};
    const errors: string[] = [];

    for (const table of TABLES_TO_EXPORT) {
      try {
        const { data, error } = await adminClient
          .from(table)
          .select("*")
          .eq("company_id", company_id)
          .limit(10000);

        if (error) {
          errors.push(`${table}: ${error.message}`);
          backup[table] = [];
        } else {
          backup[table] = data || [];
        }
      } catch (e) {
        errors.push(`${table}: ${e.message}`);
        backup[table] = [];
      }
    }

    const result = {
      metadata: {
        company_id,
        company_name: company?.name || "Unknown",
        exported_at: new Date().toISOString(),
        tables: Object.keys(backup).map(t => ({ table: t, rows: backup[t].length })),
        errors: errors.length > 0 ? errors : undefined,
      },
      data: backup,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="backup-${company_id}.json"`,
      },
    });
  } catch (err) {
    console.error("export-backup error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
