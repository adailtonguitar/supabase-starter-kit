import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveBackupTableArrays, totalBackupRows } from "../_shared/backup-restore.ts";

/** Base URLs; adicione previews (ex.: Vercel) em Supabase → Edge Functions → restore-my-backup → ALLOWED_ORIGINS (lista separada por vírgula). */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://app.anthosystem.com",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];

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

const DEPENDENT_TABLES_DELETE = [
  { table: "sale_items", fk_via: "sale_id", parent: "sales" },
  // Produção / receitas referenciam products e recipes — limpar antes de products
  { table: "production_order_items", column: "company_id" },
  { table: "production_orders", column: "company_id" },
  { table: "recipe_ingredients", column: "company_id" },
  { table: "recipes", column: "company_id" },
  { table: "inventory_count_items", fk_via: "product_id", parent: "products" },
  { table: "stock_transfer_items", fk_via: "product_id", parent: "products" },
  { table: "product_lots", fk_via: "product_id", parent: "products" },
  { table: "purchase_order_items", column: "company_id" },
  { table: "purchase_orders", column: "company_id" },
  { table: "product_labels", column: "company_id" },
  { table: "product_extras", column: "company_id" },
  { table: "product_kits", column: "company_id" },
  { table: "price_history", column: "company_id" },
  { table: "cash_movements", fk_via: "session_id", parent: "cash_sessions" },
  { table: "quotes", column: "company_id" },
  { table: "follow_ups", column: "company_id" },
  { table: "returns", column: "company_id" },
  { table: "receipt_counters", column: "company_id" },
  { table: "inventory_counts", column: "company_id" },
];

function mergedAllowedOrigins(): string[] {
  const fromEnv = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...fromEnv])];
}

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = mergedAllowedOrigins();
  const allowedOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildDefaultFiscalConfigs(companyId: string) {
  return [
    {
      company_id: companyId,
      doc_type: "nfce",
      serie: 1,
      next_number: 1,
      environment: "homologacao",
      csc_id: null,
      csc_token: null,
      is_active: true,
      certificate_type: "A1",
    },
    {
      company_id: companyId,
      doc_type: "nfe",
      serie: 1,
      next_number: 1,
      environment: "homologacao",
      csc_id: null,
      csc_token: null,
      is_active: true,
      certificate_type: "A1",
    },
    {
      company_id: companyId,
      doc_type: "sat",
      serie: 1,
      next_number: 1,
      environment: "producao",
      csc_id: null,
      csc_token: null,
      is_active: false,
      certificate_type: "A1",
    },
  ];
}

async function parseRequestJsonSafe(req: Request) {
  const raw = await req.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("JSON inválido no corpo da requisição");
  }
}

function remapCompanyRows(rows: unknown, companyId: string): Record<string, unknown>[] {
  if (!Array.isArray(rows)) return [];

  return rows
    .filter((row): row is Record<string, unknown> => row !== null && typeof row === "object")
    .map((row) => {
      // Sempre gravar no tenant alvo; backups sem chave company_id falhavam silenciosamente ou com FK errada.
      return { ...row, company_id: companyId };
    });
}

/** O app lista produtos com is_active true ou null — false some de PDV/listas. */
function normalizeRestoredProductRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    ...r,
    is_active: r.is_active === false ? true : (r.is_active ?? true),
  }));
}

