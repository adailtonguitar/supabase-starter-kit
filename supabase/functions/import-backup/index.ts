import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Order matters: delete in reverse, insert in order (respecting foreign keys)
const IMPORT_ORDER = [
  "categories",
  "suppliers",
  "clients",
  "employees",
  "products",
  "cash_sessions",
  "sales",
  "sale_items",
  "financial_entries",
  "stock_movements",
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
    const { company_id, backup_data, confirm_company_name } = body;

    if (!company_id || !backup_data || !confirm_company_name) {
      return new Response(JSON.stringify({ error: "company_id, backup_data and confirm_company_name are required" }), {
        status: 400, headers: corsHeaders,
      });
    }

    // Verify company exists and name matches
    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), { status: 404, headers: corsHeaders });
    }

    if (company.name.toLowerCase().trim() !== confirm_company_name.toLowerCase().trim()) {
      return new Response(JSON.stringify({ error: "Company name confirmation does not match" }), {
        status: 400, headers: corsHeaders,
      });
    }

    const results: { table: string; deleted: number; inserted: number; error?: string }[] = [];

    // Phase 1: Delete existing data (reverse order to respect FK)
    const deleteOrder = [...IMPORT_ORDER].reverse();
    for (const table of deleteOrder) {
      try {
        const { count, error } = await adminClient
          .from(table)
          .delete({ count: "exact" })
          .eq("company_id", company_id);

        if (error) {
          results.push({ table, deleted: 0, inserted: 0, error: `delete: ${error.message}` });
        } else {
          results.push({ table, deleted: count || 0, inserted: 0 });
        }
      } catch (e) {
        results.push({ table, deleted: 0, inserted: 0, error: `delete: ${e.message}` });
      }
    }

    // Phase 2: Insert backup data (in order to respect FK)
    for (const table of IMPORT_ORDER) {
      const rows = backup_data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        const existing = results.find(r => r.table === table);
        if (existing) existing.inserted = 0;
        continue;
      }

      try {
        // Insert in batches of 200
        let totalInserted = 0;
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error } = await adminClient
            .from(table)
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

          if (error) {
            const existing = results.find(r => r.table === table);
            if (existing) existing.error = (existing.error || "") + ` insert batch ${i}: ${error.message}`;
          } else {
            totalInserted += batch.length;
          }
        }

        const existing = results.find(r => r.table === table);
        if (existing) existing.inserted = totalInserted;
      } catch (e) {
        const existing = results.find(r => r.table === table);
        if (existing) existing.error = (existing.error || "") + ` insert: ${e.message}`;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      company_id,
      company_name: company.name,
      restored_at: new Date().toISOString(),
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("import-backup error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
