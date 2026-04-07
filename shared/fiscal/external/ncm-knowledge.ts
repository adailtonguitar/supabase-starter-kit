/**
 * NCM Knowledge Base — Base de conhecimento local de NCMs
 * 
 * Classifica NCMs em categorias com flags fiscais:
 * - monofásico (PIS/COFINS)
 * - ST susceptível
 * - CEST obrigatório
 * 
 * Usado como fallback quando IBPT não está disponível
 * e como enriquecimento dos dados do banco.
 */

// ─── Tipos ───

export interface NcmKnowledge {
  ncm: string;
  descricao: string;
  categoria: string;
  monofasico: boolean;
  stSusceptivel: boolean;
  cestObrigatorio: boolean;
}

// ─── Base de conhecimento por prefixo NCM ───

interface NcmPrefixRule {
  prefix: string;
  categoria: string;
  monofasico: boolean;
  stSusceptivel: boolean;
  cestObrigatorio: boolean;
  descricao: string;
}

const NCM_PREFIX_RULES: NcmPrefixRule[] = [
  // Bebidas
  { prefix: "2201", categoria: "Bebidas", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Águas minerais" },
  { prefix: "2202", categoria: "Bebidas", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Águas e bebidas não alcoólicas" },
  { prefix: "2203", categoria: "Bebidas", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Cervejas de malte" },
  { prefix: "2204", categoria: "Bebidas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Vinhos" },
  { prefix: "2205", categoria: "Bebidas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Vermutes" },
  { prefix: "2206", categoria: "Bebidas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Sidra e outras bebidas fermentadas" },
  { prefix: "2207", categoria: "Bebidas", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Álcool etílico" },
  { prefix: "2208", categoria: "Bebidas", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Destilados" },
  // Tabaco
  { prefix: "2402", categoria: "Tabaco", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Cigarros e charutos" },
  // Combustíveis
  { prefix: "2710", categoria: "Combustíveis", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Óleos de petróleo e derivados" },
  { prefix: "2711", categoria: "Combustíveis", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Gás de petróleo e hidrocarbonetos" },
  // Farmacêuticos
  { prefix: "3003", categoria: "Farmacêuticos", monofasico: true, stSusceptivel: false, cestObrigatorio: false, descricao: "Medicamentos não dosados" },
  { prefix: "3004", categoria: "Farmacêuticos", monofasico: true, stSusceptivel: false, cestObrigatorio: false, descricao: "Medicamentos dosados" },
  // Cosméticos / Higiene
  { prefix: "3303", categoria: "Cosméticos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Perfumes e águas-de-colônia" },
  { prefix: "3304", categoria: "Cosméticos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Produtos de beleza e maquiagem" },
  { prefix: "3305", categoria: "Cosméticos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Preparações capilares" },
  { prefix: "3306", categoria: "Higiene", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Preparações para higiene bucal" },
  { prefix: "3307", categoria: "Cosméticos", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Preparações para barbear" },
  { prefix: "3401", categoria: "Higiene", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Sabões" },
  // Tintas
  { prefix: "3208", categoria: "Tintas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Tintas e vernizes não aquosos" },
  { prefix: "3209", categoria: "Tintas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Tintas e vernizes aquosos" },
  { prefix: "3210", categoria: "Tintas", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Outras tintas" },
  // Pneus / Autopeças
  { prefix: "4011", categoria: "Autopeças", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Pneus novos" },
  { prefix: "8714", categoria: "Autopeças", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Partes de motocicletas" },
  // Cimento
  { prefix: "2523", categoria: "Construção", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Cimentos" },
  // Materiais elétricos
  { prefix: "8536", categoria: "Materiais Elétricos", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Aparelhagem elétrica" },
  // Ferragens
  { prefix: "7213", categoria: "Ferragens", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Fio-máquina de ferro/aço" },
  { prefix: "7214", categoria: "Ferragens", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Barras de ferro/aço" },
  // Plásticos construção
  { prefix: "3917", categoria: "Construção", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Tubos e acessórios plásticos" },
  { prefix: "3921", categoria: "Construção", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Chapas plásticas" },
  { prefix: "3925", categoria: "Construção", monofasico: false, stSusceptivel: true, cestObrigatorio: true, descricao: "Artefatos plásticos para construção" },
  // Alimentos cesta básica
  { prefix: "0201", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Carnes bovinas frescas" },
  { prefix: "0202", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Carnes bovinas congeladas" },
  { prefix: "0207", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Carnes de aves" },
  { prefix: "0401", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Leite" },
  { prefix: "0402", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Leite concentrado" },
  { prefix: "1001", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Trigo" },
  { prefix: "1005", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Milho" },
  { prefix: "1006", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Arroz" },
  { prefix: "1101", categoria: "Alimentos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Farinhas de trigo" },
  // Veículos
  { prefix: "8702", categoria: "Veículos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Veículos para transporte coletivo" },
  { prefix: "8703", categoria: "Veículos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Automóveis de passageiros" },
  { prefix: "8704", categoria: "Veículos", monofasico: true, stSusceptivel: true, cestObrigatorio: true, descricao: "Veículos de carga" },
  // Eletrônicos
  { prefix: "8471", categoria: "Eletrônicos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Máquinas de processamento de dados" },
  { prefix: "8517", categoria: "Eletrônicos", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Telefones e aparelhos de telecomunicação" },
  // Vestuário
  { prefix: "6109", categoria: "Vestuário", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Camisetas e camisas interiores" },
  { prefix: "6110", categoria: "Vestuário", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Suéteres e pulôveres" },
  { prefix: "6204", categoria: "Vestuário", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Ternos e conjuntos femininos" },
  { prefix: "6205", categoria: "Vestuário", monofasico: false, stSusceptivel: false, cestObrigatorio: false, descricao: "Camisas masculinas" },
];

// ─── Engine ───

/**
 * Busca conhecimento local sobre um NCM
 */
export function getNcmKnowledge(ncm: string): NcmKnowledge {
  const clean = (ncm || "").replace(/\D/g, "");

  // Match mais específico primeiro (prefixo mais longo)
  let bestMatch: NcmPrefixRule | null = null;
  let bestLen = 0;

  for (const rule of NCM_PREFIX_RULES) {
    if (clean.startsWith(rule.prefix) && rule.prefix.length > bestLen) {
      bestMatch = rule;
      bestLen = rule.prefix.length;
    }
  }

  if (bestMatch) {
    return {
      ncm: clean,
      descricao: bestMatch.descricao,
      categoria: bestMatch.categoria,
      monofasico: bestMatch.monofasico,
      stSusceptivel: bestMatch.stSusceptivel,
      cestObrigatorio: bestMatch.cestObrigatorio,
    };
  }

  return {
    ncm: clean,
    descricao: "Produto sem classificação local",
    categoria: "Geral",
    monofasico: false,
    stSusceptivel: false,
    cestObrigatorio: false,
  };
}

/**
 * Verifica se um NCM é monofásico (PIS/COFINS concentrado)
 */
export function isMonofasico(ncm: string): boolean {
  return getNcmKnowledge(ncm).monofasico;
}

/**
 * Verifica se um NCM é susceptível a ST
 */
export function isSTSusceptivel(ncm: string): boolean {
  return getNcmKnowledge(ncm).stSusceptivel;
}

/**
 * Verifica se um NCM exige CEST
 */
export function isCESTObrigatorio(ncm: string): boolean {
  return getNcmKnowledge(ncm).cestObrigatorio;
}
