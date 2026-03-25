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

async function getNuvemFiscalToken(): Promise<string> {
  const clientId = Deno.env.get("NUVEM_FISCAL_CLIENT_ID");
  const clientSecret = Deno.env.get("NUVEM_FISCAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("Credenciais Nuvem Fiscal não configuradas");

  const res = await fetch("https://auth.nuvemfiscal.com.br/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: "empresa cep cnpj nfe nfce distribuicao-nfe",
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("Falha ao obter token Nuvem Fiscal");
  return json.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Service role client for DB writes (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { action, company_id, document_id } = body;

    if (!company_id) throw new Error("company_id é obrigatório");

    // Rate limiting: max 20 DFe requests per minute per company
    const { data: allowed } = await supabase.rpc("check_rate_limit", {
      p_company_id: company_id,
      p_fn_name: "fetch-dfe",
      p_max_calls: 20,
      p_window_sec: 60,
    });
    if (allowed === false) {
      return new Response(JSON.stringify({ error: "Limite de consultas DFe excedido. Aguarde 1 minuto." }), {
        status: 429, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Get company CNPJ
    const { data: company, error: compErr } = await supabase
      .from("companies")
      .select("cnpj, name")
      .eq("id", company_id)
      .single();

    if (compErr || !company?.cnpj) {
      throw new Error("Empresa não encontrada ou CNPJ não cadastrado");
    }

    const cnpj = company.cnpj.replace(/\D/g, "");
    const nfToken = await getNuvemFiscalToken();
    const nfHeaders = {
      Authorization: `Bearer ${nfToken}`,
      "Content-Type": "application/json",
    };

    const isSandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
    const apiBase = isSandbox
      ? "https://api.sandbox.nuvemfiscal.com.br"
      : "https://api.nuvemfiscal.com.br";
    const ambiente = isSandbox ? "homologacao" : "producao";

    // ─── Auto-configure DistNFe if needed ───
    async function ensureDistNfeConfig() {
      try {
        const checkRes = await fetch(`${apiBase}/empresas/${cnpj}/distnfe`, {
          method: "GET",
          headers: nfHeaders,
        });
        if (checkRes.ok) {
          console.log("DistNFe already configured for", cnpj);
          await checkRes.text();
          return;
        }
        console.log("DistNFe not configured, status:", checkRes.status);
        await checkRes.text();
      } catch (e) {
        console.log("DistNFe check failed:", e);
      }

      const payloads = [
        {
          distribuicao_automatica: true,
          distribuicao_intervalo_horas: 1,
          ciencia_automatica: true,
          ambiente,
        },
        { ambiente },
      ];

      let lastError = "";

      for (const configBody of payloads) {
        console.log("Trying PUT distnfe with body:", JSON.stringify(configBody));
        const configRes = await fetch(`${apiBase}/empresas/${cnpj}/distnfe`, {
          method: "PUT",
          headers: nfHeaders,
          body: JSON.stringify(configBody),
        });
        const configText = await configRes.text();
        console.log("PUT distnfe response:", configRes.status, configText);

        if (configRes.ok) {
          return;
        }

        lastError = configText;
      }

      // Non-blocking: log but don't throw - the API might work without explicit config
      console.warn("DistNFe config failed, proceeding anyway. Last error:", lastError);
    }

    // ─── ACTION: distribute ───
    if (action === "distribute") {
      await ensureDistNfeConfig();

      // Get last NSU from DB using integer format expected by Nuvem Fiscal
      const { data: lastDoc } = await supabaseAdmin
        .from("notas_recebidas")
        .select("nsu")
        .eq("company_id", company_id)
        .order("nsu", { ascending: false })
        .limit(1)
        .maybeSingle();

      const normalizedLastNsu = Number(String(lastDoc?.nsu ?? 0).replace(/\D/g, "") || 0);

      const res = await fetch(`${apiBase}/distribuicao/nfe`, {
        method: "POST",
        headers: nfHeaders,
        body: JSON.stringify({
          cpf_cnpj: cnpj,
          ambiente,
          tipo_consulta: "dist-nsu",
          dist_nsu: normalizedLastNsu,
          ignorar_tempo_espera: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data) || `Erro ${res.status}`);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: list ───
    if (action === "list") {
      // First try to return from local DB
      const { data: localDocs } = await supabase
        .from("notas_recebidas")
        .select("*")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (localDocs && localDocs.length > 0) {
        return new Response(JSON.stringify({
          success: true,
          source: "local",
          data: {
            data: localDocs.map((d: any) => ({
              id: d.id,
              chave: d.chave_nfe,
              tipo_documento: d.schema_tipo || "NF-e",
              numero: d.numero_nfe || 0,
              serie: d.serie || 0,
              data_emissao: d.data_emissao || "",
              valor_total: d.valor_total || 0,
              cnpj_emitente: d.cnpj_emitente || "",
              nome_emitente: d.nome_emitente || "",
              situacao: d.situacao || "resumo",
              nsu: d.nsu || 0,
              schema: d.schema_tipo || "",
              nuvem_fiscal_id: d.nuvem_fiscal_id,
              status_manifestacao: d.status_manifestacao,
              importado: d.importado,
            })),
            "@count": localDocs.length,
          },
        }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Fallback: fetch from Nuvem Fiscal API
      await ensureDistNfeConfig();
      const url = new URL(`${apiBase}/distribuicao/nfe/documentos`);
      url.searchParams.set("cpf_cnpj", cnpj);
      url.searchParams.set("ambiente", ambiente);
      url.searchParams.set("$top", "50");
      url.searchParams.set("$skip", "0");
      url.searchParams.set("$inlinecount", "true");

      const res = await fetch(url.toString(), { method: "GET", headers: nfHeaders });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data) || `Erro ${res.status}`);
      }

      // Persist docs to local DB
      const docs = data?.data || [];
      for (const d of docs) {
        const chave = d.chave || d.chNFe;
        if (!chave) continue;
        await supabaseAdmin.from("notas_recebidas").upsert({
          company_id,
          chave_nfe: chave,
          nsu: d.nsu || 0,
          cnpj_emitente: d.cnpj_emitente || "",
          nome_emitente: d.nome_emitente || "",
          data_emissao: d.data_emissao || d.dh_emissao || null,
          valor_total: d.valor_total || d.vNF || 0,
          numero_nfe: d.numero || 0,
          serie: d.serie || 0,
          schema_tipo: d.schema || d.tipo_documento || "NF-e",
          situacao: d.situacao || "resumo",
          nuvem_fiscal_id: d.id || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: "company_id,chave_nfe" });
      }

      return new Response(JSON.stringify({ success: true, source: "api", data }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: manifest (ciência da operação) ───
    if (action === "manifest") {
      if (!document_id) throw new Error("document_id (chave NFe) é obrigatório");

      const tipoEvento = body.tipo_evento || "ciencia";
      const eventoMap: Record<string, string> = {
        ciencia: "ciencia",
        confirmacao: "confirmacao",
        desconhecimento: "desconhecimento",
        nao_realizada: "nao_realizada",
      };
      const evento = eventoMap[tipoEvento] || "ciencia";

      const res = await fetch(
        `${apiBase}/distribuicao/nfe/documentos/${document_id}/manifestacao`,
        {
          method: "POST",
          headers: nfHeaders,
          body: JSON.stringify({
            tipo_evento: evento,
            justificativa: body.justificativa || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data) || `Erro ${res.status} na manifestação`);
      }

      // Update local record
      if (body.chave_nfe) {
        await supabaseAdmin.from("notas_recebidas").update({
          status_manifestacao: evento === "ciencia" ? "ciencia" : evento,
          situacao: evento === "ciencia" ? "manifesto" : "completo",
          updated_at: new Date().toISOString(),
        }).eq("company_id", company_id).eq("chave_nfe", body.chave_nfe);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: detail (download XML) ───
    if (action === "detail") {
      if (!document_id) throw new Error("document_id é obrigatório");

      const res = await fetch(
        `${apiBase}/distribuicao/nfe/documentos/${document_id}/xml`,
        { method: "GET", headers: { ...nfHeaders, Accept: "application/xml" } }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro ao baixar XML: ${errText}`);
      }

      const xml = await res.text();

      // Save XML to local record and mark as completo
      await supabaseAdmin.from("notas_recebidas").update({
        xml_completo: xml,
        situacao: "completo",
        updated_at: new Date().toISOString(),
      }).eq("company_id", company_id).eq("nuvem_fiscal_id", document_id);

      return new Response(JSON.stringify({ success: true, xml }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (err: any) {
    let userMessage = err.message || "Erro desconhecido";

    if (userMessage.includes("precisa estar cadastrado previamente")) {
      userMessage =
        "Sua empresa ainda não está cadastrada no serviço fiscal. Para usar a Consulta DF-e, acesse Configurações Fiscais, preencha os dados da empresa e faça upload do Certificado Digital A1 (.pfx).";
    } else if (userMessage.includes("ambiente") && userMessage.includes("obrigatório")) {
      userMessage = "Erro interno na consulta fiscal. Tente novamente ou entre em contato com o suporte.";
    } else if (userMessage.includes("certificado") || userMessage.includes("certificate")) {
      userMessage =
        "O Certificado Digital da empresa está inválido ou expirado. Acesse Configurações Fiscais e faça upload de um certificado A1 (.pfx) válido.";
    }

    return new Response(
      JSON.stringify({ success: false, error: userMessage }),
      { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
    );
  }
});
