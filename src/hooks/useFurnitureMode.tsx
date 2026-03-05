import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

interface FurnitureModeContextType {
  enabled: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
}

const FurnitureModeContext = createContext<FurnitureModeContextType>({
  enabled: false,
  loading: true,
  toggle: async () => {},
});

const CACHE_KEY = "as_furniture_mode";

export function FurnitureModeProvider({ children }: { children: ReactNode }) {
  const { companyId } = useCompany();
  const [enabled, setEnabled] = useState(() => localStorage.getItem(CACHE_KEY) === "true");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }
    const load = async () => {
      try {
        const { data, error } = await supabase
          .from("companies")
          .select("segment")
          .eq("id", companyId)
          .single();
        if (!error && data) {
          const val = (data as any)?.segment === "moveis";
          setEnabled(val);
          localStorage.setItem(CACHE_KEY, String(val));
        }
        // If error (column doesn't exist), keep localStorage value
      } catch {
        // Use cached value
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  const toggle = useCallback(async () => {
    if (!companyId) return;
    const newVal = !enabled;
    try {
      await supabase
        .from("companies")
        .update({ segment: newVal ? "moveis" : null } as any)
        .eq("id", companyId);
      setEnabled(newVal);
      localStorage.setItem(CACHE_KEY, String(newVal));
    } catch {
      // Fallback to localStorage only
      setEnabled(newVal);
      localStorage.setItem(CACHE_KEY, String(newVal));
    }
  }, [companyId, enabled]);

  return (
    <FurnitureModeContext.Provider value={{ enabled, loading, toggle }}>
      {children}
    </FurnitureModeContext.Provider>
  );
}

export function useFurnitureMode() {
  return useContext(FurnitureModeContext);
}
