import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { CategorySlider } from "@/components/landing/category-slider";
import { PhoneMockupSection } from "@/components/landing/phone-mockup";
import { ExploreTabs } from "@/components/landing/explore-tabs";
import { ProCTASection } from "@/components/landing/pro-cta";
import { MarqueeStrip } from "@/components/landing/marquee-strip";
import { AppSection } from "@/components/landing/app-section";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero — visible immediately, no fade delay */}
      <LandingHero />

      {/* Category photo slider */}
      <FadeInUp>
        <CategorySlider />
      </FadeInUp>

      {/* Phone mockup — how it works */}
      <FadeInUp delay={80}>
        <PhoneMockupSection />
      </FadeInUp>

      {/* Explore tabbed grid */}
      <FadeInUp delay={60}>
        <ExploreTabs />
      </FadeInUp>

      {/* Pro CTA split section */}
      <FadeInUp delay={60}>
        <ProCTASection />
      </FadeInUp>

      {/* Infinite marquee strip */}
      <MarqueeStrip />

      {/* Mobile app coming soon */}
      <FadeInUp delay={40}>
        <AppSection />
      </FadeInUp>

      {/* Footer */}
      <LandingFooter />
    </div>
  );
}
