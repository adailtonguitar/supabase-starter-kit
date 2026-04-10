import { createServiceClient, getCorsHeaders, jsonResponse, requireCompanyMembership, requireUser } from "../_shared/auth.ts";
import {
  fillCompanyRowFromServicePeerFallback,
  resolveCompanyFiscalRowWithParent,
} from "../_shared/company-fiscal-fallback.ts";
import { supplementCnpjFromRowTextFields } from "../_shared/company-fiscal-merge.ts";
import { nuvemFiscalRequest } from "../_shared/nuvem-fiscal-auth.ts";

function parseJsonSafe(raw: string): Record<string, any> | null {
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as Record<string, any>;
  } catch {
    return null;
  }
}

function collectProviderMessages(value: unknown): string[] {
  if (!value) return [];
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized ? [normalized] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectProviderMessages(entry));
  }

  if (typeof value === "object") {
    const payload = value as Record<string, any>;
    const direct = [payload.message, payload.mensagem, payload.detail, payload.title, payload.reason];
    const nested = [payload.error, payload.errors, payload.violations, payload.details, payload.rejection_reason];
    return [...direct, ...nested].flatMap((entry) => collectProviderMessages(entry));
  }

  return [];
}

function extractProviderErrorMessage(data: unknown, status: number, fallback: string): string {
  const messages = [...new Set(collectProviderMessages(data))].filter(Boolean);
  if (messages.length > 0) return messages.join("; ");
  return `${fallback} (status ${status})`;
}

async function readResponsePayload(response: Response): Promise<{ raw: string; parsed: Record<string, any> | null }> {
  const raw = await response.text().catch(() => "");
  return { raw, parsed: parseJsonSafe(raw) };
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function pickFirstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (normalized) return normalized;
  }
  return "";
}

function sanitizeSefazText(value: unknown, fallback: string): string {
  const raw = typeof value === "string" ? value : "";
  const normalized = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().replace(/[^\x21-\xFF ]/g, "");
  return normalized || fallback;
}

