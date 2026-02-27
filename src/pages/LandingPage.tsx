import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingMobileShowcase } from "@/components/landing/LandingMobileShowcase";
import { LandingAnalytics } from "@/components/landing/LandingAnalytics";
import { LandingAdvantages } from "@/components/landing/LandingAdvantages";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingAI } from "@/components/landing/LandingAI";
import { LandingLoyalty } from "@/components/landing/LandingLoyalty";
import { LandingMultiStore } from "@/components/landing/LandingMultiStore";
import { LandingCalculator } from "@/components/landing/LandingCalculator";
import { LandingComparison } from "@/components/landing/LandingComparison";
import { LandingAuthority } from "@/components/landing/LandingAuthority";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
import { LandingCTA } from "@/components/landing/LandingCTA";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { WhatsAppFloatingButton } from "@/components/layout/WhatsAppFloatingButton";

export default function LandingPage() {
  return (
    <div className="landing-animated h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground scroll-smooth">
      <UpdateNoticeModal />
      <LandingNav />
      <LandingHero />
      <LandingFeatures />
      <LandingMobileShowcase />
      <LandingHowItWorks />
      <LandingLoyalty />
      <LandingAnalytics />
      <LandingAI />
      <LandingMultiStore />
      <LandingCalculator />
      <LandingAdvantages />
      <LandingComparison />
      <LandingAuthority />
      <LandingPricing />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter />
      <WhatsAppFloatingButton />
    </div>
  );
}
