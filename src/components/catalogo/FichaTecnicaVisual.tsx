import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Ruler, Weight, Layers, Wrench, Info } from "lucide-react";

interface TechSpec {
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

// localStorage persistence
const SPECS_KEY = "as_furniture_tech_specs";
export function loadSpecs(): Record<string, TechSpec> {
  try { return JSON.parse(localStorage.getItem(SPECS_KEY) || "{}"); } catch { return {}; }
}
export function saveSpecs(data: Record<string, TechSpec>) {
  localStorage.setItem(SPECS_KEY, JSON.stringify(data));
}

// Demo specs
export const defaultDemoSpecs: Record<string, TechSpec> = {
  "demo-1": { width: "200cm", height: "85cm", depth: "90cm", weight: "57kg", materials: ["Couro Sintético", "Madeira Eucalipto", "Espuma D33"], colors: ["Marrom Caramelo", "Preto", "Cinza"], assemblyTime: "30 min", assemblyInstructions: "Encaixar pés e apoio de braço. Sem ferramentas.", warranty: "12 meses" },
  "demo-2": { width: "180cm", height: "78cm", depth: "100cm", weight: "45kg", materials: ["MDF", "Vidro Temperado 8mm"], colors: ["Carvalho", "Branco"], assemblyTime: "1h", assemblyInstructions: "Parafusar pés e fixar tampo de vidro.", warranty: "12 meses" },
  "demo-3": { width: "158cm", height: "110cm", depth: "198cm", weight: "90kg", materials: ["Tecido Suede", "Espuma D45", "Mola Bonnel", "MDF"], colors: ["Cinza", "Bege", "Marrom"], assemblyTime: "45 min", assemblyInstructions: "Montar base box, posicionar colchão e fixar cabeceira.", warranty: "24 meses" },
  "demo-4": { width: "220cm", height: "240cm", depth: "60cm", weight: "110kg", materials: ["MDP", "Espelho", "Puxadores Alumínio"], colors: ["Branco", "Carvalho"], assemblyTime: "3h", assemblyInstructions: "Montagem profissional recomendada. 4 volumes.", warranty: "12 meses" },
  "demo-5": { width: "180cm", height: "55cm", depth: "40cm", weight: "28kg", materials: ["MDF", "Metal"], colors: ["Branco", "Preto", "Carvalho"], assemblyTime: "40 min", warranty: "12 meses" },
  "demo-6": { width: "120cm", height: "75cm", depth: "60cm", weight: "22kg", materials: ["MDF", "Metal"], colors: ["Branco", "Carvalho Natural"], assemblyTime: "30 min", warranty: "12 meses" },
};

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
            {/* Visual dimension block */}
            <div className="relative border-2 border-dashed border-primary/40 rounded-lg p-6 min-w-[140px] min-h-[80px] flex items-center justify-center bg-primary/5">
              {/* Width label */}
              {spec.width && (
                <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-bold text-primary whitespace-nowrap">
                  ↔ {spec.width}
                </div>
              )}
              {/* Height label */}
              {spec.height && (
                <div className="absolute -right-14 top-1/2 -translate-y-1/2 text-xs font-bold text-primary whitespace-nowrap rotate-90">
                  ↕ {spec.height}
                </div>
              )}
              {/* Depth label */}
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

      {/* Weight */}
      {spec.weight && (
        <div className="flex items-center gap-2 text-sm">
          <Weight className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Peso:</span>
          <span className="font-semibold">{spec.weight}</span>
        </div>
      )}

      {/* Materials */}
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

      {/* Colors */}
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

      {/* Assembly */}
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

      {/* Warranty */}
      {spec.warranty && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">🛡️ Garantia:</span>
          <span className="font-semibold">{spec.warranty}</span>
        </div>
      )}
    </div>
  );
}

export type { TechSpec };
