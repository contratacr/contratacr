import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { ProsSection } from "@/components/landing/pros-section";
import { WhyContratacr } from "@/components/landing/why-contratacr";
import { FindByZone } from "@/components/landing/find-by-zone";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { getZoneCoverage } from "@/lib/queries/professionals";
import { FeaturedBrands } from "@/components/landing/featured-brands";
import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ accountDeletion?: string }>;
}) {
  // Real zone coverage, without fabricated canton counts, for the find-by-zone band.
  const [coverage, query, t] = await Promise.all([
    getZoneCoverage(),
    searchParams,
    getTranslations("home.accountDeletion"),
  ]);
  const deletionStatus = query.accountDeletion === "completed"
    ? "completed"
    : query.accountDeletion === "pending"
      ? "pending"
      : null;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      <main className="flex-1">
        {deletionStatus && (
          <div className="mx-auto mt-5 flex w-[calc(100%-2rem)] max-w-4xl items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-800 shadow-sm" role="status">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="text-sm font-bold">{t(`${deletionStatus}Title`)}</p>
              <p className="mt-0.5 text-sm">{t(`${deletionStatus}Body`)}</p>
            </div>
          </div>
        )}
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

        {/* A continuous showcase of businesses present on ContrataCR. */}
        <FeaturedBrands />

        <LandingFooter />
      </main>
    </div>
  );
}
