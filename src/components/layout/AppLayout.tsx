import { useState, memo } from "react";
import { AppSidebar } from "./AppSidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { DemoBanner } from "./DemoBanner";
import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { OnlineStatusIndicator } from "./OnlineStatusIndicator";
import { AppHeader } from "./AppHeader";
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
      <div className="flex-1 flex flex-col min-w-0 min-h-0 max-w-full">
        <UpdateNoticeModal />
        <OnlineStatusIndicator />
        <DemoBanner />
        <SubscriptionBanner />
        <AppHeader />
        <main className={`flex-1 overflow-auto min-h-0 min-w-0 ${isMobile ? "pb-20" : ""}`}>{children}</main>
        {isMobile && <MobileBottomNav onMenuOpen={() => setMobileOpen(true)} />}
      </div>
    </div>
  );
});
