import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProsSection } from "@/components/landing/pros-section";
import { TrustBenefits } from "@/components/landing/trust-benefits";
import { TrustedProvinces } from "@/components/landing/trusted-provinces";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { BackToTop } from "@/components/landing/back-to-top";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — rotating headline + primary search */}
      <LandingHero />

      {/* "Profesionales para cada proyecto en tu zona" — icon tabs + cards */}
      <FadeInUp>
        <ProsSection />
      </FadeInUp>

      {/* Client trust benefits */}
      <FadeInUp delay={40}>
        <TrustBenefits />
      </FadeInUp>

      {/* Zones — find professionals by province */}
      <FadeInUp delay={40}>
        <TrustedProvinces />
      </FadeInUp>

      <BackToTop />
      <LandingFooter />
    </div>
  );
}
