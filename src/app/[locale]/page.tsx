import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProsSection } from "@/components/landing/pros-section";
import { WhyContratacr } from "@/components/landing/why-contratacr";
import { FindByZone } from "@/components/landing/find-by-zone";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { getZoneCoverage } from "@/lib/queries/professionals";

export default async function HomePage() {
  // Real zone coverage, without fabricated canton counts, for the find-by-zone band.
  const coverage = await getZoneCoverage();

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      <main className="flex-1">
        {/* Hero: rotating headline + primary search. */}
        <LandingHero />

        {/* Services carousel. */}
        <FadeInUp>
          <ProsSection />
        </FadeInUp>

        {/* How it works + trust, merged into one sticky-phone story. */}
        <WhyContratacr />

        {/* Zones: find professionals by province using real coverage. */}
        <FadeInUp delay={40}>
          <FindByZone coverage={coverage} />
        </FadeInUp>

        <LandingFooter />
      </main>
    </div>
  );
}
