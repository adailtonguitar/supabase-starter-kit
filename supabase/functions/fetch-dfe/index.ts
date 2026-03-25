import { corsHeaders, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";

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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json();
    const { action, company_id, document_id } = body;

    if (!company_id) throw new Error("company_id é obrigatório");

    // Tenant check: user must belong to this company
    const membership = await requireCompanyMembership({
      supabase: auth.supabase,
      userId: auth.userId,
      companyId: String(company_id),
    });
    if (!membership.ok) return membership.response;

    // Get company CNPJ
    const { data: company, error: compErr } = await auth.supabase
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

    // ─── ACTION: distribute ───
    if (action === "distribute") {
      const res = await fetch("https://api.nuvemfiscal.com.br/distribuicao/nfe", {
        method: "POST",
        headers: nfHeaders,
        body: JSON.stringify({
          cpf_cnpj: cnpj,
          ambiente: "producao",
          tipo_consulta: "dist-nsu",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data) || `Erro ${res.status}`);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: list ───
    if (action === "list") {
      const url = new URL("https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos");
      url.searchParams.set("cpf_cnpj", cnpj);
      url.searchParams.set("ambiente", "producao");
      url.searchParams.set("$top", "50");
      url.searchParams.set("$skip", "0");
      url.searchParams.set("$inlinecount", "true");

      const res = await fetch(url.toString(), { method: "GET", headers: nfHeaders });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || JSON.stringify(data) || `Erro ${res.status}`);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: detail (download XML) ───
    if (action === "detail") {
      if (!document_id) throw new Error("document_id é obrigatório");

      const res = await fetch(
        `https://api.nuvemfiscal.com.br/distribuicao/nfe/documentos/${document_id}/xml`,
        { method: "GET", headers: { ...nfHeaders, Accept: "application/xml" } }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro ao baixar XML: ${errText}`);
      }

      const xml = await res.text();
      return new Response(JSON.stringify({ success: true, xml }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Ação desconhecida: ${action}`);
  } catch (err: any) {
    let userMessage = err.message || "Erro desconhecido";

    // Traduz erros técnicos da Nuvem Fiscal em mensagens amigáveis
    if (userMessage.includes("precisa estar cadastrado previamente")) {
      userMessage =
        "Sua empresa ainda não está cadastrada no serviço fiscal. Para usar a Consulta DF-e, acesse Configurações Fiscais, preencha os dados da empresa e faça upload do Certificado Digital A1 (.pfx).";
    } else if (userMessage.includes("ambiente") && userMessage.includes("obrigatório")) {
      userMessage = "Erro interno na consulta fiscal. Tente novamente ou entre em contato com o suporte.";
    } else if (userMessage.includes("certificado") || userMessage.includes("certificate")) {
      userMessage =
        "O Certificado Digital da empresa está inválido ou expirado. Acesse Configurações Fiscais e faça upload de um certificado A1 (.pfx) válido.";
    }

    // 200 + success:false: o cliente já trata; evita POST vermelho no DevTools para falhas esperadas
    return jsonResponse({ success: false, error: userMessage }, 200);
  }
});