async function resolveOrCreateCompany(
  adminClient: any,
  userId: string,
  sourceCompanyName: string,
  targetCompanyIdHint: string | null | undefined,
): Promise<{ id: string; name: string; companyCreated: boolean }> {
  const normalizedSourceName = normalizeName(sourceCompanyName);
  const { data: memberships, error: membershipError } = await adminClient
    .from("company_users")
    .select("company_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (membershipError) throw membershipError;

  const activeCompanyIds = [...new Set(((memberships || []) as any[]).map((m: any) => m.company_id).filter(Boolean))] as string[];

  if (activeCompanyIds.length > 0) {
    if (targetCompanyIdHint && activeCompanyIds.includes(targetCompanyIdHint)) {
      const { data: hinted, error: hintedErr } = await adminClient
        .from("companies")
        .select("id, name")
        .eq("id", targetCompanyIdHint)
        .maybeSingle();
      if (!hintedErr && hinted?.id) {
        return { id: hinted.id, name: hinted.name, companyCreated: false };
      }
    }

    const { data: companies, error: companiesError } = await adminClient
      .from("companies")
      .select("id, name")
      .in("id", activeCompanyIds);

    if (companiesError) throw companiesError;

    const validCompanies = (companies || []) as { id: string; name: string }[];
    if (validCompanies.length === 1) {
      return { id: validCompanies[0].id, name: validCompanies[0].name, companyCreated: false };
    }

    if (validCompanies.length > 1) {
      const exactMatch = validCompanies.find((company) => normalizeName(company.name) === normalizedSourceName);
      if (exactMatch) {
        return { id: exactMatch.id, name: exactMatch.name, companyCreated: false };
      }

      throw new Error(
        "Seu usuário possui mais de uma empresa ativa e o nome no backup não bate com nenhuma delas. Abra o app já na empresa destino (trocar filial) e tente de novo, ou use Admin > Backup para escolher o destino.",
      );
    }
  }

  if (!sourceCompanyName.trim()) {
    throw new Error("Nome da empresa no backup é obrigatório para recriar o cadastro");
  }

  const { data: newCompany, error: companyError } = await adminClient
    .from("companies")
    .insert({
      name: sourceCompanyName.trim(),
      cnpj: "",
      phone: null,
    } as any)
    .select("id, name")
    .single();

  if (companyError || !newCompany) throw companyError ?? new Error("Falha ao recriar a empresa");

  const { error: linkError } = await adminClient
    .from("company_users")
    .insert({
      company_id: (newCompany as any).id,
      user_id: userId,
      role: "admin",
      is_active: true,
    } as any);

  if (linkError) throw linkError;

  const { error: fiscalConfigError } = await adminClient
    .from("fiscal_configs")
    .upsert(buildDefaultFiscalConfigs((newCompany as any).id) as any[], { onConflict: "company_id,doc_type" });

  if (fiscalConfigError) throw fiscalConfigError;

  return { id: (newCompany as any).id, name: (newCompany as any).name, companyCreated: true };
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

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: claimsError?.message || "Não autorizado — faça login novamente." }),
        { status: 401, headers: getCorsHeaders(req) },
      );
    }
    const userId = claimsData.claims.sub as string;

    const adminClient = createClient(supabaseUrl, serviceKey);

    const body = await parseRequestJsonSafe(req);
    const rawBackup = body?.backup_data;
    const sourceCompanyName = String(body?.source_company_name ?? "").trim();
    const targetCompanyIdHint =
      typeof body?.target_company_id === "string" && body.target_company_id.length > 0
        ? body.target_company_id
        : null;

    if (!rawBackup || typeof rawBackup !== "object") {
      return new Response(JSON.stringify({ error: "backup_data é obrigatório" }), { status: 400, headers: getCorsHeaders(req) });
    }

    const backupTables = resolveBackupTableArrays(rawBackup, EXPORTABLE_TABLES);
    const backupRowTotal = totalBackupRows(backupTables, EXPORTABLE_TABLES);
    if (backupRowTotal === 0) {
      return new Response(
        JSON.stringify({
          error:
            "Nenhuma tabela com dados neste arquivo. Use o JSON exportado pelo app (com suppliers, products, sales…) ou, no backup semanal, o conteúdo de \"data\" da empresa escolhida — não envie só o objeto metadata.",
        }),
        { status: 400, headers: getCorsHeaders(req) },
      );
    }

    const backupRowsPreview = Object.fromEntries(
      [...EXPORTABLE_TABLES, "sale_items"].map((k) => [k, backupTables[k].length]),
    );

    const targetCompany = await resolveOrCreateCompany(adminClient, userId, sourceCompanyName, targetCompanyIdHint);
    const companyId = targetCompany.id;
    const results: { table: string; phase: string; count: number; error?: string }[] = [];

    for (const dep of DEPENDENT_TABLES_DELETE) {
      try {
        if (dep.fk_via && dep.parent) {
          const { data: parentIds } = await adminClient
            .from(dep.parent)
            .select("id")
            .eq("company_id", companyId);

          if (parentIds && parentIds.length > 0) {
            for (let i = 0; i < parentIds.length; i += 100) {
              const ids = parentIds.slice(i, i + 100).map((row: { id: string }) => row.id);
              await adminClient
                .from(dep.table)
                .delete()
                .in(dep.fk_via, ids);
            }
          }

          results.push({ table: dep.table, phase: "dep-delete", count: parentIds?.length || 0 });
        } else {
          const { count, error } = await adminClient
            .from(dep.table)
            .delete({ count: "exact" })
            .eq("company_id", companyId);
          results.push({ table: dep.table, phase: "dep-delete", count: count || 0, error: error?.message });
        }
      } catch (error) {
        results.push({ table: dep.table, phase: "dep-delete", count: 0, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    // Libera DELETE em suppliers: produtos com company_id divergente ainda podem referenciar fornecedores deste tenant.
    try {
      const { data: supplierIds } = await adminClient.from("suppliers").select("id").eq("company_id", companyId);
      if (supplierIds && supplierIds.length > 0) {
        for (let i = 0; i < supplierIds.length; i += 100) {
          const ids = supplierIds.slice(i, i + 100).map((row: { id: string }) => row.id);
          const { error: upErr } = await adminClient.from("products").update({ supplier_id: null }).in("supplier_id", ids);
          if (upErr) throw upErr;
        }
      }
      results.push({ table: "products", phase: "null-supplier-fk", count: supplierIds?.length ?? 0 });
    } catch (error) {
      results.push({
        table: "products",
        phase: "null-supplier-fk",
        count: 0,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    for (const table of [...EXPORTABLE_TABLES].reverse()) {
      try {
        const { count, error } = await adminClient
          .from(table)
          .delete({ count: "exact" })
          .eq("company_id", companyId);
        results.push({ table, phase: "delete", count: count || 0, error: error?.message });
      } catch (error) {
        results.push({ table, phase: "delete", count: 0, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    for (const table of EXPORTABLE_TABLES) {
      let rows = remapCompanyRows(backupTables[table], companyId);
      if (table === "products") rows = normalizeRestoredProductRows(rows);
      if (rows.length === 0) {
        results.push({ table, phase: "insert", count: 0 });
        continue;
      }

      try {
        let totalInserted = 0;
        let insertErr: string | undefined;
        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error } = await adminClient
            .from(table)
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

          if (error) {
            insertErr = `batch ${i}: ${error.message}`;
            break;
          }
          totalInserted += batch.length;
        }
        results.push({ table, phase: "insert", count: totalInserted, ...(insertErr ? { error: insertErr } : {}) });
      } catch (error) {
        results.push({ table, phase: "insert", count: 0, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    const saleItems = remapCompanyRows(backupTables.sale_items, companyId);
    if (saleItems.length > 0) {
      try {
        let totalInserted = 0;
        let insertErr: string | undefined;
        for (let i = 0; i < saleItems.length; i += 200) {
          const batch = saleItems.slice(i, i + 200);
          const { error } = await adminClient
            .from("sale_items")
            .upsert(batch, { onConflict: "id", ignoreDuplicates: false });

          if (error) {
            insertErr = `batch ${i}: ${error.message}`;
            break;
          }
          totalInserted += batch.length;
        }
        results.push({ table: "sale_items", phase: "insert", count: totalInserted, ...(insertErr ? { error: insertErr } : {}) });
      } catch (error) {
        results.push({ table: "sale_items", phase: "insert", count: 0, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    const hasErrors = results.some((result) => result.error);

    return new Response(JSON.stringify({
      success: !hasErrors,
      company_id: companyId,
      company_name: targetCompany.name,
      company_created: targetCompany.companyCreated,
      restored_at: new Date().toISOString(),
      backup_rows_in_payload: backupRowsPreview,
      results,
    }), {
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});