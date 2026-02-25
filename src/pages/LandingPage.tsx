import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAnalytics } from "@/components/landing/LandingAnalytics";
import { LandingAdvantages } from "@/components/landing/LandingAdvantages";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";

export default function LandingPage() {
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
      <WhatsAppFloatingButton />
    </div>
  );
}
