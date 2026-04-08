/**
 * SEFAZ Pre-Validator — Pipeline completo de pré-validação
 * 
 * Pipeline:
 * 1. validateSchema → estrutura XSD
 * 2. validateBusinessRules → regras fiscais
 * 3. checkDuplicity → NF-e duplicada
 * 4. checkRecipient → consulta cadastral
 * 5. simulateRejections → rejeições SEFAZ
 * 6. calculateRisk → score de risco
 * 
 * Modos:
 * - STRICT: bloqueia qualquer erro
 * - AUTO: tenta corrigir + avisa
 */

import { validateSchema, type SchemaInput } from "./schema-validator";
import { simulateRejections, type SimulationInput } from "./rejection-simulator";
import { checkDuplicity, type DuplicityInput } from "./duplicity-checker";
import { checkRecipient, type RecipientInput } from "./recipient-checker";
import { validateFiscalDocument, type DocValidationInput } from "../validators/document-validator";
import type {
  SefazValidationResult,
  StageResult,
  SefazIssue,
  AutoFix,
} from "./types";

// Re-export types
export type {
  SefazValidationResult,
  SefazIssue,
  AutoFix,
  StageResult,
  RejectionSimulation,
  RecipientCheckResult,
  DuplicityCheckResult,
} from "./types";

export type { SchemaInput, SchemaItemInput } from "./schema-validator";
export type { SimulationInput, SimulationItem } from "./rejection-simulator";
export type { DuplicityInput } from "./duplicity-checker";
export type { RecipientInput } from "./recipient-checker";

// ─── Tipos de entrada do pipeline ───

export type FiscalMode = "STRICT" | "AUTO";

export interface PreValidationInput {
  mode: FiscalMode;
  // Schema data
  schema: SchemaInput;
  // Business rules (reusa DocValidationInput)
  businessRules: DocValidationInput;
  // Duplicity check
  duplicity?: DuplicityInput;
  // Recipient check
  recipient?: RecipientInput;
  // Simulation
  simulation: SimulationInput;
  // Supabase client (para duplicity check)
  supabase?: any;
  // Nuvem Fiscal token (para recipient check)
  nuvemFiscalToken?: string;
}

// ─── Pipeline Principal ───

