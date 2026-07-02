import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProsSection } from "@/components/landing/pros-section";
import { WhyContratacr } from "@/components/landing/why-contratacr";
import { FindByZone } from "@/components/landing/find-by-zone";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { InstallHomeBand } from "@/components/landing/install-app-card";
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

      {/* How it works + trust, merged into one sticky-phone story */}
      <WhyContratacr />

      {/* Zones — find professionals by province (real coverage) */}
      <FadeInUp delay={40}>
        <FindByZone coverage={coverage} />
      </FadeInUp>

      <InstallHomeBand />

      <LandingFooter />
    </div>
  );
}
