import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProsSection } from "@/components/landing/pros-section";
import { HowItWorks } from "@/components/landing/how-it-works";
import { TrustBenefits } from "@/components/landing/trust-benefits";
import { FindByZone } from "@/components/landing/find-by-zone";
import { GrowBusinessCta } from "@/components/landing/grow-business-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { BackToTop } from "@/components/landing/back-to-top";
import { getZoneCoverage } from "@/lib/queries/professionals";

export default async function HomePage() {
  // Real zone coverage (no fabricated cantón counts) for the find-by-zone band.
  const coverage = await getZoneCoverage();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — rotating headline + primary search */}
      <LandingHero />

      {/* "Profesionales para cada proyecto" — two-row category carousel */}
      <FadeInUp>
        <ProsSection />
      </FadeInUp>

      {/* How it works — connected 3-step journey (own staggered reveals) */}
      <HowItWorks />

      {/* Client trust benefits — prominent pillars (own staggered reveals) */}
      <TrustBenefits />

      {/* Zones — find professionals by province (real coverage) */}
      <FadeInUp delay={40}>
        <FindByZone coverage={coverage} />
      </FadeInUp>

      {/* Professional recruitment CTA */}
      <FadeInUp delay={40}>
        <GrowBusinessCta />
      </FadeInUp>

      <BackToTop />
      <LandingFooter />
    </div>
  );
}
