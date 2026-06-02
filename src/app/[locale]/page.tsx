import { LandingNavbar }      from "@/components/landing/landing-navbar";
import { LandingHero }        from "@/components/landing/landing-hero";
import { ProsSection }        from "@/components/landing/pros-section";
import { PhoneMockupSection } from "@/components/landing/phone-mockup";
import { ExploreTabs }        from "@/components/landing/explore-tabs";
import { MarqueeStrip }       from "@/components/landing/marquee-strip";
import { ResourcesSection }   from "@/components/landing/resources-section";
import { TrustedProvinces }   from "@/components/landing/trusted-provinces";
import { AppSection }         from "@/components/landing/app-section";
import { LandingFooter }      from "@/components/landing/landing-footer";
import { FadeInUp }           from "@/components/landing/fade-in-up";
import { BackToTop }          from "@/components/landing/back-to-top";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — arch image, rotating headline */}
      <LandingHero />

      {/* "Profesionales para cada proyecto en Tu Zona" — icon tabs + photo cards */}
      <FadeInUp>
        <ProsSection />
      </FadeInUp>

      {/* "Por qué los clientes eligen ContrataCR" — accordion + phone mockup */}
      <FadeInUp delay={80}>
        <PhoneMockupSection />
      </FadeInUp>

      {/* "Explorá más proyectos" — underline tabs + editorial large card */}
      <FadeInUp delay={60}>
        <ExploreTabs />
      </FadeInUp>

      {/* Partner / media logo marquee */}
      <MarqueeStrip />

      {/* "Recursos para tu hogar" — 3 photo cards */}
      <FadeInUp delay={40}>
        <ResourcesSection />
      </FadeInUp>

      {/* "Profesionales en toda Costa Rica" — province pills */}
      <FadeInUp delay={40}>
        <TrustedProvinces />
      </FadeInUp>

      {/* "La app que necesitás para todo" — dark bg + phone on right */}
      <FadeInUp delay={40}>
        <AppSection />
      </FadeInUp>

      <BackToTop />
      <LandingFooter />
    </div>
  );
}
