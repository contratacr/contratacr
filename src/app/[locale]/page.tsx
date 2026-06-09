import { LandingNavbar }      from "@/components/landing/landing-navbar";
import { LandingHero }        from "@/components/landing/landing-hero";
import { PopularCategories, HowItWorks, WhyContrataCR } from "@/components/landing/home-sections";
import { ProCTASection }      from "@/components/landing/pro-cta";
import { LandingFooter }      from "@/components/landing/landing-footer";
import { FadeInUp }           from "@/components/landing/fade-in-up";
import { BackToTop }          from "@/components/landing/back-to-top";

// Focused home — only the essentials, beautifully executed: hero + search,
// popular categories, how it works, why ContrataCR (trust), and the professional
// CTA. No phone mockups, no "coming soon" app section, no brand-logo strip.
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — headline + the primary search (service + location) + popular links */}
      <LandingHero />

      {/* Browse the main services, each → /buscar pre-filtered */}
      <FadeInUp><PopularCategories /></FadeInUp>

      {/* 3 simple steps */}
      <FadeInUp delay={40}><HowItWorks /></FadeInUp>

      {/* Trust: identity-verified, intermediary framing, two-way reviews */}
      <FadeInUp delay={40}><WhyContrataCR /></FadeInUp>

      {/* Professional recruitment CTA (session-aware) */}
      <FadeInUp delay={40}><ProCTASection /></FadeInUp>

      <BackToTop />
      <LandingFooter />
    </div>
  );
}
