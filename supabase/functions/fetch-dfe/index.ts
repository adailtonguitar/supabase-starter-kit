import { createServiceClient, getCorsHeaders, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import { nuvemFiscalRequest } from "../_shared/nuvem-fiscal-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    const auth = await requireUser(req);
    if (!auth.ok) return auth.response;

    const body = await req.json().catch(() => ({}));
    const { action, company_id, document_id } = body;

    if (!company_id) throw new Error("company_id é obrigatório");

    // Tenant check: user must belong to this company
    const membership = await requireCompanyMembership({
      supabase: auth.supabase,
      userId: auth.userId,
      companyId: String(company_id),
    });
    if (!membership.ok) return membership.response;

    const supabaseAdmin = createServiceClient() as any;

    // Get company data + fiscal config in parallel
    const [companyResult, fiscalConfigResult] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("cnpj, name, trade_name, street, address, number, address_number, neighborhood, city, state, zip_code, cep, ibge_code")
        .eq("id", company_id)
        .single(),
      supabaseAdmin
        .from("fiscal_configs")
        .select("certificate_path, certificate_password_hash, ie, ambiente")
        .eq("company_id", company_id)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ]);

    const { data: companyRow, error: compErr } = companyResult;
    const company = companyRow as Record<string, any> | null;

    if (compErr || !company?.cnpj) {
      throw new Error("Empresa não encontrada ou CNPJ não cadastrado");
    }

    const cnpj = company.cnpj.replace(/\D/g, "");
    const fiscalConfig = fiscalConfigResult.data as Record<string, any> | null;

    const isSandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
    const apiBase = isSandbox
      ? "https://api.sandbox.nuvemfiscal.com.br"
      : "https://api.nuvemfiscal.com.br";
    const ambiente = isSandbox ? "homologacao" : "producao";

    // ─── Ensure company + certificate registered on Nuvem Fiscal ───
    async function ensureCompanyOnNuvemFiscal() {
      try {
        const checkRes = await nuvemFiscalRequest(`${apiBase}/empresas/${cnpj}`, {
          method: "GET",
        });

        if (checkRes.ok) {
          await checkRes.text();
          console.log("[fetch-dfe] Empresa já cadastrada na Nuvem Fiscal");
          return;
        }
        await checkRes.text();
      } catch (e) {
        console.log("[fetch-dfe] Check empresa falhou:", e);
      }

      // Register company
      const ie = (fiscalConfig?.ie || "").replace(/\D/g, "");
      const empresaPayload: Record<string, any> = {
        cpf_cnpj: cnpj,
        inscricao_estadual: ie || undefined,
        nome_razao_social: company.name || "EMPRESA",
        nome_fantasia: company.trade_name || company.name || "EMPRESA",
        endereco: {
          logradouro: company.street || company.address || "Rua não informada",
          numero: company.number || company.address_number || "S/N",
          bairro: company.neighborhood || "Centro",
          codigo_municipio: company.ibge_code || "",
          cidade: company.city || "Não informada",
          uf: (company.state || "MA").toUpperCase(),
          cep: (company.zip_code || company.cep || "00000000").replace(/\D/g, ""),
          codigo_pais: "1058",
          pais: "Brasil",
        },
      };

      // Upload certificate if available
      if (fiscalConfig?.certificate_path) {
        try {
          const { data: certData } = await supabaseAdmin.storage
            .from("company-backups")
            .download(fiscalConfig.certificate_path);
          if (certData) {
            const arrayBuf = await certData.arrayBuffer();
            const bytes = new Uint8Array(arrayBuf);
            let binary = "";
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

            // Decrypt stored password
            let certPwd = "";
            const storedHash = fiscalConfig.certificate_password_hash;
            if (storedHash && typeof storedHash === "string" && storedHash.startsWith("enc:")) {
              try {
                const encKey = Deno.env.get("FISCAL_CERT_ENCRYPTION_KEY");
                if (encKey) {
                  const encoder = new TextEncoder();
                  const keyMaterial = await crypto.subtle.importKey(
                    "raw", encoder.encode(encKey).slice(0, 32),
                    { name: "PBKDF2" }, false, ["deriveKey"],
                  );
                  const derivedKey = await crypto.subtle.deriveKey(
                    { name: "PBKDF2", salt: encoder.encode("fiscal-cert-v1"), iterations: 100000, hash: "SHA-256" },
                    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
                  );
                  const raw = atob(storedHash.slice(4));
                  const encBytes = new Uint8Array(raw.length);
                  for (let j = 0; j < raw.length; j++) encBytes[j] = raw.charCodeAt(j);
                  const iv = encBytes.slice(0, 12);
                  const ciphertext = encBytes.slice(12);
                  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, derivedKey, ciphertext);
                  certPwd = new TextDecoder().decode(decrypted);
                }
              } catch (decErr) {
                console.warn("[fetch-dfe] Falha ao descriptografar senha:", decErr);
              }
            }

            empresaPayload.certificado = {
              base64: btoa(binary),
              password: certPwd,
            };
          }
        } catch (certErr) {
          console.warn("[fetch-dfe] Falha ao buscar certificado do storage:", certErr);
        }
      }

      console.log("[fetch-dfe] Cadastrando empresa na Nuvem Fiscal...");
      const createRes = await nuvemFiscalRequest(`${apiBase}/empresas`, {
        method: "PUT",
        body: JSON.stringify(empresaPayload),
      });
      const createText = await createRes.text();
      console.log("[fetch-dfe] PUT empresas:", createRes.status, createText.slice(0, 200));

      if (!createRes.ok) {
        console.warn("[fetch-dfe] Falha ao cadastrar empresa, tentando prosseguir...");
      }
    }

    // ─── Auto-configure DistNFe if needed ───
    async function ensureDistNfeConfig() {
      try {
        const checkRes = await nuvemFiscalRequest(`${apiBase}/empresas/${cnpj}/distnfe`, {
          method: "GET",
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
        const configRes = await nuvemFiscalRequest(`${apiBase}/empresas/${cnpj}/distnfe`, {
          method: "PUT",
          body: JSON.stringify(configBody),
        });
        const configText = await configRes.text();
        console.log("PUT distnfe response:", configRes.status, configText);

        if (configRes.ok) {
          return;
        }

        lastError = configText;
      }

      // Non-blocking: log but don't throw
      console.warn("DistNFe config failed, proceeding anyway. Last error:", lastError);
    }

    // ─── ACTION: distribute ───
    if (action === "distribute") {
      await ensureCompanyOnNuvemFiscal();
      await ensureDistNfeConfig();

      const { data: lastDoc } = await supabaseAdmin
        .from("notas_recebidas")
        .select("nsu")
        .eq("company_id", company_id)
        .order("nsu", { ascending: false })
        .limit(1)
        .maybeSingle();

      const normalizedLastNsu = Number(String(lastDoc?.nsu ?? 0).replace(/\D/g, "") || 0);

      const res = await nuvemFiscalRequest(`${apiBase}/distribuicao/nfe`, {
        method: "POST",
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
        console.error("[fetch-dfe] distribute error:", res.status, JSON.stringify(data));
        const apiMsg = data?.error?.message || data?.message || data?.title || "";
        if (res.status === 400 || res.status === 422 || apiMsg.toLowerCase().includes("validation")) {
          throw new Error(
            "Falha na validação da consulta SEFAZ. Verifique se o Certificado Digital A1 (.pfx) foi cadastrado corretamente em Configurações Fiscais e se a empresa está ativa na Nuvem Fiscal."
          );
        }
        if (res.status === 404) {
          throw new Error(
            "Sua empresa ainda não está cadastrada no serviço fiscal. Acesse Configurações Fiscais, preencha os dados e faça upload do Certificado Digital."
          );
        }
        throw new Error(apiMsg || `Erro ${res.status} ao consultar SEFAZ`);
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: list ───
    if (action === "list") {
      const { data: localDocs } = await supabaseAdmin
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
      await ensureCompanyOnNuvemFiscal();
      await ensureDistNfeConfig();
      const url = new URL(`${apiBase}/distribuicao/nfe/documentos`);
      url.searchParams.set("cpf_cnpj", cnpj);
      url.searchParams.set("ambiente", ambiente);
      url.searchParams.set("$top", "50");
      url.searchParams.set("$skip", "0");
      url.searchParams.set("$inlinecount", "true");

      const res = await nuvemFiscalRequest(url.toString(), { method: "GET" });
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

      const res = await nuvemFiscalRequest(
        `${apiBase}/distribuicao/nfe/documentos/${document_id}/manifestacao`,
        {
          method: "POST",
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

      const res = await nuvemFiscalRequest(
        `${apiBase}/distribuicao/nfe/documentos/${document_id}/xml`,
        { method: "GET", headers: { Accept: "application/xml" } }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Erro ao baixar XML: ${errText}`);
      }

      const xml = await res.text();

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
  } catch (err: unknown) {
    let userMessage = err instanceof Error ? err.message : "Erro desconhecido";

    if (userMessage.includes("precisa estar cadastrado previamente")) {
      userMessage =
        "Sua empresa ainda não está cadastrada no serviço fiscal. Para usar a Consulta DF-e, acesse Configurações Fiscais, preencha os dados da empresa e faça upload do Certificado Digital A1 (.pfx).";
    } else if (userMessage.includes("ambiente") && userMessage.includes("obrigatório")) {
      userMessage = "Erro interno na consulta fiscal. Tente novamente ou entre em contato com o suporte.";
    } else if (userMessage.includes("certificado") || userMessage.includes("certificate")) {
      userMessage =
        "O Certificado Digital da empresa está inválido ou expirado. Acesse Configurações Fiscais e faça upload de um certificado A1 (.pfx) válido.";
    }

    return jsonResponse({ success: false, error: userMessage }, 200);
  }
});
