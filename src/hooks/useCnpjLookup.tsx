import { useState } from "react";
import { toast } from "sonner";
import { isValidCnpj } from "@/lib/cpf-cnpj-validator";

interface CnpjData {
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
}

interface PublicaCnpjWsResponse {
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
}

export interface CnpjResult {
  name: string;
  trade_name: string;
  cnpj: string;
  email: string;
  phone: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_zip: string;
  address_ibge_code: string;
  contact_name: string;
  situacao_cadastral: string;
}

function cleanCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

const IRREGULAR_STATUSES = ["BAIXADA", "INAPTA", "SUSPENSA", "NULA"];

export function useCnpjLookup() {
  const [loading, setLoading] = useState(false);

  const lookup = async (cnpj: string): Promise<CnpjResult | null> => {
    const clean = cleanCnpj(cnpj);
    if (clean.length !== 14) {
      toast.error("CNPJ deve ter 14 dígitos");
      return null;
    }

    if (!isValidCnpj(clean)) {
      toast.warning("CNPJ com dígitos verificadores suspeitos — consultando mesmo assim…");
    }

    setLoading(true);
    try {
      let data: CnpjData | null = null;

      // Try BrasilAPI first
      try {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
        if (res.ok) {
          data = await res.json();
        }
      } catch {
        // BrasilAPI failed (CORS/network), try fallback
      }

      // Fallback: publica.cnpj.ws
      if (!data) {
        try {
          const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
          if (res2.ok) {
            const raw = (await res2.json()) as PublicaCnpjWsResponse;
            data = {
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
              ddd_telefone_1: raw.estabelecimento?.ddd1 && raw.estabelecimento?.telefone1
                ? `${raw.estabelecimento.ddd1}${raw.estabelecimento.telefone1}` : "",
              codigo_ibge_municipio: raw.estabelecimento?.cidade?.ibge_id ? String(raw.estabelecimento.cidade.ibge_id) : "",
              descricao_situacao_cadastral: raw.estabelecimento?.situacao_cadastral || "",
              qsa: raw.socios?.map((s) => ({ nome_socio: s.nome || "" })) || [],
            };
          }
        } catch {
          // Fallback also failed
        }
      }

      if (!data) {
        toast.error("CNPJ não encontrado — tente novamente em alguns segundos");
        return null;
      }

      const situacao = (data.descricao_situacao_cadastral || data.situacao_cadastral || "").toUpperCase();

      if (IRREGULAR_STATUSES.some((s) => situacao.includes(s))) {
        toast.warning(
          `⚠️ Situação cadastral: ${situacao}${data.motivo_situacao_cadastral ? ` — ${data.motivo_situacao_cadastral}` : ""}. Emissão de NF para esta empresa pode ser rejeitada pela SEFAZ.`,
          { duration: 8000 }
        );
      }

      const result: CnpjResult = {
        name: data.razao_social || "",
        trade_name: data.nome_fantasia || "",
        cnpj: clean,
        email: data.email || "",
        phone: data.ddd_telefone_1 || "",
        address_street: data.logradouro || "",
        address_number: data.numero || "",
        address_complement: data.complemento || "",
        address_neighborhood: data.bairro || "",
        address_city: data.municipio || "",
        address_state: data.uf || "",
        address_zip: data.cep || "",
        address_ibge_code: data.codigo_ibge_municipio ? String(data.codigo_ibge_municipio) : "",
        contact_name: data.qsa?.[0]?.nome_socio || "",
        situacao_cadastral: situacao,
      };

      if (!IRREGULAR_STATUSES.some((s) => situacao.includes(s))) {
        toast.success("Dados do CNPJ carregados — situação: ATIVA ✅");
      }

      return result;
    } catch {
      toast.error("Erro ao consultar CNPJ — verifique sua conexão");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { lookup, loading };
}
