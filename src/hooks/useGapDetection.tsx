import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/hooks/useCompany";

export interface NumberingGap {
  docType: "nfce" | "nfe";
  serie: number;
  start: number;
  end: number;
  count: number;
}

export function useGapDetection() {
  const { companyId } = useCompany();
  const [gaps, setGaps] = useState<NumberingGap[]>([]);
  const [loading, setLoading] = useState(false);

  const detectGaps = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);

    try {
      const detectedGaps: NumberingGap[] = [];

      for (const docType of ["nfce", "nfe"] as const) {
        // Fetch all fiscal numbers already consumed or officially inutilized grouped by serie
        const { data: docs } = await supabase
          .from("fiscal_documents")
          .select("number, serie, status")
          .eq("company_id", companyId)
          .eq("doc_type", docType)
          .not("number", "is", null)
          .order("number", { ascending: true });

        if (!docs || docs.length < 2) continue;

        // Group by serie
        const bySerie = new Map<number, number[]>();
        for (const d of docs) {
          if (!d.number) continue;
          const s = d.serie ?? 1;
          const n = d.number as number;
          if (!bySerie.has(s)) bySerie.set(s, []);
          bySerie.get(s)!.push(n);
        }

        for (const [serie, numbers] of bySerie) {
          const sorted = [...new Set(numbers)].sort((a, b) => a - b);
          if (sorted.length < 2) continue;

          let gapStart: number | null = null;
          let gapEnd: number | null = null;

          for (let i = 0; i < sorted.length - 1; i++) {
            const diff = sorted[i + 1] - sorted[i];
            if (diff > 1) {
              // Gap found between sorted[i]+1 and sorted[i+1]-1
              gapStart = sorted[i] + 1;
              gapEnd = sorted[i + 1] - 1;
              detectedGaps.push({
                docType,
                serie,
                start: gapStart,
                end: gapEnd,
                count: gapEnd - gapStart + 1,
              });
            }
          }
        }
      }

      setGaps(detectedGaps);
    } catch (err) {
      console.error("Gap detection error:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    detectGaps();
  }, [detectGaps]);

  return { gaps, loading, refresh: detectGaps };
}
