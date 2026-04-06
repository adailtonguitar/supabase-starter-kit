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

type CnpjData = {
  razao_social: string;
  nome_fantasia: string;
  cnpj: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  email: string;
  ddd_telefone_1: string;
  codigo_ibge_municipio?: string;
  situacao_cadastral?: string;
  descricao_situacao_cadastral?: string;
  motivo_situacao_cadastral?: string;
  qsa?: { nome_socio: string }[];
};

type PublicaCnpjWsResponse = {
  razao_social?: string;
  estabelecimento?: {
    nome_fantasia?: string;
    logradouro?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: { nome?: string; ibge_id?: number | string };
    estado?: { sigla?: string };
    cep?: string;
    email?: string;
    ddd1?: string;
    telefone1?: string;
    situacao_cadastral?: string;
  };
  socios?: Array<{ nome?: string }>;
};

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "ANTHOSYSTEM/1.0" },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

async function lookupBrasilApi(clean: string): Promise<CnpjData | null> {
  const raw = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
  return {
    razao_social: raw.razao_social || "",
    nome_fantasia: raw.nome_fantasia || "",
    cnpj: clean,
    logradouro: raw.logradouro || "",
    numero: raw.numero || "",
    complemento: raw.complemento || "",
    bairro: raw.bairro || "",
    municipio: raw.municipio || "",
    uf: raw.uf || "",
    cep: raw.cep || "",
    email: raw.email || "",
    ddd_telefone_1: raw.ddd_telefone_1 || "",
    codigo_ibge_municipio: raw.codigo_municipio_ibge ? String(raw.codigo_municipio_ibge) : "",
    situacao_cadastral: raw.situacao_cadastral || "",
    descricao_situacao_cadastral: raw.descricao_situacao_cadastral || "",
    motivo_situacao_cadastral: raw.motivo_situacao_cadastral || "",
    qsa: raw.qsa?.map((s: { nome_socio?: string }) => ({ nome_socio: s.nome_socio || "" })) || [],
  };
}

async function lookupPublica(clean: string): Promise<CnpjData | null> {
  const raw = (await fetchJson(`https://publica.cnpj.ws/cnpj/${clean}`)) as PublicaCnpjWsResponse;
  return {
    razao_social: raw.razao_social || "",
    nome_fantasia: raw.estabelecimento?.nome_fantasia || "",
    cnpj: clean,
    logradouro: raw.estabelecimento?.logradouro || "",
    numero: raw.estabelecimento?.numero || "",
    complemento: raw.estabelecimento?.complemento || "",
    bairro: raw.estabelecimento?.bairro || "",
    municipio: raw.estabelecimento?.cidade?.nome || "",
    uf: raw.estabelecimento?.estado?.sigla || "",
    cep: raw.estabelecimento?.cep || "",
    email: raw.estabelecimento?.email || "",
    ddd_telefone_1:
      raw.estabelecimento?.ddd1 && raw.estabelecimento?.telefone1
        ? `${raw.estabelecimento.ddd1}${raw.estabelecimento.telefone1}`
        : "",
    codigo_ibge_municipio: raw.estabelecimento?.cidade?.ibge_id ? String(raw.estabelecimento.cidade.ibge_id) : "",
    descricao_situacao_cadastral: raw.estabelecimento?.situacao_cadastral || "",
    qsa: raw.socios?.map((s) => ({ nome_socio: s.nome || "" })) || [],
  };
}

async function lookupMinhaReceita(clean: string): Promise<CnpjData | null> {
  const raw = await fetchJson(`https://minhareceita.org/${clean}`);
  return {
    razao_social: raw.razao_social || "",
    nome_fantasia: raw.nome_fantasia || "",
    cnpj: clean,
    logradouro: raw.logradouro || "",
    numero: raw.numero || "",
    complemento: raw.complemento || "",
    bairro: raw.bairro || "",
    municipio: raw.municipio || "",
    uf: raw.uf || "",
    cep: raw.cep || "",
    email: raw.email || "",
    ddd_telefone_1: raw.ddd_telefone_1 || "",
    codigo_ibge_municipio: raw.codigo_municipio_ibge ? String(raw.codigo_municipio_ibge) : (raw.codigo_municipio ? String(raw.codigo_municipio) : ""),
    situacao_cadastral: raw.descricao_situacao_cadastral || "",
    descricao_situacao_cadastral: raw.descricao_situacao_cadastral || "",
    motivo_situacao_cadastral: raw.motivo_situacao_cadastral || "",
    qsa: raw.qsa?.map((s: { nome_socio?: string }) => ({ nome_socio: s.nome_socio || "" })) || [],
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const { cnpj } = await req.json();
    const clean = String(cnpj || "").replace(/\D/g, "");

    if (clean.length !== 14) {
      return new Response(JSON.stringify({ found: false, error: "CNPJ inválido" }), {
        status: 400,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const providers = [lookupBrasilApi, lookupPublica, lookupMinhaReceita];
    const providerNames = ["brasilapi", "publica.cnpj.ws", "minhareceita.org"];

    for (let i = 0; i < providers.length; i++) {
      try {
        const data = await providers[i](clean);
        if (data) {
          return new Response(JSON.stringify({ found: true, source: providerNames[i], data }), {
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
      } catch (error) {
        console.warn(`[lookup-cnpj] provider failed: ${providerNames[i]}`, error);
      }
    }

    return new Response(JSON.stringify({ found: false, error: "CNPJ não encontrado" }), {
      status: 404,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno";
    return new Response(JSON.stringify({ found: false, error: message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});