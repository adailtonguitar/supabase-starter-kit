import { useTenant } from "@/providers/TenantProvider";

export function useCompany() {
  const { currentCompanyId, currentCompany, isLoading, switchCompany } = useTenant();

  return {
    companyId: currentCompanyId,
    companyName: currentCompany?.name || null,
    logoUrl: currentCompany?.logo_url || null,
    slogan: currentCompany?.slogan || null,
    pixKey: currentCompany?.pix_key || null,
    pixKeyType: currentCompany?.pix_key_type || null,
    pixCity: currentCompany?.pix_city || currentCompany?.address_city || null,
    cnpj: currentCompany?.cnpj || null,
    ie: currentCompany?.ie || null,
    phone: currentCompany?.phone || null,
    addressStreet: currentCompany?.address_street || null,
    addressNumber: currentCompany?.address_number || null,
    addressNeighborhood: currentCompany?.address_neighborhood || null,
    addressCity: currentCompany?.address_city || null,
    addressState: currentCompany?.address_state || null,
    taxRegime: currentCompany?.tax_regime || null,
    crt: currentCompany?.crt != null ? Number(currentCompany.crt) : null,
    pdvAutoEmitNfce: currentCompany?.pdv_auto_emit_nfce ?? true,
    loading: isLoading,
    switchCompany,
  };
}
