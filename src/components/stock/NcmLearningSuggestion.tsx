import { useEffect, useState } from "react";
import { sugerirNCM } from "@/lib/ncm-learning";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  productName: string;
  currentNcm: string;
  onApply: (ncm: string) => void;
}

/**
 * Inline NCM suggestion based on learning engine.
 * Shows only when there's a learned suggestion different from current NCM.
 */
export function NcmLearningSuggestion({ productName, currentNcm, onApply }: Props) {
  const [suggestion, setSuggestion] = useState<{ ncm: string; count: number } | null>(null);

  useEffect(() => {
    if (!productName || productName.trim().length < 3) {
      setSuggestion(null);
      return;
    }
    const result = sugerirNCM(productName);
    if (result) {
      const cleanCurrent = (currentNcm || "").replace(/\D/g, "");
      if (cleanCurrent !== result.ncm) {
        setSuggestion({ ncm: result.ncm, count: result.count });
      } else {
        setSuggestion(null);
      }
    } else {
      setSuggestion(null);
    }
  }, [productName, currentNcm]);

  if (!suggestion) return null;

  return (
    <div className="flex items-center gap-2 mt-1.5 px-2 py-1.5 rounded-md bg-primary/5 border border-primary/20">
      <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-xs text-foreground flex-1">
        Sugestão IA: <span className="font-mono font-semibold">{suggestion.ncm}</span>
        <span className="text-muted-foreground ml-1">({suggestion.count}x usado)</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-primary hover:text-primary"
        onClick={() => onApply(suggestion.ncm)}
      >
        Aplicar
      </Button>
    </div>
  );
}
