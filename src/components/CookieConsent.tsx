import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  applySavedConsentToAnalytics,
  needsConsentDecision,
  setConsent,
} from "@/lib/consent";
import { trackEvent } from "@/lib/analytics";

/**
 * Banner de consentimento LGPD. Aparece na primeira visita e quando a
 * versão da política mudar. Não bloqueia a UI — o usuário pode navegar
 * e decidir depois, mas o GA4 fica silenciado até a decisão.
 *
 * Render global: ver App.tsx (entra dentro do BrowserRouter).
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Reaplica o consent salvo no gtag (redundância do script inline do
    // index.html — se CSP/adblock tiver bloqueado lá, entra aqui).
    applySavedConsentToAnalytics();

    // Mostra o banner só depois de um pequeno delay pra não competir com
    // o hero/LCP da landing. Não interfere em contentful paint.
    const t = window.setTimeout(() => {
      if (needsConsentDecision()) setVisible(true);
    }, 800);
    return () => window.clearTimeout(t);
  }, []);

  const handleAccept = () => {
    setConsent(true);
    trackEvent("cookie_consent", { decision: "accepted" });
    setVisible(false);
  };

  const handleReject = () => {
    setConsent(false);
    // Este evento NÃO chega no GA4 (consent denied), mas fica registrado
    // no dataLayer — útil se um dia ligarmos outro analytics.
    trackEvent("cookie_consent", { decision: "rejected" });
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", damping: 22, stiffness: 240 }}
          role="dialog"
          aria-live="polite"
          aria-label="Consentimento de cookies"
          className="fixed inset-x-0 bottom-0 z-[60] pointer-events-none px-3 sm:px-6 pb-3 sm:pb-6"
        >
          <div className="pointer-events-auto max-w-4xl mx-auto bg-card border border-border rounded-2xl shadow-2xl shadow-black/20 p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="hidden sm:flex w-10 h-10 rounded-xl bg-primary/10 items-center justify-center flex-shrink-0">
                <Cookie className="w-5 h-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <Cookie className="w-4 h-4 text-primary sm:hidden" />
                  <h2 className="text-sm sm:text-base font-bold text-foreground">
                    Usamos cookies pra melhorar seu uso
                  </h2>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Cookies essenciais fazem o site funcionar. Cookies de
                  analytics (Google Analytics, IP anonimizado) nos ajudam a
                  entender o que você precisa e melhorar o produto. Você escolhe
                  o que aceitar — pode mudar a decisão depois na nossa{" "}
                  <Link
                    to="/privacidade"
                    className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <Shield className="w-3 h-3" />
                    Política de Privacidade
                  </Link>
                  .
                </p>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mt-4">
                  <Button
                    onClick={handleAccept}
                    size="sm"
                    className="sm:flex-1 font-semibold"
                  >
                    Aceitar todos
                  </Button>
                  <Button
                    onClick={handleReject}
                    size="sm"
                    variant="outline"
                    className="sm:flex-1 font-medium border-border hover:bg-muted"
                  >
                    Apenas necessários
                  </Button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReject}
                aria-label="Recusar cookies não essenciais e fechar"
                className="hidden sm:flex w-7 h-7 rounded-lg items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
