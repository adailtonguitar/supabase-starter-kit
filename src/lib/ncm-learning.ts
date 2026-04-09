/**
 * NCM Learning Engine — Aprendizado automático de NCM baseado no uso.
 * 
 * Armazena em localStorage um mapa termo→NCM com contagem de uso.
 * Após 3+ usos, sugere o NCM aprendido para novos cadastros.
 * 
 * NÃO altera XML, emissão, cálculos ou funções existentes.
 * APENAS sugere — nunca bloqueia ou corrige automaticamente.
 */

const STORAGE_KEY = "ncm_learning_data";

interface NcmLearningEntry {
  ncm: string;
  count: number;
}

/** Mapa: termo (lowercase) → NCM + contagem */
type NcmLearningMap = Record<string, NcmLearningEntry>;

const MIN_COUNT_TO_SUGGEST = 3;

/** Extrai termos-chave de uma descrição de produto */
function extractTerms(descricao: string): string[] {
  const normalized = descricao
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  const words = normalized.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length === 0) return [];

  // Retorna o primeiro termo significativo e combinações de 2 palavras
  const terms: string[] = [words[0]];
  if (words.length >= 2) {
    terms.push(`${words[0]} ${words[1]}`);
  }
  return terms;
}

/** Carrega mapa de aprendizado do localStorage */
function loadMap(): NcmLearningMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as NcmLearningMap;
  } catch {
    return {};
  }
}

/** Salva mapa de aprendizado no localStorage */
function saveMap(map: NcmLearningMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage cheio ou indisponível — ignora silenciosamente
  }
}

/**
 * Registra o uso de um NCM para uma descrição de produto.
 * Chamado após salvar produto com sucesso.
 */
export function aprenderNCM(descricao: string, ncm: string): void {
  if (!descricao || !ncm) return;
  const cleanNcm = ncm.replace(/\D/g, "");
  if (cleanNcm.length !== 8) return;

  const terms = extractTerms(descricao);
  if (terms.length === 0) return;

  const map = loadMap();

  for (const termo of terms) {
    const existing = map[termo];
    if (existing) {
      if (existing.ncm === cleanNcm) {
        existing.count++;
      } else if (existing.count <= 1) {
        // NCM diferente com pouco histórico — substitui
        map[termo] = { ncm: cleanNcm, count: 1 };
      }
      // Se NCM diferente com count alto, mantém o aprendido
    } else {
      map[termo] = { ncm: cleanNcm, count: 1 };
    }
  }

  saveMap(map);
  console.log("[NCM-APRENDIZADO] Registrado:", { descricao, ncm: cleanNcm, terms });
}

/**
 * Sugere NCM com base no aprendizado acumulado.
 * Retorna sugestão apenas se count >= MIN_COUNT_TO_SUGGEST.
 */
export function sugerirNCM(
  descricao: string
): { ncm: string; termo: string; count: number } | null {
  if (!descricao) return null;

  const terms = extractTerms(descricao);
  if (terms.length === 0) return null;

  const map = loadMap();

  // Prioriza termo mais específico (2 palavras) sobre genérico (1 palavra)
  for (const termo of [...terms].reverse()) {
    const entry = map[termo];
    if (entry && entry.count >= MIN_COUNT_TO_SUGGEST) {
      console.warn("[NCM-APRENDIDO]", {
        descricao,
        termo,
        ncm_sugerido: entry.ncm,
        usos: entry.count,
      });
      return { ncm: entry.ncm, termo, count: entry.count };
    }
  }

  return null;
}

/**
 * Retorna todas as entradas de aprendizado (para debug/visualização).
 */
export function getNCMLearningData(): NcmLearningMap {
  return loadMap();
}

/**
 * Limpa todos os dados de aprendizado.
 */
export function clearNCMLearningData(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignora
  }
}
