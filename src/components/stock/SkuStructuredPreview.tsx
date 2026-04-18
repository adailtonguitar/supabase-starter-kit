/**
 * SkuStructuredPreview
 * Mostra o preview da base CAT-MOD-VAR derivada dos campos category/modelo/tipo_material,
 * + campo opcional de override manual do SKU estruturado.
 *
 * Nada bloqueante — se faltar dados, exibe aviso e continua usando SKU legado.
 */
import { useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";
import {
  buildSkuStructuredBase,
  SKU_STRUCTURED_MAX_LEN,
} from "@/lib/sku-structured";

interface Props {
  // form é genérico — usamos `any` para evitar acoplar ao schema do parent
  form: UseFormReturn<any>;
}

export function SkuStructuredPreview({ form }: Props) {
  const category = form.watch("category");
  const modelo = form.watch("modelo");
  const tipoMaterial = form.watch("tipo_material");
  const voltage = form.watch("voltage");
  const brand = form.watch("brand");

  const base = useMemo(
    () =>
      buildSkuStructuredBase({
        category,
        modelo,
        tipo_material: tipoMaterial,
        voltage,
        brand,
      }),
    [category, modelo, tipoMaterial, voltage, brand]
  );

  return (
    <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-foreground">SKU Estruturado</span>
          <span className="text-xs text-muted-foreground">(CAT-MOD-VAR-SEQ)</span>
        </div>
        {base ? (
          <Badge variant="secondary" className="font-mono text-xs">
            {base}-XXX
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs gap-1">
            <Info className="w-3 h-3" />
            Preencha Categoria + Modelo + Tipo/Material
          </Badge>
        )}
      </div>

      <FormField
        control={form.control}
        name={"sku_structured" as any}
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-xs text-muted-foreground">
              Override manual (opcional)
            </FormLabel>
            <FormControl>
              <Input
                placeholder={
                  base
                    ? `Deixe vazio para gerar ${base}-001 automaticamente`
                    : "Ex: ELET-IPHN-VIDR-001"
                }
                {...field}
                value={field.value ?? ""}
                onChange={(e) =>
                  field.onChange(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, SKU_STRUCTURED_MAX_LEN)
                  )
                }
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={SKU_STRUCTURED_MAX_LEN}
                className="font-mono text-sm"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
