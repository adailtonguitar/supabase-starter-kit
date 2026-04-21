import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "@/lib/analytics";

/**
 * Dispara page_view no GA4 (G-YQCQ2JSS8C) a cada troca de rota.
 * Necessário porque `send_page_view: false` está ativado no gtag config
 * (padrão recomendado para SPAs — evita pageview duplicado/errado).
 */
export function AnalyticsTracker() {
  const { pathname } = useLocation();

  useEffect(() => {
    // Sanitiza querystring/hash — GA4 prefere o path limpo.
    // Se precisar de parâmetros específicos, capturar via trackEvent.
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
