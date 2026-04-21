/**
 * Gerência de consentimento LGPD para cookies/analytics.
 *
 * Modelo: opt-in explícito. GA4 só trackeia depois que o usuário clica
 * "Aceitar" no banner (CookieConsent.tsx). Se clicar "Só necessários",
 * registramos `rejected` e o tracking fica desativado.
 *
 * Versionamento: se a política mudar materialmente (novas categorias de
 * cookies, novo fornecedor, mudança de finalidade), incrementar
 * CONSENT_VERSION. Isso zera a decisão anterior e re-exibe o banner.
 *
 * IMPORTANTE: index.html já lê o mesmo storage key ANTES do React montar
 * pra decidir o default do gtag. Se mudar a key aqui, mudar lá também.
 */

import { updateConsent as updateGtagConsent } from "@/lib/analytics";

export const CONSENT_STORAGE_KEY = "as_cookie_consent_v1";
export const CONSENT_VERSION = 1;

export type ConsentStatus = "pending" | "accepted" | "rejected";

export interface ConsentRecord {
  status: ConsentStatus;
  version: number;
  timestamp: string; // ISO 8601
}

function readRaw(): ConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>;
    if (!parsed || typeof parsed.status !== "string") return null;
    return {
      status: parsed.status as ConsentStatus,
      version: typeof parsed.version === "number" ? parsed.version : 0,
      timestamp: parsed.timestamp ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Retorna a decisão atual do usuário. Se a versão no storage for anterior
 * à atual (CONSENT_VERSION), trata como "pending" — força re-pergunta.
 */
export function getConsent(): ConsentRecord {
  const record = readRaw();
  if (!record || record.version < CONSENT_VERSION) {
    return {
      status: "pending",
      version: CONSENT_VERSION,
      timestamp: new Date().toISOString(),
    };
  }
  return record;
}

/**
 * true se o banner deve ser exibido (primeira visita ou política nova).
 */
export function needsConsentDecision(): boolean {
  return getConsent().status === "pending";
}

/**
 * Salva a decisão e propaga pro gtag. Chamar daqui:
 *  - CookieConsent.tsx no clique dos botões
 *  - Página de preferências (ex.: /privacidade) se criarmos toggle
 */
export function setConsent(accepted: boolean): void {
  const record: ConsentRecord = {
    status: accepted ? "accepted" : "rejected",
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // localStorage bloqueado (modo anônimo estrito do Safari) — seguimos
    // só em memória; o gtag update vale pra sessão atual.
  }
  updateGtagConsent(accepted);
}

/**
 * Aplica o consent salvo no gtag logo após o React montar, pra garantir
 * que o estado de runtime reflita o storage mesmo se o script inline do
 * index.html tiver sido bloqueado por CSP/adblock.
 */
export function applySavedConsentToAnalytics(): void {
  const record = readRaw();
  if (!record) return;
  if (record.status === "accepted") updateGtagConsent(true);
  else if (record.status === "rejected") updateGtagConsent(false);
}
