import { useState } from "react";
import { AppSidebar } from "./AppSidebar";
import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { useWhatsAppSupport } from "@/hooks/useWhatsAppSupport";
import { useIsMobile } from "@/hooks/use-mobile";
import { Menu } from "lucide-react";

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

function HeaderWhatsAppButton() {
  const { whatsappNumber, loading, openWhatsApp } = useWhatsAppSupport();

  if (loading || !whatsappNumber) return null;

  return (
    <button
      onClick={() => openWhatsApp("Olá! Preciso de ajuda com o sistema.")}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-[#25D366] hover:bg-[#25D366]/10 transition-colors"
      title="Suporte via WhatsApp"
    >
      <WhatsAppIcon />
      <span className="hidden sm:inline">Suporte</span>
    </button>
  );
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden max-w-full">
      <UpdateNoticeModal />
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <SubscriptionBanner />
        <header className="h-12 border-b border-border bg-card flex items-center justify-between px-2 sm:px-4 shrink-0 gap-2">
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(true)}
              className="p-2 rounded-lg text-foreground hover:bg-muted transition-colors"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
          ) : (
            <div />
          )}
          <HeaderWhatsAppButton />
        </header>
        <main className="flex-1 overflow-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}
