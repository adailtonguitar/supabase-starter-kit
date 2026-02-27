import { UpdateNoticeModal } from "@/components/UpdateNoticeModal";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingFeatures } from "@/components/landing/LandingFeatures";
import { LandingAnalytics } from "@/components/landing/LandingAnalytics";
import { LandingAdvantages } from "@/components/landing/LandingAdvantages";
import { LandingHowItWorks } from "@/components/landing/LandingHowItWorks";
import { LandingAI } from "@/components/landing/LandingAI";
import { LandingLoyalty } from "@/components/landing/LandingLoyalty";
import { LandingMultiStore } from "@/components/landing/LandingMultiStore";
import { LandingCalculator } from "@/components/landing/LandingCalculator";
import { LandingComparison } from "@/components/landing/LandingComparison";
import { LandingTestimonials } from "@/components/landing/LandingTestimonials";
import { LandingPricing } from "@/components/landing/LandingPricing";
import { LandingFAQ } from "@/components/landing/LandingFAQ";
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
      <LandingHowItWorks />
      <LandingLoyalty />
      <LandingAnalytics />
      <LandingAI />
      <LandingMultiStore />
      <LandingCalculator />
      <LandingAdvantages />
      <LandingComparison />
      <LandingTestimonials />
      <LandingPricing />
      <LandingFAQ />
      <LandingCTA />
      <LandingFooter />
      <WhatsAppFloatingButton />
    </div>
  );
}
