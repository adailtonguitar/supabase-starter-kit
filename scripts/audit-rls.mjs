#!/usr/bin/env node
/**
 * Static RLS audit.
 *
 * Varre supabase/migrations/*.sql procurando tabelas criadas em `public.*`
 * e verifica se cada uma tem pelo menos uma chamada `ENABLE ROW LEVEL SECURITY`.
 *
 * Também sinaliza tabelas novas que não têm nenhuma `CREATE POLICY` associada.
 *
 * Saída não-zero se:
 *  - houver tabela criada em migrations sem `ENABLE ROW LEVEL SECURITY`; ou
 *  - houver tabela criada sem nenhuma policy.
 *
 * Tabelas marcadas em ALLOWLIST são ignoradas (ex. tabelas de sistema).
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");

// Tabelas que legitimamente não precisam de RLS (ex.: views materializadas que
// vivem em outro schema, ou tabelas já corrigidas em migrations mais antigas
// que essa audit não enxerga por restrição de busca textual).
// Baseline: tabelas pré-existentes que têm RLS habilitado porém NENHUMA policy
// declarada nas migrations versionadas (possivelmente policies foram criadas
// via dashboard da Supabase ou herdadas de backup legado). Essas entradas são
// congeladas para que este audit capture apenas REGRESSÕES em tabelas novas.
// Ao adicionar uma migration corrigindo qualquer uma delas, REMOVA da lista.
const ALLOWLIST = new Set([
  "public.health_monitor_state",
  "public.fiscal_st_rules",
  "public.fiscal_st_decision_log",
  "public.fiscal_override_rules",
  "public.nfe_documents",
  "public.fiscal_tax_rules",
  "public.fiscal_configs",
  "public.notas_recebidas",
  "public.dfe_sync_control",
  "public.fiscal_ncm_mapping",
  "public.fiscal_tax_rules_v2",
  "public.payments",
  "public.payment_webhook_logs",
  "public.demo_account_attempts",
]);

const CREATE_TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(public\.)?([a-z_][a-z0-9_]*)/gi;
const ENABLE_RLS_RE =
  /alter\s+table\s+(public\.)?([a-z_][a-z0-9_]*)\s+enable\s+row\s+level\s+security/gi;
const POLICY_RE =
  /create\s+policy\s+\S+\s+on\s+(public\.)?([a-z_][a-z0-9_]*)/gi;

function normalize(name) {
  return name.toLowerCase();
}

async function main() {
  let files = [];
  try {
    files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => path.join(MIGRATIONS_DIR, f));
  } catch (err) {
    console.warn(`[rls-audit] migrations dir not found: ${MIGRATIONS_DIR}`);
    process.exit(0);
  }

  const created = new Map(); // table -> first migration that created it
  const rlsEnabled = new Set();
  const hasPolicy = new Set();

  for (const file of files) {
    const sql = await readFile(file, "utf8");

    for (const m of sql.matchAll(CREATE_TABLE_RE)) {
      const t = normalize(m[2]);
      if (!created.has(t)) created.set(t, path.basename(file));
    }
    for (const m of sql.matchAll(ENABLE_RLS_RE)) {
      rlsEnabled.add(normalize(m[2]));
    }
    for (const m of sql.matchAll(POLICY_RE)) {
      hasPolicy.add(normalize(m[2]));
    }
  }

  const missingRls = [];
  const missingPolicy = [];

  for (const [table, firstMigration] of created.entries()) {
    if (ALLOWLIST.has(`public.${table}`)) continue;
    if (!rlsEnabled.has(table)) {
      missingRls.push({ table, firstMigration });
    } else if (!hasPolicy.has(table)) {
      missingPolicy.push({ table, firstMigration });
    }
  }

  const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);

  if (missingRls.length > 0) {
    console.error("\n[RLS AUDIT] Tabelas SEM `ENABLE ROW LEVEL SECURITY`:");
    for (const m of missingRls) {
      console.error(`  - ${pad(m.table, 40)} (criada em ${m.firstMigration})`);
    }
  }

  if (missingPolicy.length > 0) {
    console.error("\n[RLS AUDIT] Tabelas com RLS ativa mas SEM nenhuma policy:");
    for (const m of missingPolicy) {
      console.error(`  - ${pad(m.table, 40)} (criada em ${m.firstMigration})`);
    }
  }

  const total = created.size;
  const ok = total - missingRls.length - missingPolicy.length;
  console.log(
    `\n[RLS AUDIT] ${ok}/${total} tabelas cobertas com RLS + policies.`
  );

  if (missingRls.length > 0 || missingPolicy.length > 0) {
    console.error(
      "\nFalha: adicione `ALTER TABLE public.<tabela> ENABLE ROW LEVEL SECURITY;`\n" +
        "e pelo menos uma `CREATE POLICY` na migration correspondente, ou\n" +
        "inclua a tabela na ALLOWLIST de scripts/audit-rls.mjs com justificativa."
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[rls-audit] fatal:", err);
  process.exit(2);
});
