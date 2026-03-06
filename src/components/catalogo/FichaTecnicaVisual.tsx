import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ruler, Weight, Layers, Wrench, Info } from "lucide-react";

export interface TechSpec {
  width?: string;
  height?: string;
  depth?: string;
  weight?: string;
  materials?: string[];
  colors?: string[];
  assemblyTime?: string;
  assemblyInstructions?: string;
  warranty?: string;
}

interface FichaTecnicaProps {
  spec: TechSpec;
}

export default function FichaTecnicaVisual({ spec }: FichaTecnicaProps) {
  const hasDimensions = spec.width || spec.height || spec.depth;

  return (
    <div className="space-y-4">
      {/* Dimensions Visual */}
      {hasDimensions && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-3 flex items-center gap-1.5">
            <Ruler className="w-3.5 h-3.5" /> Dimensões
          </p>
          <div className="flex items-end justify-center gap-6">
            <div className="relative border-2 border-dashed border-primary/40 rounded-lg p-6 min-w-[140px] min-h-[80px] flex items-center justify-center bg-primary/5">
              {spec.width && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary whitespace-nowrap">
                  ↔ {spec.width}
                </div>
              )}
              {spec.height && (
                <div className="absolute -right-14 top-1/2 -translate-y-1/2 text-xs font-bold text-primary whitespace-nowrap rotate-90">
                  ↕ {spec.height}
                </div>
              )}
              {spec.depth && (
                <span className="text-xs text-muted-foreground">
                  Prof: {spec.depth}
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-8 text-xs text-muted-foreground">
            {spec.width && <span>L: {spec.width}</span>}
            {spec.height && <span>A: {spec.height}</span>}
            {spec.depth && <span>P: {spec.depth}</span>}
          </div>
        </div>
      )}

      {spec.weight && (
        <div className="flex items-center gap-2 text-sm">
          <Weight className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Peso:</span>
          <span className="font-semibold">{spec.weight}</span>
        </div>
      )}

      {spec.materials && spec.materials.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" /> Materiais
          </p>
          <div className="flex flex-wrap gap-1.5">
            {spec.materials.map(m => (
              <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
            ))}
          </div>
        </div>
      )}

      {spec.colors && spec.colors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">🎨 Cores Disponíveis</p>
          <div className="flex flex-wrap gap-1.5">
            {spec.colors.map(c => (
              <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
            ))}
          </div>
        </div>
      )}

      <Separator />

      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5" /> Montagem
        </p>
        {spec.assemblyTime && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Tempo estimado:</span>
            <Badge variant="outline" className="text-xs">{spec.assemblyTime}</Badge>
          </div>
        )}
        {spec.assemblyInstructions && (
          <p className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 flex items-start gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {spec.assemblyInstructions}
          </p>
        )}
      </div>

      {spec.warranty && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">🛡️ Garantia:</span>
          <span className="font-semibold">{spec.warranty}</span>
        </div>
      )}
    </div>
  );
}
