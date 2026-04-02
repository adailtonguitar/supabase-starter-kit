import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://anthosystemcombr.lovable.app",
  "https://anthosystem.com.br",
  "https://www.anthosystem.com.br",
  "https://id-preview--d4ab3861-f98c-4c08-a556-30aa884845a3.lovable.app",
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
  { table: "inventory_count_items", fk_via: "product_id", parent: "products" },
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

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
      const nextRow = { ...row };
      if ("company_id" in nextRow) {
        nextRow.company_id = companyId;
      }
      return nextRow;
    });
}

async function resolveOrCreateCompany(adminClient: ReturnType<typeof createClient>, userId: string, sourceCompanyName: string) {
  const normalizedSourceName = normalizeName(sourceCompanyName);
  const { data: memberships, error: membershipError } = await adminClient
    .from("company_users")
    .select("company_id, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (membershipError) throw membershipError;

  const activeCompanyIds = [...new Set((memberships || []).map((membership) => membership.company_id).filter(Boolean))];

  if (activeCompanyIds.length > 0) {
    const { data: companies, error: companiesError } = await adminClient
      .from("companies")
      .select("id, name")
      .in("id", activeCompanyIds);

    if (companiesError) throw companiesError;

    const validCompanies = companies || [];
    if (validCompanies.length === 1) {
      return { ...validCompanies[0], companyCreated: false };
    }

    if (validCompanies.length > 1) {
      const exactMatch = validCompanies.find((company) => normalizeName(company.name) === normalizedSourceName);
      if (exactMatch) {
        return { ...exactMatch, companyCreated: false };
      }

      throw new Error("Seu usuário possui mais de uma empresa ativa. Use o painel Admin para escolher o destino correto da restauração.");
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
    })
    .select("id, name")
    .single();

  if (companyError || !newCompany) throw companyError ?? new Error("Falha ao recriar a empresa");

  const { error: linkError } = await adminClient
    .from("company_users")
    .insert({
      company_id: newCompany.id,
      user_id: userId,
      role: "admin",
      is_active: true,
    });

  if (linkError) throw linkError;

  const { error: fiscalConfigError } = await adminClient
    .from("fiscal_configs")
    .upsert(buildDefaultFiscalConfigs(newCompany.id), { onConflict: "company_id,doc_type" });

  if (fiscalConfigError) throw fiscalConfigError;

  return { ...newCompany, companyCreated: true };
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
    const adminClient = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: getCorsHeaders(req) });
    }

    const body = await parseRequestJsonSafe(req);
    const backupData = body?.backup_data;
    const sourceCompanyName = String(body?.source_company_name ?? "").trim();

    if (!backupData || typeof backupData !== "object") {
      return new Response(JSON.stringify({ error: "backup_data é obrigatório" }), { status: 400, headers: getCorsHeaders(req) });
    }

    const targetCompany = await resolveOrCreateCompany(adminClient, user.id, sourceCompanyName);
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
      const rows = remapCompanyRows(backupData[table], companyId);
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
      } catch (error) {
        results.push({ table, phase: "insert", count: 0, error: error instanceof Error ? error.message : "unknown" });
      }
    }

    const saleItems = remapCompanyRows(backupData.sale_items, companyId);
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