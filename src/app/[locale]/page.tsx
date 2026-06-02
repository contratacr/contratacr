import { LandingNavbar }       from "@/components/landing/landing-navbar";
import { LandingHero }         from "@/components/landing/landing-hero";
import { ProsSection }         from "@/components/landing/pros-section";
import { PhoneMockupSection }  from "@/components/landing/phone-mockup";
import { ExploreTabs }         from "@/components/landing/explore-tabs";
import { ProCTASection }       from "@/components/landing/pro-cta";
import { MarqueeStrip }        from "@/components/landing/marquee-strip";
import { ResourcesSection }    from "@/components/landing/resources-section";
import { TrustedProvinces }    from "@/components/landing/trusted-provinces";
import { AppSection }          from "@/components/landing/app-section";
import { LandingFooter }       from "@/components/landing/landing-footer";
import { FadeInUp }            from "@/components/landing/fade-in-up";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — Thumbtack arch style */}
      <LandingHero />

      {/* "Pros para cada proyecto en Tu Zona" — icon tabs + photo cards */}
      <FadeInUp>
        <ProsSection />
      </FadeInUp>

      {/* "Por qué los clientes aman ContrataCR" — accordion + phone */}
      <FadeInUp delay={80}>
        <PhoneMockupSection />
      </FadeInUp>

      {/* "Explorá más proyectos" — underline tabs + photo grid */}
      <FadeInUp delay={60}>
        <ExploreTabs />
      </FadeInUp>

      {/* Pro CTA split section */}
      <FadeInUp delay={60}>
        <ProCTASection />
      </FadeInUp>

      {/* Partner / media logo marquee */}
      <MarqueeStrip />

      {/* "Recursos para tu hogar" — 3 image cards */}
      <FadeInUp delay={40}>
        <ResourcesSection />
      </FadeInUp>

      {/* "Profesionales en toda Costa Rica" — province pills */}
      <FadeInUp delay={40}>
        <TrustedProvinces />
      </FadeInUp>

      {/* "La app que necesitás" — dark bg + visible phone */}
      <FadeInUp delay={40}>
        <AppSection />
      </FadeInUp>

      <LandingFooter />
    </div>
  );
}
