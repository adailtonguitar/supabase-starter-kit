/**
 * SEFAZ Pre-Validator — Tipos compartilhados
 */

export interface SefazValidationResult {
  /** Pipeline passou sem erros bloqueantes */
  approved: boolean;
  /** Score de risco geral (0–100) */
  riskScore: number;
  riskLevel: "baixo" | "medio" | "alto" | "critico";
  /** Resumo por etapa */
  stages: {
    schema: StageResult;
    businessRules: StageResult;
    duplicity: StageResult;
    recipient: StageResult;
    simulation: StageResult;
  };
  /** Todos os problemas encontrados */
  errors: SefazIssue[];
  warnings: SefazIssue[];
  /** Auto-fixes aplicados (modo AUTO) */
  autoFixes: AutoFix[];
  /** Timestamp da validação */
  timestamp: string;
}

export interface StageResult {
  passed: boolean;
  issues: SefazIssue[];
  durationMs: number;
}

export interface SefazIssue {
  stage: string;
  code: string;
  field?: string;
  itemIndex?: number;
  severity: "error" | "warning";
  message: string;
  sefazRejeicao?: number;
  autoFixable?: boolean;
  suggestedFix?: string;
}

export interface AutoFix {
  field: string;
  itemIndex?: number;
  oldValue: string;
  newValue: string;
  reason: string;
}

export interface RecipientCheckResult {
  valid: boolean;
  cnpjAtivo: boolean;
  ieValida: boolean;
  situacao: string;
  source: "nuvemfiscal" | "cache" | "skip";
  error?: string;
}

export interface DuplicityCheckResult {
  isDuplicate: boolean;
  existingId?: string;
  existingChave?: string;
  existingStatus?: string;
}

export interface RejectionSimulation {
  code: number;
  description: string;
  probability: "alta" | "media" | "baixa";
  field?: string;
  itemIndex?: number;
}