function parseExpectedDistNsu(message: string): number | null {
  const match = message.match(/dist_nsu[^\d]*(\d+)/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function resolveIbgeCodeFromCep(zip: string): Promise<string> {
  const cepDigits = onlyDigits(zip);
  if (cepDigits.length !== 8) return "";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, { signal: controller.signal });
    if (!response.ok) return "";
    const data = await response.json().catch(() => null);
    return onlyDigits(data?.ibge);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    console.log("[fetch-dfe] ── Nova requisição ──");
    console.log("[fetch-dfe] Authorization presente:", !!req.headers.get("Authorization"));
    console.log("[fetch-dfe] SUPABASE_URL:", Deno.env.get("SUPABASE_URL")?.slice(0, 40));

    const auth = await requireUser(req);
    if (!auth.ok) {
      console.error("[fetch-dfe] requireUser falhou — retornando 401");
      return auth.response;
    }
    console.log("[fetch-dfe] Usuário autenticado:", auth.userId);

    const body = await req.json().catch(() => ({}));
    const { action, company_id, document_id } = body;
    console.log("[fetch-dfe] action:", action, "company_id:", company_id);

    if (!company_id) throw new Error("company_id é obrigatório");

    // Tenant check: user must belong to this company
    const membership = await requireCompanyMembership({
      supabase: auth.supabase,
      userId: auth.userId,
      companyId: String(company_id),
    });
    if (!membership.ok) {
      console.error("[fetch-dfe] Membership check falhou para user:", auth.userId, "company:", company_id);
      return membership.response;
    }
    console.log("[fetch-dfe] Membership OK");

    const supabaseAdmin = createServiceClient() as any;

    // Get company data + fiscal config in parallel
    const [companyResult, fiscalConfigsResult] = await Promise.all([
      supabaseAdmin
        .from("companies")
        .select("*")
        .eq("id", company_id)
        .single(),
      supabaseAdmin
        .from("fiscal_configs")
        .select("*")
        .eq("company_id", company_id)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false }),
    ]);

    const { data: companyRow, error: compErr } = companyResult;
    if (compErr || !companyRow) {
      console.error("[fetch-dfe] Linha da empresa não encontrada:", compErr?.message || compErr, "company_id:", company_id);
      throw new Error("Empresa não encontrada ou CNPJ não cadastrado");
    }

    const fiscalConfigs = Array.isArray(fiscalConfigsResult.data)
      ? fiscalConfigsResult.data as Record<string, any>[]
      : [];

    const pickFiscalConfig = (configs: Record<string, any>[]) => {
      const withCert = (config: Record<string, any>) => Boolean(config?.certificate_path);
      return (
        configs.find((c) => c?.doc_type === "nfe" && c?.is_active && withCert(c)) ??
        configs.find((c) => c?.doc_type === "nfce" && c?.is_active && withCert(c)) ??
        configs.find((c) => c?.is_active && withCert(c)) ??
        configs.find((c) => c?.doc_type === "nfe" && c?.is_active) ??
        configs.find((c) => c?.doc_type === "nfce" && c?.is_active) ??
        configs.find((c) => c?.is_active) ??
        configs.find((c) => c?.doc_type === "nfe" && withCert(c)) ??
        configs.find((c) => c?.doc_type === "nfce" && withCert(c)) ??
        configs.find((c) => withCert(c)) ??
        configs[0] ??
        null
      );
    };

    const fiscalConfig = pickFiscalConfig(fiscalConfigs);
    console.log("[fetch-dfe] Config fiscal selecionada:", {
      total_configs: fiscalConfigs.length,
      doc_type: fiscalConfig?.doc_type ?? null,
      is_active: fiscalConfig?.is_active ?? null,
      has_certificate_path: !!fiscalConfig?.certificate_path,
      has_a3_thumbprint: !!fiscalConfig?.a3_thumbprint,
      updated_at: fiscalConfig?.updated_at ?? null,
    });

    let company = await resolveCompanyFiscalRowWithParent(
      supabaseAdmin,
      companyRow as Record<string, unknown>,
    );
    company = await fillCompanyRowFromServicePeerFallback(
      supabaseAdmin,
      company,
      String(company_id),
    );
    company = supplementCnpjFromRowTextFields(company);

    const cnpj = onlyDigits(company.cnpj);
    const ie = onlyDigits(pickFirstNonEmpty(company.ie, company.state_registration, fiscalConfig?.ie));
    const companyStreet = pickFirstNonEmpty(company.street, company.address_street, company.address);
    const companyNumber = pickFirstNonEmpty(company.number, company.address_number, "S/N");
    const companyNeighborhood = pickFirstNonEmpty(company.neighborhood, company.address_neighborhood, "Centro");
    const companyCity = pickFirstNonEmpty(company.city, company.address_city);
    const companyState = pickFirstNonEmpty(company.state, company.address_state, "MA").toUpperCase();
    const companyZip = onlyDigits(pickFirstNonEmpty(company.zip_code, company.address_zip, company.cep, "00000000"));
    const ibgeCode = onlyDigits(pickFirstNonEmpty(company.ibge_code, company.city_code, company.address_ibge_code));

    if (cnpj.length !== 14) {
      console.error("[fetch-dfe] CNPJ não resolvido para company_id:", company_id, {
        raw_cnpj: company.cnpj,
        parent_company_id: company.parent_company_id,
        company_name: company.name,
        trade_name: company.trade_name,
      });
      throw new Error("Empresa não encontrada ou CNPJ não cadastrado");
    }

    console.log("[fetch-dfe] Empresa fiscal resolvida:", {
      company_id,
      cnpj,
      ie_present: ie.length >= 2,
      street_present: !!companyStreet,
      city_present: !!companyCity,
      state_present: !!companyState,
      ibge_present: ibgeCode.length >= 7,
      parent_company_id: company.parent_company_id || null,
    });

    const isSandbox = Deno.env.get("NUVEM_FISCAL_SANDBOX") === "true";
    const apiBase = isSandbox
      ? "https://api.sandbox.nuvemfiscal.com.br"
      : "https://api.nuvemfiscal.com.br";
    const ambiente = isSandbox ? "homologacao" : "producao";

    // ─── Ensure company + certificate registered on Nuvem Fiscal ───
    async function ensureCompanyOnNuvemFiscal() {
      const resolveStoredCertificate = async (): Promise<{ base64: string; password: string } | null> => {
        if (!fiscalConfig?.certificate_path) return null;

        try {
          const { data: certData } = await supabaseAdmin.storage
            .from("company-backups")
            .download(fiscalConfig.certificate_path);
          if (!certData) return null;

          const arrayBuf = await certData.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);

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

          if (!certPwd && storedHash && typeof storedHash === "string" && !storedHash.startsWith("enc:")) {
            certPwd = storedHash;
          }

          if (!certPwd) {
            console.warn("[fetch-dfe] Senha do certificado indisponível para sincronização");
            return null;
          }

          return { base64: btoa(binary), password: certPwd };
        } catch (certErr) {
          console.warn("[fetch-dfe] Falha ao buscar certificado do storage:", certErr);
          return null;
        }
      };

      const syncCertificate = async (certificate: { base64: string; password: string }) => {
        console.log("[fetch-dfe] Sincronizando certificado na Nuvem Fiscal...");
        const certRes = await nuvemFiscalRequest(`${apiBase}/empresas/${cnpj}/certificado`, {
          method: "PUT",
          body: JSON.stringify({
            certificado: certificate.base64,
            password: certificate.password,
          }),
        });
        const { raw: certText, parsed: certData } = await readResponsePayload(certRes);
        console.log("[fetch-dfe] PUT certificado:", certRes.status, certText.slice(0, 200));

        if (!certRes.ok) {
          throw new Error(
            extractProviderErrorMessage(certData ?? certText, certRes.status, "Falha ao sincronizar certificado na Nuvem Fiscal")
          );
        }
      };

      let companyExists = false;
      try {
        const checkRes = await nuvemFiscalRequest(`${apiBase}/empresas/${cnpj}`, {
          method: "GET",
        });
        const { raw: checkText } = await readResponsePayload(checkRes);
        companyExists = checkRes.ok;
        console.log("[fetch-dfe] GET empresa:", checkRes.status, checkText.slice(0, 200));
      } catch (e) {
        console.log("[fetch-dfe] Check empresa falhou:", e);
      }

      const certificate = await resolveStoredCertificate();
      const companyEmail = pickFirstNonEmpty(company.email, company.owner_email, company.contact_email);
      const companyPhone = onlyDigits(pickFirstNonEmpty(company.phone, company.mobile, company.whatsapp));

      if (!companyExists || certificate) {
        let codigoMunicipio = onlyDigits(ibgeCode || company.ibge_code || company.city_code || company.address_ibge_code || company.codigo_municipio || "");
        if ((!codigoMunicipio || codigoMunicipio.length < 7 || codigoMunicipio === "0000000") && companyZip) {
          codigoMunicipio = await resolveIbgeCodeFromCep(companyZip);
        }

        if (!companyEmail) {
          throw new Error("E-mail da empresa não configurado. Cadastre um e-mail na empresa antes de consultar DF-e.");
        }

        if (!codigoMunicipio || codigoMunicipio.length < 7 || codigoMunicipio === "0000000") {
          throw new Error("Código IBGE do município não configurado. Preencha o código IBGE da empresa para consultar DF-e.");
        }

        const empresaPayload: Record<string, any> = {
          cpf_cnpj: cnpj,
          inscricao_estadual: ie || undefined,
          nome_razao_social: sanitizeSefazText(company.name || company.trade_name, "EMITENTE"),
          nome_fantasia: sanitizeSefazText(company.trade_name || company.name, "EMITENTE"),
          fone: companyPhone || undefined,
          email: String(companyEmail).trim(),
          endereco: {
            logradouro: sanitizeSefazText(companyStreet || "Rua não informada", "Rua não informada"),
            numero: companyNumber,
            bairro: sanitizeSefazText(companyNeighborhood || "Centro", "Centro"),
            codigo_municipio: codigoMunicipio,
            cidade: sanitizeSefazText(companyCity || "Não informada", "Não informada"),
            uf: companyState,
            cep: companyZip || "00000000",
            codigo_pais: "1058",
            pais: "Brasil",
          },
        };

        const method = companyExists ? "PUT" : "POST";
        const companyUrl = companyExists ? `${apiBase}/empresas/${cnpj}` : `${apiBase}/empresas`;

        console.log(`[fetch-dfe] ${companyExists ? "Atualizando" : "Cadastrando"} empresa na Nuvem Fiscal...`);
        const createRes = await nuvemFiscalRequest(companyUrl, {
          method,
          body: JSON.stringify(empresaPayload),
        });
        const { raw: createText, parsed: createData } = await readResponsePayload(createRes);
        console.log(`[fetch-dfe] ${method} empresa:`, createRes.status, createText.slice(0, 200));

        if (!createRes.ok) {
          const providerMsg = extractProviderErrorMessage(
            createData ?? createText,
            createRes.status,
            "Falha ao cadastrar empresa na Nuvem Fiscal",
          );
          const alreadyExists = /já cadastr|already exists|duplicad|existente/i.test(providerMsg);
          if (!alreadyExists) {
            throw new Error(providerMsg);
          }
          console.warn("[fetch-dfe] Empresa já existia no cadastro externo:", providerMsg);
          companyExists = true;
        }
      }

      if (certificate) {
        await syncCertificate(certificate);
      } else {
        console.log("[fetch-dfe] Nenhum certificado disponível para sincronizar");
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

      const [{ data: syncControl }, { data: lastDoc }] = await Promise.all([
        supabaseAdmin
          .from("dfe_sync_control")
          .select("ultimo_nsu")
          .eq("company_id", company_id)
          .maybeSingle(),
        supabaseAdmin
          .from("notas_recebidas")
          .select("nsu")
          .eq("company_id", company_id)
          .order("nsu", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const normalizedSyncNsu = Number(String(syncControl?.ultimo_nsu ?? 0).replace(/\D/g, "") || 0);
      const normalizedLastDocNsu = Number(String(lastDoc?.nsu ?? 0).replace(/\D/g, "") || 0);
      let requestNsu = Math.max(normalizedSyncNsu, normalizedLastDocNsu, 0);

      const callDistribution = async (distNsu: number) => {
        console.log("[fetch-dfe] Distribuição usando dist_nsu:", distNsu);
        return nuvemFiscalRequest(`${apiBase}/distribuicao/nfe`, {
          method: "POST",
          body: JSON.stringify({
            cpf_cnpj: cnpj,
            ambiente,
            tipo_consulta: "dist-nsu",
            dist_nsu: distNsu,
            ignorar_tempo_espera: true,
          }),
        });
      };

      let res = await callDistribution(requestNsu);

      let { raw, parsed } = await readResponsePayload(res);
      let data = parsed ?? (raw ? { raw } : {});
      if (!res.ok) {
        console.error("[fetch-dfe] distribute error:", res.status, raw || JSON.stringify(data));
        let providerMsg = extractProviderErrorMessage(data, res.status, `Erro ${res.status} ao consultar SEFAZ`);
        const expectedDistNsu = parseExpectedDistNsu(providerMsg);

        if ((res.status === 400 || res.status === 422) && expectedDistNsu !== null && expectedDistNsu !== requestNsu) {
          console.warn("[fetch-dfe] Retentando distribuição com dist_nsu corrigido:", expectedDistNsu);
          requestNsu = expectedDistNsu;
          await supabaseAdmin.from("dfe_sync_control").upsert({
            company_id,
            ultimo_nsu: requestNsu,
            ultima_consulta: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: "company_id" });

          res = await callDistribution(requestNsu);
          ({ raw, parsed } = await readResponsePayload(res));
          data = parsed ?? (raw ? { raw } : {});
          if (!res.ok) {
            console.error("[fetch-dfe] distribute retry error:", res.status, raw || JSON.stringify(data));
          }
          providerMsg = extractProviderErrorMessage(data, res.status, `Erro ${res.status} ao consultar SEFAZ`);
        }

        if (!res.ok) {
        const usesOnlyA3 = !!fiscalConfig?.a3_thumbprint && !fiscalConfig?.certificate_path;
        if (usesOnlyA3 && /certificado|certificate|validation|assinatura|a1|pfx/i.test(providerMsg.toLowerCase())) {
          throw new Error(
            `A consulta DF-e exige Certificado Digital A1 (.pfx) sincronizado para o backend fiscal. A configuração atual parece usar apenas A3. Detalhe: ${providerMsg}`
          );
        }
        if (res.status === 404) {
          throw new Error(
            "Sua empresa ainda não está cadastrada no serviço fiscal. Acesse Configurações Fiscais, preencha os dados e faça upload do Certificado Digital."
          );
        }
        throw new Error(providerMsg);
        }
      }

      const responseNsu = Number(String((data as Record<string, any>)?.max_nsu ?? (data as Record<string, any>)?.ult_nsu ?? requestNsu).replace(/\D/g, "") || requestNsu || 0);
      await supabaseAdmin.from("dfe_sync_control").upsert({
        company_id,
        ultimo_nsu: responseNsu,
        ultima_consulta: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "company_id" });

      // ─── Persist returned documents to notas_recebidas ───
      const distDocs: any[] = (data as any)?.documentos || (data as any)?.data || [];
      if (Array.isArray(distDocs) && distDocs.length > 0) {
        console.log(`[fetch-dfe] Persistindo ${distDocs.length} documentos da distribuição`);
        for (const d of distDocs) {
          const chave = d.chave || d.chNFe || d.chave_nfe || "";
          if (!chave) continue;
          await supabaseAdmin.from("notas_recebidas").upsert({
            company_id,
            chave_nfe: chave,
            nsu: d.nsu || d.nsu_especifico || 0,
            cnpj_emitente: d.cnpj_emitente || d.emit?.CNPJ || "",
            nome_emitente: d.nome_emitente || d.emit?.xNome || "",
            data_emissao: d.data_emissao || d.dh_emissao || d.dhEmi || null,
            valor_total: d.valor_total || d.vNF || 0,
            numero_nfe: d.numero || d.nNF || 0,
            serie: d.serie || 0,
            schema_tipo: d.schema || d.tipo_documento || d.tipo_schema || "NF-e",
            situacao: d.situacao || "resumo",
            nuvem_fiscal_id: d.id || null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "company_id,chave_nfe" });
        }
      } else {
        console.log("[fetch-dfe] Distribuição retornou 0 documentos novos");
      }

      return new Response(JSON.stringify({ success: true, data, persisted: distDocs.length }), {
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
