import { useState, useEffect } from "react";
import { Scale, Save, RotateCcw, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { getScaleConfig, saveScaleConfigToStorage, type ScaleConfig } from "@/lib/scale-barcode";
import { toast } from "sonner";

export function ScaleConfigSection() {
  const [config, setConfig] = useState<ScaleConfig>(getScaleConfig());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setConfig(getScaleConfig());
  }, []);

  const update = (partial: Partial<ScaleConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
    setDirty(true);
  };

  const handleSave = () => {
    saveScaleConfigToStorage(config);
    setDirty(false);
    toast.success("Configuração de balança salva!");
  };

  const handleReset = () => {
    localStorage.removeItem("scale_config");
    const defaults: ScaleConfig = {
      weightPrefixes: ["20", "21", "22", "23", "24"],
      pricePrefixes: ["25", "26", "27", "28", "29"],
      productCodeStart: 2,
      productCodeLength: 5,
      valueStart: 7,
      valueLength: 5,
      valueDivisor: 1000,
    };
    setConfig(defaults);
    saveScaleConfigToStorage(defaults);
    setDirty(false);
    toast.info("Configuração restaurada para o padrão");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-card rounded-xl card-shadow border border-border overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Scale className="w-4 h-4 text-primary" />
        <h2 className="text-base font-semibold text-foreground">Integração de Balança</h2>
      </div>
      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          Configure como o sistema interpreta códigos EAN-13 gerados por balanças. O padrão suporta os formatos Toledo/Filizola mais comuns no Brasil.
        </p>

        {/* Visual barcode breakdown */}
        <div className="bg-muted/50 rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Formato do Código EAN-13</h3>
          <div className="flex items-center gap-0.5 font-mono text-sm flex-wrap">
            <span className="px-2 py-1 rounded bg-primary/20 text-primary font-bold">PP</span>
             <span className="px-2 py-1 rounded bg-info/20 text-info font-bold">
               {"P".repeat(config.productCodeLength)}
             </span>
             <span className="px-2 py-1 rounded bg-warning/20 text-warning font-bold">
               {"V".repeat(config.valueLength)}
            </span>
            <span className="px-2 py-1 rounded bg-muted text-muted-foreground">C</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary/20" />
              <span className="text-muted-foreground">PP = Prefixo</span>
            </div>
             <div className="flex items-center gap-1.5">
               <span className="w-3 h-3 rounded bg-info/20" />
               <span className="text-muted-foreground">P = Código produto</span>
             </div>
             <div className="flex items-center gap-1.5">
               <span className="w-3 h-3 rounded bg-warning/20" />
              <span className="text-muted-foreground">V = Peso/Preço</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-muted" />
              <span className="text-muted-foreground">C = Dígito verificador</span>
            </div>
          </div>
        </div>

        {/* Prefix config */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Prefixos de Peso (kg)
            </label>
            <input
              type="text"
              value={config.weightPrefixes.join(", ")}
              onChange={(e) =>
                update({
                  weightPrefixes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="20, 21, 22, 23, 24"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted-foreground">Códigos com esses prefixos serão interpretados como peso em kg.</p>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Prefixos de Preço (R$)
            </label>
            <input
              type="text"
              value={config.pricePrefixes.join(", ")}
              onChange={(e) =>
                update({
                  pricePrefixes: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              placeholder="25, 26, 27, 28, 29"
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <p className="text-[11px] text-muted-foreground">Códigos com esses prefixos serão interpretados como preço em R$.</p>
          </div>
        </div>

        {/* Position config */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Início do Código</label>
            <input
              type="number"
              min={1}
              max={6}
              value={config.productCodeStart}
              onChange={(e) => update({ productCodeStart: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Dígitos Código</label>
            <input
              type="number"
              min={3}
              max={7}
              value={config.productCodeLength}
              onChange={(e) => update({ productCodeLength: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Início do Valor</label>
            <input
              type="number"
              min={5}
              max={9}
              value={config.valueStart}
              onChange={(e) => update({ valueStart: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">Dígitos Valor</label>
            <input
              type="number"
              min={4}
              max={6}
              value={config.valueLength}
              onChange={(e) => update({ valueLength: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        {/* Divisor */}
        <div className="space-y-1.5 max-w-xs">
          <label className="text-xs font-semibold text-foreground">Divisor do Valor</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100000}
              value={config.valueDivisor}
              onChange={(e) => update({ valueDivisor: Number(e.target.value) })}
              className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Peso: 1000 = gramas → kg. Preço: 100 = centavos → reais.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          {dirty && (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-all"
            >
              <Save className="w-4 h-4" /> Salvar
            </button>
          )}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-medium hover:opacity-90 transition-all"
          >
            <RotateCcw className="w-4 h-4" /> Restaurar Padrão
          </button>
        </div>
      </div>
    </motion.div>
  );
}
