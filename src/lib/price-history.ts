import { supabase } from "@/integrations/supabase/client";

interface PriceChange {
  company_id: string;
  product_id: string;
  field_changed: "price" | "cost_price";
  old_value: number;
  new_value: number;
  changed_by?: string | null;
  source: "manual" | "batch" | "xml_import";
}

export async function recordPriceChange(change: PriceChange) {
  if (change.old_value === change.new_value) return;
  try {
    await supabase.from("price_history" as any).insert({
      company_id: change.company_id,
      product_id: change.product_id,
      field_changed: change.field_changed,
      old_value: change.old_value,
      new_value: change.new_value,
      changed_by: change.changed_by || null,
      source: change.source,
    });
  } catch (err) {
    console.error("[PriceHistory] Failed to record:", err);
  }
}

export async function recordPriceChanges(changes: PriceChange[]) {
  const filtered = changes.filter((c) => c.old_value !== c.new_value);
  if (filtered.length === 0) return;
  try {
    await supabase.from("price_history" as any).insert(
      filtered.map((c) => ({
        company_id: c.company_id,
        product_id: c.product_id,
        field_changed: c.field_changed,
        old_value: c.old_value,
        new_value: c.new_value,
        changed_by: c.changed_by || null,
        source: c.source,
      }))
    );
  } catch (err) {
    console.error("[PriceHistory] Failed to record batch:", err);
  }
}
