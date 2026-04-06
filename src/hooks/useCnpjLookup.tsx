import { useState } from "react";
import { toast } from "sonner";
import { isValidCnpj } from "@/lib/cpf-cnpj-validator";
import { supabase } from "@/integrations/supabase/client";

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

interface LookupCnpjFunctionResponse {
  found?: boolean;
  error?: string;
  data?: CnpjData;
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

      const { data: response, error } = await supabase.functions.invoke<LookupCnpjFunctionResponse>("lookup-cnpj", {
        body: { cnpj: clean },
      });

      if (error) {
        throw error;
      }

      if (response?.found && response.data) {
        data = response.data;
      }

      if (!data) {
        toast.error(response?.error || "CNPJ não encontrado — tente novamente em alguns segundos");
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
