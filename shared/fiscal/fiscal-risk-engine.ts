/**
 * Fiscal Risk Engine — Motor de Score de Risco Fiscal
 * 
 * Calcula score de risco (0–100) para cada emissão fiscal,
 * classificando por nível e gerando motivos rastreáveis.
 */

// ─── Tipos ───

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface FiscalRiskResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  shouldBlock: boolean;
}

export interface FiscalRiskInput {
  // Decisões do motor fiscal
  difalApplied?: boolean;
  difalRequired?: boolean;
  ncmWithoutRule?: boolean;
  fallbackUsed?: boolean;
  cfopAutoCorrected?: boolean;
  cpfInterstate?: boolean;
  taxRuleAbsent?: boolean;

  // Dados da nota
  isInterstate?: boolean;
  itemCount?: number;
  totalValue?: number;

  // Validações
  ncmInvalid?: boolean;
  cstInconsistent?: boolean;
  missingIE?: boolean;
  presenceAutoCorrected?: boolean;

  // Histórico (bloqueio inteligente)
  recentCriticalCount?: number; // notas críticas nas últimas 24h
  sameErrorRepeatCount?: number; // mesmo erro repetido
}

// ─── Regras de Scoring ───

interface ScoringRule {
  key: keyof FiscalRiskInput;
  points: number;
  condition: (value: any, input?: FiscalRiskInput) => boolean;
  reason: string;
}

const SCORING_RULES: ScoringRule[] = [
  // Positivos (reduzem risco)
  { key: "difalApplied", points: -10, condition: (v) => v === true, reason: "DIFAL aplicado corretamente" },

  // Negativos (aumentam risco)
  { key: "ncmWithoutRule", points: 30, condition: (v) => v === true, reason: "NCM sem regra tributária definida" },
  { key: "fallbackUsed", points: 20, condition: (v) => v === true, reason: "Fallback tributário utilizado" },
  { key: "taxRuleAbsent", points: 15, condition: (v) => v === true, reason: "Ausência de tax_rule para rota interestadual" },
  { key: "cfopAutoCorrected", points: 10, condition: (v) => v === true, reason: "CFOP auto-corrigido pelo motor" },
  { key: "cpfInterstate", points: 10, condition: (v) => v === true, reason: "CPF em operação interestadual" },
  { key: "ncmInvalid", points: 25, condition: (v) => v === true, reason: "NCM inválido ou ausente em item" },
  { key: "cstInconsistent", points: 20, condition: (v) => v === true, reason: "CST/CSOSN inconsistente com operação" },
  { key: "missingIE", points: 15, condition: (v) => v === true, reason: "IE ausente em operação que exigiria" },
  { key: "presenceAutoCorrected", points: 5, condition: (v) => v === true, reason: "Tipo de presença auto-corrigido (indPres)" },

  // DIFAL requerido mas não aplicado
  { key: "difalRequired", points: 35, condition: (v, input) => v === true && !input?.difalApplied, reason: "DIFAL obrigatório mas NÃO aplicado — risco de autuação" },

  // Bloqueio inteligente
  { key: "recentCriticalCount", points: 15, condition: (v) => typeof v === "number" && v >= 3, reason: "3+ notas críticas nas últimas 24h — padrão de risco" },
  { key: "sameErrorRepeatCount", points: 20, condition: (v) => typeof v === "number" && v >= 5, reason: "Mesmo erro fiscal repetido 5+ vezes — correção necessária" },
];

// ─── Engine Principal ───

export function calculateFiscalRisk(input: FiscalRiskInput): FiscalRiskResult {
  let score = 0;
  const reasons: string[] = [];

  for (const rule of SCORING_RULES) {
    const value = input[rule.key];
    // Special case: difalRequired needs full input context
    if (rule.key === "difalRequired") {
      if (rule.condition(value, input)) {
        score += rule.points;
        reasons.push(`[+${rule.points}] ${rule.reason}`);
      }
      continue;
    }
    if (value !== undefined && rule.condition(value)) {
      score += rule.points;
      if (rule.points > 0) {
        reasons.push(`[+${rule.points}] ${rule.reason}`);
      } else {
        reasons.push(`[${rule.points}] ${rule.reason}`);
      }
    }
  }

  // Clamp 0–100
  score = Math.max(0, Math.min(100, score));

  const level = scoreToLevel(score);
  const shouldBlock = score >= 70 || (input.sameErrorRepeatCount ?? 0) >= 5;

  return { score, level, reasons, shouldBlock };
}

function scoreToLevel(score: number): RiskLevel {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

// ─── Helpers para integração ───

export interface RiskLogEntry {
  company_id: string;
  note_id: string | null;
  note_type: "nfce" | "nfe";
  score: number;
  level: RiskLevel;
  reasons: string[];
  blocked: boolean;
}

export function buildRiskLogEntry(
  companyId: string,
  noteId: string | null,
  noteType: "nfce" | "nfe",
  result: FiscalRiskResult,
): RiskLogEntry {
  return {
    company_id: companyId,
    note_id: noteId,
    note_type: noteType,
    score: result.score,
    level: result.level,
    reasons: result.reasons,
    blocked: result.shouldBlock,
  };
}

export function shouldGenerateAlert(result: FiscalRiskResult): { generate: boolean; severity: "warning" | "critical" } {
  if (result.score >= 70) return { generate: true, severity: "critical" };
  if (result.score >= 50) return { generate: true, severity: "warning" };
  return { generate: false, severity: "warning" };
}
