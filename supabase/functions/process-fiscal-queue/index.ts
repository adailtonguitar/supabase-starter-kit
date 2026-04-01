import { corsHeaders, createServiceClient, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  normalizePaymentsFromSaleData,
  validateDetPagForEmission,
} from "../_shared/sale-payments.ts";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseSaleItemsJsonb(raw: unknown): Array<Record<string, unknown>> {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw as Array<Record<string, unknown>>;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return Array.isArray(p) ? (p as Array<Record<string, unknown>>) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function firstNonEmptyStr(...vals: unknown[]): string {
  for (const v of vals) {
    const s = String(v ?? "").trim();
    if (s) return s;
  }
  return "";
}

function fiscalSnapshotByProductId(itemsJson: unknown): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of parseSaleItemsJsonb(itemsJson)) {
    const pid = String(row.product_id ?? "").trim();
    if (pid) map.set(pid, row);
  }
  return map;
}

function visibilityPendingResponse(saleId: string, queueId: string, reason: string) {
  return new Response(
    JSON.stringify({
      success: true,
      pending: true,
      sale_id: saleId,
      queue_id: queueId,
      message: reason,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

function buildNextRetryAt(attempts: number): string {
  const retryScheduleMs = [60_000, 120_000, 300_000, 600_000, 900_000];
  const delayMs = retryScheduleMs[Math.max(0, Math.min(attempts - 1, retryScheduleMs.length - 1))];
  return new Date(Date.now() + delayMs).toISOString();
}

/**
 * Chama `emit-nfce` com Authorization confiável.
 * Usamos **service role** aqui (servidor→servidor): o JWT do usuário falha com frequência em Edge→Edge
 * (getClaims / sessão), gerando **401**. A fila já validou `requireUser` + empresa antes de processar.
 */
function getEmitNfceInternalAuth(): string {
  const sr = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!sr) throw new Error("SUPABASE_SERVICE_ROLE_KEY ausente no ambiente da Edge Function");
  return `Bearer ${sr}`;
}

async function invokeEmitNfceWithUserJwt(
  authorizationHeader: string,
  body: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null; status: number }> {
  const base = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "") ?? "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!base || !anon) {
    return { data: null, error: { message: "SUPABASE_URL ou SUPABASE_ANON_KEY não configurados" }, status: 0 };
  }
  const url = `${base}/functions/v1/emit-nfce`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorizationHeader,
      apikey: anon,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  let payload: Record<string, unknown> | null = null;
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    return { data: null, error: { message: text || `Resposta inválida (HTTP ${resp.status})` }, status: resp.status };
  }
  if (!resp.ok) {
    const msg =
      (payload?.error != null ? String(payload.error) : null) ||
      (payload?.message != null ? String(payload.message) : null) ||
      text ||
      `HTTP ${resp.status}`;
    return { data: payload, error: { message: msg }, status: resp.status };
  }
  return { data: payload, error: null, status: resp.status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    if (body.health_check === true) {
      return jsonResponse({ ok: true, service: "process-fiscal-queue" });
    }

    // Only authenticated users can trigger queue processing (prevents public abuse)
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;
    const companyFilter = body.company_id;
    const saleFilter = body.sale_id;
    const queueFilter = body.queue_id;

    if (companyFilter) {
      const membership = await requireCompanyMembership({
        supabase: auth.supabase,
        userId: auth.userId,
        companyId: String(companyFilter),
      });
      if (!membership.ok) return membership.response;
    }

    // Service client is allowed after auth+tenant validation
    const supabase: any = createServiceClient();

    // 1️⃣ Resetar itens presos em "processing" há mais de 5 minutos
    const nowIso = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    let stuckQuery = supabase
      .from("fiscal_queue")
      .update({
        status: "pending",
        updated_at: nowIso,
        started_at: null,
        next_retry_at: nowIso,
      })
      .eq("status", "processing")
      .lt("updated_at", fiveMinAgo);

    if (companyFilter) stuckQuery = stuckQuery.eq("company_id", companyFilter);
    await stuckQuery;

    // 2️⃣ Buscar próximo item
    // - Sem filtros: pega o mais antigo em pending
    // - Com queue_id/sale_id: permite também status=processing (idempotência) para não "travar" até o reset de 5 min
    const hasSpecificTarget = Boolean(queueFilter || saleFilter);
    let pendingQuery: any = supabase
      .from("fiscal_queue")
      .select("*");
    if (!hasSpecificTarget) {
      pendingQuery = pendingQuery
        .eq("status", "pending")
        .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`);
    }
    else pendingQuery = pendingQuery.in("status", ["pending", "processing"]);
    if (companyFilter) pendingQuery = pendingQuery.eq("company_id", companyFilter);
    if (queueFilter) pendingQuery = pendingQuery.eq("id", String(queueFilter));
    if (saleFilter) pendingQuery = pendingQuery.eq("sale_id", String(saleFilter));
    pendingQuery = pendingQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    const { data: queueItem } = await pendingQuery;

    if (!queueItem) return jsonResponse({ success: true, message: "Nenhum item pendente" }, 200);

    const queueId = queueItem.id;
    const saleId = queueItem.sale_id;
    const companyId = queueItem.company_id;
    const attempts = (queueItem.attempts || 0) + 1;
    const MAX_RETRIES = 5;

    // Dead-letter: evita loop infinito na fila
    if (attempts > MAX_RETRIES) {
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({
            status: "dead_letter",
            last_error: `Excedeu ${MAX_RETRIES} processamentos na fila`,
            updated_at: nowIso,
            finished_at: nowIso,
          })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "erro_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, dead_letter: true, sale_id: saleId, error: `Excedeu ${MAX_RETRIES} tentativas` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3️⃣ Marcar como processing (se já estiver processing, só atualiza attempts)
    await supabase
      .from("fiscal_queue")
      .update({
        status: "processing",
        attempts,
        started_at: nowIso,
        updated_at: nowIso,
        next_retry_at: null,
        finished_at: null,
      })
      .eq("id", queueId);

    // 4️⃣ Buscar config fiscal com fallback (NFC-e -> NF-e)
    const { data: configs, error: cfgErr } = await supabase
      .from("fiscal_configs")
      .select("id, doc_type, is_active")
      .eq("company_id", companyId);

    const fiscalConfig = configs?.find((c: any) => c.doc_type === "nfce" && c.is_active)
      || configs?.find((c: any) => c.doc_type === "nfe" && c.is_active)
      || configs?.find((c: any) => c.doc_type === "nfce")
      || configs?.find((c: any) => c.doc_type === "nfe")
      || configs?.[0]
      || null;

    if (cfgErr || !fiscalConfig) {
      const reason = cfgErr?.message || "Nenhuma configuração fiscal encontrada";
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({ status: "error", last_error: reason, updated_at: nowIso, finished_at: nowIso })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, error: reason, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5️⃣ Buscar dados da venda e itens (incluindo dados fiscais do produto)
    // Em alguns cenários (principalmente logo após finalizar a venda no PDV), pode haver delay curto
    // até a venda/itens ficarem visíveis via API. Fazemos retry curto para evitar falso negativo.
    let sale: any = null;
    let items: any[] = [];
    let lastSaleErr: any = null;
    let lastItemsErr: any = null;
    const [{ data: company }] = await Promise.all([
      supabase.from("companies").select("crt").eq("id", companyId).maybeSingle(),
    ]);

    // ✅ CORREÇÃO #2: Backoff mais inteligente para visibilidade
    // Começa rápido (500ms) e aumenta gradualmente (até 60s total)
    const visibilityBackoffMs = [500, 1000, 2000, 5000, 10000, 20000, 20000];
    const maxVisibilityReads = visibilityBackoffMs.length + 1;
    const totalVisibilityWaitMs = visibilityBackoffMs.reduce((a, b) => a + b, 0); // ~78s

    console.log(
      `[process-fiscal-queue] ${new Date().toISOString()} Iniciando processamento: ` +
      `queue_id=${queueId}, sale_id=${saleId}, company_id=${companyId}, attempts=${attempts}/${MAX_RETRIES}. ` +
      `Máximo tempo de espera por visibilidade: ${totalVisibilityWaitMs}ms (backoff: ${visibilityBackoffMs.join(",")}ms)`
    );

    for (let read = 0; read < maxVisibilityReads; read++) {
      const t0 = new Date().toISOString();
      const saleRes = await supabase
        .from("sales")
        .select("*")
        .eq("id", saleId)
        .maybeSingle();

      sale = saleRes.data;
      lastSaleErr = saleRes.error;

      if (sale && String((sale as any).company_id || "") !== String(companyId)) {
        console.error(`[process-fiscal-queue] ${t0} SECURITY_ERROR: Venda não pertence à empresa. sale_id=${saleId}, company_mismatch=true`);
        await supabase.from("fiscal_queue")
          .update({
            status: "error",
            last_error: "Venda não pertence à empresa deste processamento.",
            updated_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          })
          .eq("id", queueId);
        return new Response(
          JSON.stringify({ success: false, error: "Venda não pertence à empresa", sale_id: saleId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const itemsStrict = await supabase
        .from("sale_items")
        .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
        .eq("sale_id", saleId)
        .eq("company_id", companyId);

      items = (itemsStrict.data as any[]) || [];
      lastItemsErr = itemsStrict.error;

      if (!items.length) {
        const itemsLoose = await supabase
          .from("sale_items")
          .select("*, products(ncm, cfop, csosn, cst_icms, cst_pis, cst_cofins, aliq_icms, origem)")
          .eq("sale_id", saleId);
        items = (itemsLoose.data as any[]) || [];
        lastItemsErr = itemsLoose.error ?? lastItemsErr;
      }

      if (sale && items.length > 0) {
        console.log(
          `[process-fiscal-queue] ${t0} ✅ visibility OK: sale_id=${saleId}, queue_id=${queueId}, ` +
          `read=${read + 1}/${maxVisibilityReads}, items=${items.length}, attempts=${attempts}/${MAX_RETRIES}`
        );
        break;
      }

      console.log(
        `[process-fiscal-queue] ${t0} ⏳ visibility read ${read + 1}/${maxVisibilityReads}: ` +
        `sale=${!!sale}, items=${items.length}, sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}`
      );

      if (read < visibilityBackoffMs.length) {
        const delayMs = visibilityBackoffMs[read];
        console.log(`[process-fiscal-queue] Aguardando ${delayMs}ms antes da próxima leitura...`);
        await sleep(delayMs);
      }
    }

    if (!sale || !items?.length) {
      const errDetail = lastSaleErr?.message || lastItemsErr?.message || "Venda ou itens não encontrados";
      const fatalMsg =
        `Venda/itens não visíveis após ${maxVisibilityReads} leituras (backoff ${visibilityBackoffMs.join(",")}ms, ${totalVisibilityWaitMs}ms total). ${errDetail}`;
      console.error(`[process-fiscal-queue] ${new Date().toISOString()} ❌ VISIBILITY_ERROR: queue_id=${queueId}, sale_id=${saleId}, attempts=${attempts}: ${fatalMsg}`);
      await supabase.from("fiscal_queue")
        .update({
          status: "error",
          last_error: fatalMsg,
          updated_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        })
        .eq("id", queueId);
      return new Response(
        JSON.stringify({ success: false, error: fatalMsg, sale_id: saleId, queue_id: queueId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: latestDoc } = await supabase
      .from("fiscal_documents")
      .select("id, access_key, number, status")
      .eq("company_id", companyId)
      .eq("sale_id", saleId)
      .eq("doc_type", "nfce")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if ((latestDoc as any)?.status === "autorizada") {
      console.log(`[process-fiscal-queue] ${new Date().toISOString()} ✅ Documento já autorizado: sale_id=${saleId}, access_key=${(latestDoc as any).access_key}`);
      await Promise.all([
        supabase.from("sales")
          .update({ status: "autorizada", access_key: (latestDoc as any).access_key || null, number: (latestDoc as any).number || null })
          .eq("id", saleId)
          .eq("company_id", companyId),
        supabase.from("fiscal_queue")
          .update({
            status: "done",
            processed_at: new Date().toISOString(),
            last_error: null,
            updated_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            next_retry_at: null,
          })
          .eq("id", queueId),
      ]);

      return new Response(
        JSON.stringify({ success: true, skipped: true, sale_id: saleId, reason: "Documento já autorizado" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if ((latestDoc as any)?.access_key) {
      console.log(`[process-fiscal-queue] ${new Date().toISOString()} 🔍 Consultando status anterior: access_key=${(latestDoc as any).access_key}`);
      const { data: consultedData, error: consultError } = await invokeEmitNfceWithUserJwt(getEmitNfceInternalAuth(), {
        action: "consult_status",
        access_key: (latestDoc as any).access_key,
        doc_type: "nfce",
        company_id: companyId,
      });

      if (!consultError && consultedData && consultedData.success === true && consultedData.status === "autorizada") {
        console.log(`[process-fiscal-queue] ${new Date().toISOString()} ✅ Documento autorizado após consulta: sale_id=${saleId}`);
        await Promise.all([
          supabase.from("sales")
            .update({ status: "autorizada", access_key: consultedData.access_key || (latestDoc as any).access_key || null, number: consultedData.number || (latestDoc as any).number || null })
            .eq("id", saleId)
            .eq("company_id", companyId),
          supabase.from("fiscal_queue")
            .update({
              status: "done",
              processed_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
              finished_at: new Date().toISOString(),
              next_retry_at: null,
            })
            .eq("id", queueId),
        ]);

        return new Response(
          JSON.stringify({ success: true, skipped: true, sale_id: saleId, reason: "Documento autorizado após consulta" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!consultError && consultedData && consultedData.success === true && consultedData.status === "rejeitada") {
        const rejectReason = String(
          consultedData.rejection_reason ||
          consultedData.error ||
          "Documento rejeitado no provedor fiscal",
        );
        await Promise.all([
          supabase.from("sales")
            .update({ status: "erro_fiscal" })
            .eq("id", saleId)
            .eq("company_id", companyId),
          supabase.from("fiscal_queue")
            .update({
              status: "error",
              last_error: rejectReason,
              updated_at: new Date().toISOString(),
              finished_at: new Date().toISOString(),
              next_retry_at: null,
            })
            .eq("id", queueId),
        ]);

        return new Response(
          JSON.stringify({ success: false, rejected: true, sale_id: saleId, error: rejectReason }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const crt = (company as any)?.crt || 1;
    const isSimples = crt === 1 || crt === 2;
    const defaultCst = isSimples ? "102" : "00";
    const defaultPisCofins = isSimples ? "49" : "01";
    const saleTotal = Number((sale as any).total ?? (sale as any).total_value ?? 0);
    const normalizedPayments = normalizePaymentsFromSaleData({
      paymentsRaw: (sale as any).payments,
      fallbackMethod: (sale as any).payment_method,
      fallbackAmount: saleTotal,
    });
    validateDetPagForEmission(normalizedPayments);
    console.log(`[process-fiscal-queue] payment.audit.raw: ${JSON.stringify((sale as any).payments ?? (sale as any).payment_method ?? null)}`);
    console.log(`[process-fiscal-queue] payment.audit.normalized: ${JSON.stringify(normalizedPayments)}`);

    const snapByPid = fiscalSnapshotByProductId((sale as any).items);

    // 🔴 CRÍTICO: Verificar NCM de todos os itens antes de emitir
    const itemsWithoutNcm = items.filter((item: any) => {
      const pid = String(item.product_id || "");
      const snap = pid ? snapByPid.get(pid) || {} : {};
      const product = item.products || {};
      const ncm = firstNonEmptyStr(product.ncm, snap.ncm, item.ncm).replace(/\D/g, "");
      return !ncm || ncm.length < 2 || ncm === "00000000";
    });
    if (itemsWithoutNcm.length > 0) {
      const names = itemsWithoutNcm.map((i: any) => i.product_name || i.name).join(", ");
      const errMsg = `Produto(s) sem NCM válido: ${names}. Cadastre o NCM antes de emitir NFC-e.`;
      console.error(`[process-fiscal-queue] ${new Date().toISOString()} ❌ NCM_VALIDATION_ERROR: sale_id=${saleId}, items_without_ncm=${itemsWithoutNcm.length}`);
      await supabase.from("fiscal_queue")
        .update({
          status: "error",
          last_error: errMsg,
          updated_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
        })
        .eq("id", queueId);
      return new Response(
        JSON.stringify({ success: false, error: errMsg, sale_id: saleId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fiscalItems = items.map((item: any) => {
      const product = item.products || {};
      const pid = String(item.product_id || "");
      const snap = pid ? snapByPid.get(pid) || {} : {};
      const discountValue = ((item.discount_percent || 0) / 100) * item.unit_price * item.quantity;
      const cstProd = isSimples ? product.csosn : product.cst_icms;
      const cstSnap = isSimples ? snap.csosn : snap.cst_icms;
      const origStr = firstNonEmptyStr(
        product.origem != null ? String(product.origem) : "",
        product.origin != null ? String(product.origin) : "",
        snap.origem != null ? String(snap.origem) : "",
        snap.origin != null ? String(snap.origin) : "",
      ) || "0";
      return {
        product_id: item.product_id,
        name: item.product_name || item.name,
        ncm: firstNonEmptyStr(product.ncm, snap.ncm, item.ncm),
        cfop: firstNonEmptyStr(product.cfop, snap.cfop) || "5102",
        cst: firstNonEmptyStr(cstProd, cstSnap) || defaultCst,
        origem: origStr,
        unit: item.unit || "UN",
        qty: item.quantity,
        unit_price: item.unit_price,
        discount: Math.round(discountValue * 100) / 100, // 🔴 CORREÇÃO: sempre valor absoluto
        pis_cst: firstNonEmptyStr(product.cst_pis, snap.cst_pis) || defaultPisCofins,
        cofins_cst: firstNonEmptyStr(product.cst_cofins, snap.cst_cofins) || defaultPisCofins,
        icms_aliquota: Number(product.aliq_icms ?? snap.aliq_icms ?? snap.icms_rate ?? 0) || 0,
        mva: Number(product.mva) || Number(snap.mva) || undefined,
        cest: firstNonEmptyStr(product.cest, snap.cest) || undefined,
      };
    });

    const primary = normalizedPayments[0];
    const mainPayTpag = primary?.tPag || "99";
    const fiscalPayments = normalizedPayments.map((payment) => payment.sanitized);

    // 6️⃣ Chamar emissão fiscal (service role → emit-nfce; usuário já validado acima)
    console.log(`[process-fiscal-queue] ${new Date().toISOString()} 📤 Iniciando emissão fiscal: sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}`);
    
    const { data: fiscalData, error: fiscalErr, status: emitHttpStatus } = await invokeEmitNfceWithUserJwt(getEmitNfceInternalAuth(), {
      action: "emit",
      sale_id: saleId,
      company_id: companyId,
      config_id: fiscalConfig.id,
      form: {
        nat_op: "VENDA DE MERCADORIA",
        crt,
        payments: fiscalPayments,
        payment_method: mainPayTpag,
        customer_name: String((sale as any).customer_name ?? "").trim() || undefined,
        customer_doc: String((sale as any).customer_doc ?? (sale as any).customer_cpf ?? (sale as any).customer_cpf_cnpj ?? "").replace(/\D/g, "") || undefined,
        payment_value: saleTotal,
        change: primary?.change || 0,
        items: fiscalItems,
      },
    });

    const rateLimited =
      emitHttpStatus === 429 ||
      String(fiscalErr?.message || fiscalData?.error || "").toLowerCase().includes("limite de emissões");
    if (rateLimited) {
      const pendingMsg =
        "Limite de emissões neste minuto (tente de novo em instantes ou aguarde o reprocessamento automático da fila).";
      console.log(
        `[process-fiscal-queue] ${new Date().toISOString()} ⏱️ RATE_LIMITED: sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}`
      );
      if (attempts >= MAX_RETRIES) {
        console.error(`[process-fiscal-queue] ${new Date().toISOString()} ❌ RATE_LIMIT_MAX_RETRIES: sale_id=${saleId}, marking as ERROR`);
        await supabase.from("fiscal_queue")
          .update({
            status: "error",
            last_error: pendingMsg,
            updated_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
          })
          .eq("id", queueId);
        return new Response(
          JSON.stringify({ success: false, error: pendingMsg, sale_id: saleId, queue_id: queueId }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const nextRetryAt = buildNextRetryAt(attempts);
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({
            status: "pending",
            last_error: pendingMsg,
            processed_at: null,
            updated_at: new Date().toISOString(),
            next_retry_at: nextRetryAt,
            finished_at: null,
          })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return visibilityPendingResponse(saleId, queueId, pendingMsg);
    }

    // ✅ CORREÇÃO #3: Se emit falhou, evitar loop infinito
    if (fiscalErr || !fiscalData?.success) {
      const errMsg =
        (fiscalData?.error != null ? String(fiscalData.error) : null) ||
        fiscalErr?.message ||
        "Falha na emissão";
      
      // Se tentativas >= MAX_RETRIES, marcar como DEAD_LETTER (não pending/error)
      const finalStatus = attempts >= MAX_RETRIES ? "dead_letter" : "error";
      const userMsg = attempts >= MAX_RETRIES 
        ? `Falha permanente após ${MAX_RETRIES} tentativas: ${errMsg}`
        : errMsg;
      
      console.error(
        `[process-fiscal-queue] ${new Date().toISOString()} ❌ EMIT_FAILED (status=${finalStatus}): ` +
        `sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}, error=${errMsg}`
      );
      
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({
            status: finalStatus,
            last_error: userMsg,
            updated_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            next_retry_at: null,
          })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: finalStatus === "dead_letter" ? "erro_fiscal" : "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return new Response(
        JSON.stringify({ success: false, error: userMsg, sale_id: saleId, dead_letter: finalStatus === "dead_letter" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const fiscalStatus = fiscalData?.status || "pendente";
    if (fiscalStatus !== "autorizada") {
      const pendingMsg = String(fiscalData?.error || "NFC-e enviada e aguardando autorização");
      console.log(
        `[process-fiscal-queue] ${new Date().toISOString()} ⏳ PROVIDER_PENDING: ` +
        `sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}, reason=${pendingMsg}`
      );
      const nextRetryAt = buildNextRetryAt(attempts);
      await Promise.all([
        supabase.from("fiscal_queue")
          .update({
            status: "pending",
            last_error: pendingMsg,
            processed_at: null,
            updated_at: new Date().toISOString(),
            next_retry_at: nextRetryAt,
            finished_at: null,
          })
          .eq("id", queueId),
        supabase.from("sales")
          .update({ status: "pendente_fiscal" })
          .eq("id", saleId)
          .eq("company_id", companyId),
      ]);
      return visibilityPendingResponse(saleId, queueId, pendingMsg);
    }

    // 7️⃣ Sucesso real
    console.log(`[process-fiscal-queue] ${new Date().toISOString()} ✅ SUCESSO: sale_id=${saleId}, queue_id=${queueId}, attempts=${attempts}/${MAX_RETRIES}`);
    await Promise.all([
      supabase.from("sales")
        .update({ status: "autorizada", access_key: fiscalData?.access_key || null, number: fiscalData?.number || null })
        .eq("id", saleId)
        .eq("company_id", companyId),
      supabase.from("fiscal_queue")
        .update({
          status: "done",
          processed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
          finished_at: new Date().toISOString(),
          next_retry_at: null,
        })
        .eq("id", queueId),
    ]);

    return new Response(
      JSON.stringify({ success: true, sale_id: saleId }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error(`[process-fiscal-queue] FATAL: ${err?.message ?? err}`);
    return new Response(
      JSON.stringify({ success: false, error: String(err?.message ?? err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
