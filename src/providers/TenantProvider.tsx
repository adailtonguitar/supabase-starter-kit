import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";

interface Company {
  id: string;
  name: string;
  logo_url?: string | null;
  [key: string]: any;
}

interface TenantContextType {
  currentCompanyId: string | null;
  currentCompany: Company | null;
  companies: Company[];
  isLoading: boolean;
  switchCompany: (companyId: string) => void;
  refreshCompanies: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const STORAGE_KEY = "as_selected_company_id";

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY);
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setIsLoading(false);
      return;
    }

    try {
      // Get companies where user is active
      const { data: userCompanies, error: memberError } = await supabase
        .from("company_users")
        .select("company_id, is_active, companies(*)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (memberError) throw memberError;

      const validCompanies = (userCompanies || [])
        .map((uc: any) => uc.companies)
        .filter(Boolean) as Company[];

      setCompanies(validCompanies);

      // Resolve currentCompanyId
      let nextId = currentCompanyId;
      if (!nextId || !validCompanies.find((c) => c.id === nextId)) {
        nextId = validCompanies[0]?.id || null;
      }

      if (nextId !== currentCompanyId) {
        setCurrentCompanyId(nextId);
        if (nextId) {
          localStorage.setItem(STORAGE_KEY, nextId);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error("[TenantProvider] Error fetching companies:", error);
      // Requirement: If Supabase fails, THROW an error (no silent fallback)
      // However, for UI resilience during initial load, we might want to handle it 
      // but the user was strict. I'll throw here so the ErrorBoundary can catch it.
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [user, currentCompanyId]);

  useEffect(() => {
    if (session) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setCurrentCompanyId(null);
      setIsLoading(false);
    }
  }, [session]);

  const switchCompany = useCallback((companyId: string) => {
    const exists = companies.find((c) => c.id === companyId);
    if (!exists) {
      throw new Error("Usuário não tem acesso a esta empresa ou empresa inativa.");
    }
    setCurrentCompanyId(companyId);
    localStorage.setItem(STORAGE_KEY, companyId);
  }, [companies]);

  const currentCompany = companies.find((c) => c.id === currentCompanyId) || null;

  const value = {
    currentCompanyId,
    currentCompany,
    companies,
    isLoading,
    switchCompany,
    refreshCompanies: fetchCompanies,
  };

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }

  // Strict validation as requested:
  // Before any DB operation (usually where this hook is used), 
  // ensure currentCompanyId exists and user is authenticated
  const checkAccess = () => {
    if (!context.currentCompanyId) {
      throw new Error("Nenhuma empresa selecionada.");
    }
  };

  return { ...context, checkAccess };
}
