import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";
import { useAuth } from "./useAuth";
import type { TechSpec } from "@/components/catalogo/FichaTecnicaVisual";

export function useTechSpecs(productId?: string) {
  const { companyId } = useCompany();
  const { user } = useAuth();
  const [spec, setSpec] = useState<TechSpec | null>(null);
  const [allSpecs, setAllSpecs] = useState<Record<string, TechSpec>>({});
  const [loading, setLoading] = useState(true);

  const mapRow = (row: any): TechSpec => ({
    width: row.width || undefined,
    height: row.height || undefined,
    depth: row.depth || undefined,
    weight: row.weight || undefined,
    materials: row.materials?.length ? row.materials : undefined,
    colors: row.colors?.length ? row.colors : undefined,
    assemblyTime: row.assembly_time || undefined,
    assemblyInstructions: row.assembly_instructions || undefined,
    warranty: row.warranty || undefined,
  });

  useEffect(() => {
    if (!companyId || !user) { setLoading(false); return; }
    let cancelled = false;

    (async () => {
      const query = supabase
        .from("product_tech_specs")
        .select("*")
        .eq("company_id", companyId);

      if (productId) query.eq("product_id", productId);

      const { data } = await query;
      if (cancelled) return;

      if (data) {
        const map: Record<string, TechSpec> = {};
        data.forEach((row: any) => { map[row.product_id] = mapRow(row); });
        setAllSpecs(map);
        if (productId && map[productId]) setSpec(map[productId]);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [companyId, user, productId]);

  const saveSpec = useCallback(async (pid: string, techSpec: TechSpec) => {
    if (!companyId) return;
    const payload = {
      company_id: companyId,
      product_id: pid,
      width: techSpec.width || "",
      height: techSpec.height || "",
      depth: techSpec.depth || "",
      weight: techSpec.weight || "",
      materials: techSpec.materials || [],
      colors: techSpec.colors || [],
      assembly_time: techSpec.assemblyTime || "",
      assembly_instructions: techSpec.assemblyInstructions || "",
      warranty: techSpec.warranty || "",
      updated_at: new Date().toISOString(),
    };

    await supabase.from("product_tech_specs").upsert(payload, { onConflict: "company_id,product_id" });
    setAllSpecs(prev => ({ ...prev, [pid]: techSpec }));
    if (pid === productId) setSpec(techSpec);
  }, [companyId, productId]);

  return { spec, allSpecs, loading, saveSpec };
}
