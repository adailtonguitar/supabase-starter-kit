import { useEffect } from "react";
import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAnalytics } from "@/components/landing/LandingAnalytics";
import { LandingAdvantages } from "@/components/landing/LandingAdvantages";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";

export default function LandingPage() {
  // Show Tawk.to chat widget on the landing page
  useEffect(() => {
    document.body.classList.add('tawk-show');
    if ((window as any).Tawk_API?.showWidget) {
      (window as any).Tawk_API.showWidget();
    }
    return () => {
      document.body.classList.remove('tawk-show');
      if ((window as any).Tawk_API?.hideWidget) {
        (window as any).Tawk_API.hideWidget();
      }
    };
  }, []);

  return (
    <div className="landing-animated h-screen overflow-y-auto bg-background text-foreground scroll-smooth">
      <UpdateNoticeModal />
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <LandingAnalytics />
      <LandingAdvantages />
      <LandingPricing />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
