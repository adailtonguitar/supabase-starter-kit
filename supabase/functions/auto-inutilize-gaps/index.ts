/**
 * auto-inutilize-gaps (cron)
 *
 * Detecta lacunas na sequência de numeração fiscal (nNF) e dispara o evento
 * de INUTILIZAÇÃO na SEFAZ, via emit-nfce action=inutilize, para empresas
 * que habilitaram a flag `companies.auto_inutilize_gaps = true`.
 *
 * Segurança:
 *   • Apenas gaps com pelo menos `min_age_days` (default 20) de idade, para
 *     evitar inutilizar numeração que ainda poderia ser aproveitada em retry.
 *   • Inutiliza somente números de meses anteriores (não inutiliza o mês
 *     corrente — a SEFAZ exige prazo até o dia 20 do mês seguinte).
 *   • Limite defensivo: processa no máximo N=50 gaps por execução, por empresa.
 *   • Registra cada tentativa em fiscal_inutilization_logs (insert-only).
 *
 * Base legal:
 *   • RICMS (genérico): inutilização deve ser comunicada em até 30 dias
 *     após o fim do mês de apuração.
 *   • IN RFB 2.005/2021: registros do SPED Fiscal requerem justificativa
 *     para saltos na sequência.
 *
 * Agendamento recomendado:
 *   Dia 5 de cada mês às 03:00 UTC (cobre o mês anterior com margem).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MIN_AGE_DAYS = 20;
const MAX_GAPS_PER_RUN = 50;

interface Gap {
  docType: "nfce" | "nfe";
  serie: number;
  numero_inicial: number;
  numero_final: number;
  count: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function detectGapsForCompany(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  minAgeDays: number,
): Promise<Gap[]> {
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - minAgeDays);
  const cutoffIso = cutoffDate.toISOString();

  const detected: Gap[] = [];

  for (const docType of ["nfce", "nfe"] as const) {
    const { data: docs } = await supabase
      .from("fiscal_documents")
      .select("number, serie, status, created_at")
      .eq("company_id", companyId)
      .eq("doc_type", docType)
      .not("number", "is", null)
      .lte("created_at", cutoffIso)
      .order("number", { ascending: true });

    if (!docs || docs.length < 2) continue;

    const bySerie = new Map<number, number[]>();
    for (const d of docs as Array<{ number: number | null; serie: number | null }>) {
      if (d.number == null) continue;
      const serie = d.serie ?? 1;
      if (!bySerie.has(serie)) bySerie.set(serie, []);
      bySerie.get(serie)!.push(d.number);
    }

    for (const [serie, numbers] of bySerie) {
      const sorted = [...new Set(numbers)].sort((a, b) => a - b);
      if (sorted.length < 2) continue;

      for (let i = 0; i < sorted.length - 1; i++) {
        const diff = sorted[i + 1] - sorted[i];
        if (diff > 1) {
          detected.push({
            docType,
            serie,
            numero_inicial: sorted[i] + 1,
            numero_final: sorted[i + 1] - 1,
            count: diff - 1,
          });
          if (detected.length >= MAX_GAPS_PER_RUN) return detected;
        }
      }
    }
  }

  return detected;
}

Deno.serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Permite invocação manual para uma empresa específica (teste/DR)
  let overrideCompanyId: string | null = null;
  let dryRun = false;
  try {
    if (req.method === "POST") {
      const body = await req.json();
      overrideCompanyId = body?.company_id ? String(body.company_id) : null;
      dryRun = body?.dry_run === true;
    } else {
      const url = new URL(req.url);
      overrideCompanyId = url.searchParams.get("company_id");
      dryRun = url.searchParams.get("dry_run") === "true";
    }
  } catch (_) {
    // ignore
  }

  // Lista empresas elegíveis
  let companiesQuery = supabase
    .from("companies")
    .select("id, cnpj, name, auto_inutilize_gaps, auto_inutilize_min_age_days")
    .eq("auto_inutilize_gaps", true);
  if (overrideCompanyId) {
    companiesQuery = companiesQuery.eq("id", overrideCompanyId);
  }
  const { data: companies, error: cErr } = await companiesQuery;
  if (cErr) {
    console.error("[auto-inutilize-gaps] Erro listando empresas:", cErr);
    return jsonResponse({ success: false, error: cErr.message }, 500);
  }
  if (!companies || companies.length === 0) {
    return jsonResponse({ success: true, processed: 0, note: "Nenhuma empresa com auto_inutilize_gaps habilitado." });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const company of companies) {
    const companyId = String(company.id);
    const minAge = Number(company.auto_inutilize_min_age_days) || DEFAULT_MIN_AGE_DAYS;
    try {
      const gaps = await detectGapsForCompany(supabase, companyId, minAge);

      if (gaps.length === 0) {
        results.push({ company_id: companyId, name: company.name, gaps: 0, skipped: true });
        continue;
      }

      console.log(`[auto-inutilize-gaps] ${company.name}: ${gaps.length} gap(s) detectado(s)`);

      if (dryRun) {
        results.push({ company_id: companyId, name: company.name, gaps, dry_run: true });
        continue;
      }

      // Invoca emit-nfce action=inutilize para cada gap
      const gapResults: Array<Record<string, unknown>> = [];
      for (const gap of gaps) {
        const justificativa = `Inutilização automática de lacuna na sequência (numeros ${gap.numero_inicial}-${gap.numero_final}, serie ${gap.serie}). Minimo ${minAge} dias desde o ultimo documento.`;

        const invokeResp = await fetch(`${SUPABASE_URL}/functions/v1/emit-nfce`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE}`,
          },
          body: JSON.stringify({
            action: "inutilize",
            company_id: companyId,
            doc_type: gap.docType,
            serie: gap.serie,
            numero_inicial: gap.numero_inicial,
            numero_final: gap.numero_final,
            justificativa,
          }),
        });

        const invokeBody = await invokeResp.json().catch(() => ({}));
        const ok = invokeResp.ok && invokeBody?.success !== false;

        gapResults.push({
          gap: `${gap.docType} serie ${gap.serie} #${gap.numero_inicial}-${gap.numero_final}`,
          success: ok,
          error: ok ? null : (invokeBody?.error || `HTTP ${invokeResp.status}`),
        });

        // Log persistente
        try {
          await supabase.from("fiscal_inutilization_logs").insert({
            company_id: companyId,
            doc_type: gap.docType,
            serie: gap.serie,
            numero_inicial: gap.numero_inicial,
            numero_final: gap.numero_final,
            justificativa,
            success: ok,
            error_message: ok ? null : (invokeBody?.error || null),
            response: invokeBody || null,
          });
        } catch (logErr) {
          console.warn("[auto-inutilize-gaps] Falha ao registrar log:", logErr);
        }
      }

      results.push({ company_id: companyId, name: company.name, gaps: gaps.length, gapResults });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[auto-inutilize-gaps] Erro em ${companyId}:`, msg);
      results.push({ company_id: companyId, error: msg });
    }
  }

  return jsonResponse({ success: true, processed: companies.length, results });
});
