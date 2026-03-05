import { lazy, Suspense } from "react";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingHero } from "@/components/landing/LandingHero";

// Lazy load all below-the-fold sections
const LandingFeatures = lazy(() => import("@/components/landing/LandingFeatures").then(m => ({ default: m.LandingFeatures })));
const LandingMobileShowcase = lazy(() => import("@/components/landing/LandingMobileShowcase").then(m => ({ default: m.LandingMobileShowcase })));
const LandingHowItWorks = lazy(() => import("@/components/landing/LandingHowItWorks").then(m => ({ default: m.LandingHowItWorks })));
const LandingLoyalty = lazy(() => import("@/components/landing/LandingLoyalty").then(m => ({ default: m.LandingLoyalty })));
const LandingAnalytics = lazy(() => import("@/components/landing/LandingAnalytics").then(m => ({ default: m.LandingAnalytics })));
const LandingAI = lazy(() => import("@/components/landing/LandingAI").then(m => ({ default: m.LandingAI })));
const LandingMultiStore = lazy(() => import("@/components/landing/LandingMultiStore").then(m => ({ default: m.LandingMultiStore })));
const LandingCalculator = lazy(() => import("@/components/landing/LandingCalculator").then(m => ({ default: m.LandingCalculator })));
const LandingAdvantages = lazy(() => import("@/components/landing/LandingAdvantages").then(m => ({ default: m.LandingAdvantages })));
const LandingComparison = lazy(() => import("@/components/landing/LandingComparison").then(m => ({ default: m.LandingComparison })));
const LandingTestimonials = lazy(() => import("@/components/landing/LandingTestimonials").then(m => ({ default: m.LandingTestimonials })));
const LandingAuthority = lazy(() => import("@/components/landing/LandingAuthority").then(m => ({ default: m.LandingAuthority })));
const LandingPricing = lazy(() => import("@/components/landing/LandingPricing").then(m => ({ default: m.LandingPricing })));
const LandingFAQ = lazy(() => import("@/components/landing/LandingFAQ").then(m => ({ default: m.LandingFAQ })));
const LandingCTA = lazy(() => import("@/components/landing/LandingCTA").then(m => ({ default: m.LandingCTA })));
const LandingFooter = lazy(() => import("@/components/landing/LandingFooter").then(m => ({ default: m.LandingFooter })));
const WhatsAppFloatingButton = lazy(() => import("@/components/layout/WhatsAppFloatingButton").then(m => ({ default: m.WhatsAppFloatingButton })));

const SectionFallback = () => <div className="h-32" />;

export default function LandingPage() {
  return (
    <div className="landing-animated h-screen overflow-y-auto overflow-x-hidden bg-background text-foreground scroll-smooth">
      <LandingNav />
      <LandingHero />
      <Suspense fallback={<SectionFallback />}>
        <LandingFeatures />
        <div className="section-divider max-w-5xl mx-auto" />
        <LandingMobileShowcase />
        <LandingHowItWorks />
        <div className="section-divider max-w-5xl mx-auto" />
        <LandingLoyalty />
        <LandingAnalytics />
        <div className="section-divider max-w-5xl mx-auto" />
        <LandingAI />
        <LandingMultiStore />
        <div className="section-divider max-w-5xl mx-auto" />
        <LandingCalculator />
        <LandingAdvantages />
        <LandingComparison />
        <div className="section-divider max-w-5xl mx-auto" />
        <LandingTestimonials />
        <LandingAuthority />
        <LandingPricing />
        <LandingFAQ />
        <LandingCTA />
        <LandingFooter />
        <WhatsAppFloatingButton />
      </Suspense>
    </div>
  );
}
