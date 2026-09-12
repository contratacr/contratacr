import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingHero } from "@/components/landing/landing-hero";
import { FeaturedBrands } from "@/components/landing/featured-brands";
import { ProsSection } from "@/components/landing/pros-section";
import { WhyContratacr } from "@/components/landing/why-contratacr";
import { FindByZone } from "@/components/landing/find-by-zone";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { getZoneCoverage } from "@/lib/queries/professionals";
import { CheckCircle2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

// Señales para buscadores que faltaban en la portada: la dirección canónica,
// las versiones por idioma (hreflang) y los datos estructurados de la
// organización y del buscador del sitio. Sin ellas Google no sabía que /es y
// /en son la misma página en dos idiomas, y no tenía cómo mostrar el cuadro
// de búsqueda del sitio ni la ficha de la empresa.
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    alternates: {
      canonical: `/${locale}`,
      languages: { es: "/es", en: "/en", "x-default": "/es" },
    },
  };
}

const DATOS_ESTRUCTURADOS = (locale: string) => JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ContrataCR",
    url: "https://contratacr.com",
    logo: "https://contratacr.com/logo-mark.png",
    areaServed: { "@type": "Country", name: "Costa Rica" },
    sameAs: ["https://www.instagram.com/contratacr", "https://www.facebook.com/contratacr", "https://www.tiktok.com/@contratacr"],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ContrataCR",
    url: `https://contratacr.com/${locale}`,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `https://contratacr.com/${locale}/buscar?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
]);

export default async function HomePage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ accountDeletion?: string }>;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: DATOS_ESTRUCTURADOS(locale) }} />
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

      </main>

      <LandingFooter />
    </div>
  );
}
