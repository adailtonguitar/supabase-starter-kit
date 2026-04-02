/**
 * ICMS-ST Engine — Motor de cálculo e detecção de Substituição Tributária.
 */
import { ST_TYPICAL_NCMS } from "../../shared/fiscal/st-typical-ncms";

export function isTypicalStNcm(ncm: string | null | undefined): { isTypical: boolean; description?: string; segments?: string[] } {
  if (!ncm) return { isTypical: false };
  const cleaned = ncm.replace(/\D/g, "").trim();
  const match = ST_TYPICAL_NCMS[cleaned];
  if (match) return { isTypical: true, ...match };
  return { isTypical: false };
}

export interface IcmsStCalculationInput {
  productValue: number;
  ipiValue?: number;
  freightValue?: number;
  otherExpenses?: number;
  mvaOriginal: number;
  mvaAdjusted?: number;
  icmsOwnRate: number;
  icmsInternalRate: number;
  icmsInterstateRate?: number;
  isInterstate: boolean;
}

export interface IcmsStCalculationResult {
  bcIcmsOwn: number;
  icmsOwn: number;
  mvaUsed: number;
  bcIcmsSt: number;
  icmsSt: number;
  totalWithSt: number;
}

export function calculateIcmsSt(input: IcmsStCalculationInput): IcmsStCalculationResult {
  const baseValue = input.productValue + (input.ipiValue || 0) + (input.freightValue || 0) + (input.otherExpenses || 0);
  const rateOwn = input.isInterstate ? (input.icmsInterstateRate || input.icmsOwnRate) / 100 : input.icmsOwnRate / 100;
  const bcIcmsOwn = baseValue;
  const icmsOwn = bcIcmsOwn * rateOwn;
  const mvaUsed = input.isInterstate && input.mvaAdjusted != null ? input.mvaAdjusted : input.mvaOriginal;
  const bcIcmsSt = baseValue * (1 + mvaUsed / 100);
  const icmsStTotal = bcIcmsSt * (input.icmsInternalRate / 100);
  const icmsSt = Math.max(0, icmsStTotal - icmsOwn);

  return {
    bcIcmsOwn: Math.round(bcIcmsOwn * 100) / 100,
    icmsOwn: Math.round(icmsOwn * 100) / 100,
    mvaUsed,
    bcIcmsSt: Math.round(bcIcmsSt * 100) / 100,
    icmsSt: Math.round(icmsSt * 100) / 100,
    totalWithSt: Math.round((baseValue + icmsSt) * 100) / 100,
  };
}

export function calculateAdjustedMva(mvaOriginal: number, aliqInterstate: number, aliqInternal: number): number {
  if (aliqInternal >= 100) return mvaOriginal;
  const adjusted = ((1 + mvaOriginal / 100) * (1 - aliqInterstate / 100)) / (1 - aliqInternal / 100) - 1;
  return Math.round(adjusted * 10000) / 100;
}

export const BRAZILIAN_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO",
  "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR",
  "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