export async function preValidateNfe(input: PreValidationInput): Promise<SefazValidationResult> {
  const startTime = Date.now();
  const allErrors: SefazIssue[] = [];
  const allWarnings: SefazIssue[] = [];
  const autoFixes: AutoFix[] = [];

  // ── Stage 1: Schema ──
  const schemaStart = Date.now();
  const schemaIssues = validateSchema(input.schema);
  const schemaStage = buildStage(schemaIssues, schemaStart);

  // ── Stage 2: Business Rules ──
  const brStart = Date.now();
  const brResult = validateFiscalDocument(input.businessRules);
  const brIssues: SefazIssue[] = brResult.all.map(i => ({
    stage: "businessRules",
    code: i.code,
    field: i.field,
    itemIndex: i.itemIndex,
    severity: i.type,
    message: i.message,
    autoFixable: i.autoFixable,
    suggestedFix: i.suggestedFix,
  }));

  // Em modo AUTO, aplicar auto-fixes
  if (input.mode === "AUTO") {
    for (const issue of brIssues) {
      if (issue.autoFixable && issue.suggestedFix && issue.severity === "error") {
        autoFixes.push({
          field: issue.field || "",
          itemIndex: issue.itemIndex,
          oldValue: "(inválido)",
          newValue: issue.suggestedFix,
          reason: issue.message,
        });
        // Downgrade to warning após auto-fix
        issue.severity = "warning";
        issue.message = `[AUTO-FIX] ${issue.message} → Corrigido para "${issue.suggestedFix}"`;
      }
    }
  }

  const brStage = buildStage(brIssues, brStart);

  // ── Stage 3: Duplicity ──
  const dupStart = Date.now();
  let dupIssues: SefazIssue[] = [];
  if (input.duplicity && input.supabase) {
    const dupResult = await checkDuplicity(input.supabase, input.duplicity);
    if (dupResult.isDuplicate) {
      dupIssues.push({
        stage: "duplicity", code: "DUPLICATE_NFE", severity: "error",
        message: `NF-e duplicada encontrada (ID: ${dupResult.existingId}, Status: ${dupResult.existingStatus}). Chave: ${dupResult.existingChave || "N/A"}`,
        sefazRejeicao: 204,
      });
    }
  }
  const dupStage = buildStage(dupIssues, dupStart);

  // ── Stage 4: Recipient ──
  const recStart = Date.now();
  let recIssues: SefazIssue[] = [];
  if (input.recipient) {
    const recResult = await checkRecipient(input.recipient, input.nuvemFiscalToken);
    if (!recResult.cnpjAtivo) {
      recIssues.push({
        stage: "recipient", code: "DEST_CNPJ_INATIVO", severity: "error",
        message: `CNPJ do destinatário com situação "${recResult.situacao}". Emissão pode ser rejeitada.`,
        sefazRejeicao: 209,
      });
    }
    if (!recResult.ieValida && input.recipient.indIEDest === 1) {
      recIssues.push({
        stage: "recipient", code: "DEST_IE_INVALIDA", severity: "error",
        message: "IE do destinatário pode estar inválida/cancelada na SEFAZ.",
        sefazRejeicao: 806,
      });
    }
    if (recResult.error) {
      recIssues.push({
        stage: "recipient", code: "DEST_CHECK_ERROR", severity: "warning",
        message: `Consulta cadastral com erro: ${recResult.error}. Emissão não bloqueada.`,
      });
    }
  }
  const recStage = buildStage(recIssues, recStart);

  // ── Stage 5: Simulation ──
  const simStart = Date.now();
  const rejections = simulateRejections(input.simulation);
  const simIssues: SefazIssue[] = rejections.map(r => ({
    stage: "simulation",
    code: `REJ_${r.code}`,
    field: r.field,
    itemIndex: r.itemIndex,
    severity: r.probability === "alta" ? "error" as const : "warning" as const,
    message: `[Rej ${r.code}] ${r.description}`,
    sefazRejeicao: r.code,
  }));
  const simStage = buildStage(simIssues, simStart);

  // ── Consolidar ──
  const allIssues = [
    ...schemaIssues.map(i => ({ ...i, stage: "schema" as const })),
    ...brIssues,
    ...dupIssues,
    ...recIssues,
    ...simIssues,
  ];

  for (const issue of allIssues) {
    if (issue.severity === "error") allErrors.push(issue);
    else allWarnings.push(issue);
  }

  // ── Risk Score ──
  const riskScore = calculateRiskScore(allErrors, allWarnings, autoFixes);
  const riskLevel = riskScore >= 70 ? "critico" as const
    : riskScore >= 50 ? "alto" as const
    : riskScore >= 25 ? "medio" as const
    : "baixo" as const;

  const approved = input.mode === "STRICT"
    ? allErrors.length === 0
    : allErrors.filter(e => !autoFixes.some(af => af.field === e.field && af.itemIndex === e.itemIndex)).length === 0;

  return {
    approved,
    riskScore,
    riskLevel,
    stages: {
      schema: schemaStage,
      businessRules: brStage,
      duplicity: dupStage,
      recipient: recStage,
      simulation: simStage,
    },
    errors: allErrors,
    warnings: allWarnings,
    autoFixes,
    timestamp: new Date().toISOString(),
  };
}

// ─── Helpers ───

function buildStage(issues: SefazIssue[], startTime: number): StageResult {
  return {
    passed: !issues.some(i => i.severity === "error"),
    issues,
    durationMs: Date.now() - startTime,
  };
}

function calculateRiskScore(
  errors: SefazIssue[],
  warnings: SefazIssue[],
  autoFixes: AutoFix[],
): number {
  let score = 0;

  // Cada erro bloqueante = +15
  score += errors.length * 15;

  // Cada warning = +5
  score += warnings.length * 5;

  // Rejeições SEFAZ de alta probabilidade = +10 extra
  const highProbRejections = errors.filter(e => e.stage === "simulation");
  score += highProbRejections.length * 10;

  // Duplicidade = +30
  if (errors.some(e => e.code === "DUPLICATE_NFE")) score += 30;

  // Destinatário inativo = +20
  if (errors.some(e => e.code === "DEST_CNPJ_INATIVO")) score += 20;

  // Auto-fixes reduzem um pouco
  score -= autoFixes.length * 5;

  return Math.max(0, Math.min(100, score));
}

// ─── Exportar sub-módulos ───
export { validateSchema } from "./schema-validator";
export { simulateRejections } from "./rejection-simulator";
export { checkDuplicity } from "./duplicity-checker";
export { checkRecipient } from "./recipient-checker";
