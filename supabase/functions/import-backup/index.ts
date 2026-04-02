import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveBackupTableArrays, totalBackupRows } from "../_shared/backup-restore.ts";

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

// Insert order: parents first, children last
// Delete order is reversed automatically
const EXPORTABLE_TABLES = [
  "suppliers",
  "clients",
  "employees",
  "products",      // references suppliers
  "cash_sessions",
  "sales",         // references clients
  "financial_entries",
  "stock_movements", // references products
];

// Tables that need to be cleaned before main tables (FK dependencies)
// These are deleted first but NOT imported (they are derived/secondary data)
const DEPENDENT_TABLES_DELETE = [
  // These reference sale_items/sales
  { table: "sale_items", fk_via: "sale_id", parent: "sales" },
  { table: "production_order_items", column: "company_id" },
  { table: "production_orders", column: "company_id" },
  { table: "recipe_ingredients", column: "company_id" },
  { table: "recipes", column: "company_id" },
  // These reference products
  { table: "inventory_count_items", fk_via: "product_id", parent: "products" },
  { table: "stock_transfer_items", fk_via: "product_id", parent: "products" },
  { table: "product_lots", fk_via: "product_id", parent: "products" },
  { table: "purchase_order_items", column: "company_id" },
  { table: "purchase_orders", column: "company_id" },
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
  { table: "inventory_counts", column: "company_id" },
];

function remapCompanyRows(rows: unknown, companyId: string): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
    .map((row) => {
      const nextRow = { ...row };
      if ("company_id" in nextRow) {
        nextRow.company_id = companyId;
      }
      return nextRow;
    });
}

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
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
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: getCorsHeaders(req) });
    }

    const body = await req.json();
    const { company_id, backup_data, confirm_company_name } = body;

    if (!company_id || !backup_data || !confirm_company_name) {
      return new Response(JSON.stringify({ error: "company_id, backup_data and confirm_company_name are required" }), {
        status: 400, headers: getCorsHeaders(req),
      });
    }

    const { data: company } = await adminClient
      .from("companies")
      .select("name")
      .eq("id", company_id)
      .single();

    if (!company) {
      return new Response(JSON.stringify({ error: "Company not found" }), { status: 404, headers: getCorsHeaders(req) });
    }

    if (company.name.toLowerCase().trim() !== confirm_company_name.toLowerCase().trim()) {
      return new Response(JSON.stringify({ error: "Company name confirmation does not match" }), {
        status: 400, headers: getCorsHeaders(req),
      });
    }

    const backupTables = resolveBackupTableArrays(backup_data, EXPORTABLE_TABLES);
    if (totalBackupRows(backupTables, EXPORTABLE_TABLES) === 0) {
      return new Response(JSON.stringify({ error: "Backup não contém dados nas tabelas esperadas (suppliers, products, sales, …)." }), {
        status: 400, headers: getCorsHeaders(req),
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
      } catch (e: unknown) {
        results.push({ table: dep.table, phase: "dep-delete", count: 0, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    try {
      const { data: supplierIds } = await adminClient.from("suppliers").select("id").eq("company_id", company_id);
      if (supplierIds && supplierIds.length > 0) {
        for (let i = 0; i < supplierIds.length; i += 100) {
          const ids = supplierIds.slice(i, i + 100).map((r: { id: string }) => r.id);
          const { error: upErr } = await adminClient.from("products").update({ supplier_id: null }).in("supplier_id", ids);
          if (upErr) throw upErr;
        }
      }
      results.push({ table: "products", phase: "null-supplier-fk", count: supplierIds?.length ?? 0 });
    } catch (e: unknown) {
      results.push({
        table: "products",
        phase: "null-supplier-fk",
        count: 0,
        error: e instanceof Error ? e.message : "unknown",
      });
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
      } catch (e: unknown) {
        results.push({ table, phase: "delete", count: 0, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    // Phase 3: Insert backup data (in order)
    for (const table of EXPORTABLE_TABLES) {
      const rows = remapCompanyRows(backupTables[table], company_id);
      if (rows.length === 0) {
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
      } catch (e: unknown) {
        results.push({ table, phase: "insert", count: 0, error: e instanceof Error ? e.message : "unknown" });
      }
    }

    // Also import sale_items if present (no company_id filter)
    const saleItems = remapCompanyRows(backupTables.sale_items, company_id);
    if (saleItems.length > 0) {
      try {
        let totalInserted = 0;
        for (let i = 0; i < saleItems.length; i += 200) {
          const batch = saleItems.slice(i, i + 200);
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
      } catch (e: unknown) {
        results.push({ table: "sale_items", phase: "insert", count: 0, error: e instanceof Error ? e.message : "unknown" });
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
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    console.error("import-backup error:", err);
    const message = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: getCorsHeaders(req),
    });
  }
});
