import { useState, memo } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { MobileTopBar } from "./MobileTopBar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { DemoBanner } from "./DemoBanner";
import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { OnlineStatusIndicator } from "./OnlineStatusIndicator";
import { SyncStatusPanel } from "./SyncStatusPanel";
import { AppHeader } from "./AppHeader";
import { PWAInstallPrompt } from "./PWAInstallPrompt";
import { useIsMobile } from "@/hooks/use-mobile";

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout = memo(function AppLayout({ children }: AppLayoutProps) {
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-full w-full">
      <AppSidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <UpdateNoticeModal />
        <OnlineStatusIndicator />
        <DemoBanner />
        <SubscriptionBanner />
        {isMobile ? <MobileTopBar /> : <AppHeader />}
        <main className={`flex-1 overflow-y-auto overflow-x-hidden min-h-0 min-w-0 ${isMobile ? "pb-20" : ""}`}>
          {isMobile ? (
            <div className="max-w-[480px] mx-auto w-full">{children}</div>
          ) : (
            children
          )}
        </main>
        {isMobile && <MobileBottomNav onMenuOpen={() => setMobileOpen(true)} />}
        <PWAInstallPrompt />
        <SyncStatusPanel />
      </div>
    </div>
  );
});
