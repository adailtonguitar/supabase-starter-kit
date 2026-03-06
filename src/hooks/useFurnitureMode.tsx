import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "./useCompany";

interface FurnitureModeContextType {
  enabled: boolean;
  loading: boolean;
}

const FurnitureModeContext = createContext<FurnitureModeContextType>({
  enabled: false,
  loading: true,
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
      } catch {
        // Use cached value
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [companyId]);

  return (
    <FurnitureModeContext.Provider value={{ enabled, loading }}>
      {children}
    </FurnitureModeContext.Provider>
  );
}

export function useFurnitureMode() {
  return useContext(FurnitureModeContext);
}
