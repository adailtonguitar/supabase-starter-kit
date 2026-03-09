import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tables that have company_id and can be exported/imported
const EXPORTABLE_TABLES = [
  "suppliers",
  "clients",
  "employees",
  "products",
  "cash_sessions",
  "sales",
  "financial_entries",
  "stock_movements",
];

// Tables that need to be cleaned before main tables (FK dependencies)
// These are deleted first but NOT imported (they are derived/secondary data)
const DEPENDENT_TABLES_DELETE = [
  // These reference sale_items/sales
  { table: "sale_items", fk_via: "sale_id", parent: "sales" },
  // These reference products
  { table: "product_labels", column: "company_id" },
  { table: "product_extras", column: "company_id" },
  { table: "product_kits", column: "company_id" },
  { table: "price_history", column: "company_id" },
  // These reference cash_sessions
  { table: "cash_movements", fk_via: "session_id", parent: "cash_sessions" },
  // These reference clients
  { table: "quotes", column: "company_id" },
  { table: "follow_ups", column: "company_id" },
  // These reference other tables
  { table: "returns", column: "company_id" },
  { table: "receipt_counters", column: "company_id" },
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const userId = claimsData.claims.sub as string;

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

    const results: { table: string; phase: string; count: number; error?: string }[] = [];

    // Phase 1: Delete dependent tables first (to avoid FK violations)
    for (const dep of DEPENDENT_TABLES_DELETE) {
      try {
        if (dep.fk_via && dep.parent) {
          // Table doesn't have company_id — delete via parent IDs
          const { data: parentIds } = await adminClient
            .from(dep.parent)
            .select("id")
            .eq("company_id", company_id);

          if (parentIds && parentIds.length > 0) {
            // Batch delete in chunks of 100
            for (let i = 0; i < parentIds.length; i += 100) {
              const ids = parentIds.slice(i, i + 100).map((r: any) => r.id);
              await adminClient
                .from(dep.table)
                .delete()
                .in(dep.fk_via, ids);
            }
          }
          results.push({ table: dep.table, phase: "dep-delete", count: parentIds?.length || 0 });
        } else {
          // Table has company_id
          const { count, error } = await adminClient
            .from(dep.table)
            .delete({ count: "exact" })
            .eq("company_id", company_id);
          results.push({ table: dep.table, phase: "dep-delete", count: count || 0, error: error?.message });
        }
      } catch (e) {
        // Table may not exist — skip silently
        results.push({ table: dep.table, phase: "dep-delete", count: 0, error: e.message });
      }
    }

    // Phase 2: Delete main tables (reverse order to respect FK)
    const deleteOrder = [...EXPORTABLE_TABLES].reverse();
    for (const table of deleteOrder) {
      try {
        const { count, error } = await adminClient
          .from(table)
          .delete({ count: "exact" })
          .eq("company_id", company_id);
        results.push({ table, phase: "delete", count: count || 0, error: error?.message });
      } catch (e) {
        results.push({ table, phase: "delete", count: 0, error: e.message });
      }
    }

    // Phase 3: Insert backup data (in order)
    for (const table of EXPORTABLE_TABLES) {
      const rows = backup_data[table];
      if (!rows || !Array.isArray(rows) || rows.length === 0) {
        results.push({ table, phase: "insert", count: 0 });
        continue;
      }

      try {
        let totalInserted = 0;
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error } = await adminClient
            .from(table)
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

          if (error) {
            results.push({ table, phase: "insert", count: totalInserted, error: `batch ${i}: ${error.message}` });
          } else {
            totalInserted += batch.length;
          }
        }
        results.push({ table, phase: "insert", count: totalInserted });
      } catch (e) {
        results.push({ table, phase: "insert", count: 0, error: e.message });
      }
    }

    // Also import sale_items if present (no company_id filter)
    if (backup_data.sale_items && Array.isArray(backup_data.sale_items) && backup_data.sale_items.length > 0) {
      try {
        let totalInserted = 0;
        for (let i = 0; i < backup_data.sale_items.length; i += 200) {
          const batch = backup_data.sale_items.slice(i, i + 200);
          const { error } = await adminClient
            .from("sale_items")
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });
          if (error) {
            results.push({ table: "sale_items", phase: "insert", count: totalInserted, error: `batch ${i}: ${error.message}` });
          } else {
            totalInserted += batch.length;
          }
        }
        results.push({ table: "sale_items", phase: "insert", count: totalInserted });
      } catch (e) {
        results.push({ table: "sale_items", phase: "insert", count: 0, error: e.message });
      }
    }

    const hasErrors = results.some(r => r.error);

    return new Response(JSON.stringify({
      success: !hasErrors,
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
