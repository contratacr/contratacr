import { Suspense } from "react";
import { AppDownloadSection } from "@/components/landing/app-download";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { DirectoryQuickNav } from "@/components/landing/directory-nav";
import { prefijoDeIdioma, rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { LandingHero } from "@/components/landing/landing-hero";
import { HomeFeed } from "@/components/landing/home-feed";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import { FeaturedBrands } from "@/components/landing/featured-brands";
import { HomeTopRated } from "@/components/landing/home-top-rated";
import { HomeCategories } from "@/components/landing/home-categories";
import { HomeHeroSlides, type HeroSlide } from "@/components/landing/home-hero-slides";
import { getSupplyCounts } from "@/lib/queries/supply";
import { categoryGroupId, categoryImageUrl } from "@/lib/data/category-images";
import { getCategoryLabel } from "@/lib/data/categories";
import { ProsSection } from "@/components/landing/pros-section";
import { WhyContratacr } from "@/components/landing/why-contratacr";
import { FindByZone } from "@/components/landing/find-by-zone";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { getZoneCoverage } from "@/lib/queries/professionals";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PROVINCES } from "@/lib/data/cr-geography";
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
      canonical: rutaConIdioma(locale, "/"),
      languages: { es: "/", en: "/en", "x-default": "/" },
    },
  };
}

const DATOS_ESTRUCTURADOS = (locale: string) => JSON.stringify([
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ContrataCR",
    // LAS VARIANTES CON LAS QUE LA GENTE NOS BUSCA. Google corregía
    // «contratacr» a «contratar» —«estos son los resultados de contratar»—
    // porque no reconocía la marca y la trataba como un error de dedo.
    // `alternateName` es una de las señales con las que aprende que el nombre
    // existe; la otra son los enlaces de fuera, que no dependen del código.
    alternateName: ["Contrata CR", "contratacr.com", "Contrata Costa Rica"],
    url: "https://contratacr.com",
    logo: "https://contratacr.com/logo-mark.png",
    areaServed: { "@type": "Country", name: "Costa Rica" },
    // La ficha de Google Business va aquí: es lo que ata el sitio con el
    // negocio que Google ya tiene registrado.
    sameAs: [
      "https://www.instagram.com/contratacr",
      "https://www.facebook.com/contratacr",
      "https://www.tiktok.com/@contratacr",
      "https://g.page/r/CeZkdYZpL2enECE",
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ContrataCR",
    alternateName: ["Contrata CR", "contratacr.com"],
    url: `https://contratacr.com${prefijoDeIdioma(locale) || "/"}`,
    inLanguage: locale,
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `https://contratacr.com${prefijoDeIdioma(locale)}/buscar?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  },
]);

/** Phone hero slides (owner 2026-11-26): the services with the most professionals (with a photo), Restaurantes second. */
async function HomeHeroSlidesServer({ locale }: { locale: string }) {
  const t = await getTranslations("landing.heroSlides");
  // One short line per category (never the button's own words), so no two slides repeat the same text.
  const used = new Set<string>();
  const spare = ["default", "default2", "default3"];
  const heroLine = (id: string) => {
    const group = categoryGroupId(id);
    const key = t.has(`groups.${group}`) && !used.has(group) ? `groups.${group}` : (spare.shift() ?? "default");
    used.add(group);
    return t(key);
  };
  const supply = await getSupplyCounts().catch(() => ({ byCategory: {} as Record<string, number>, total: 0 }));
  const services = Object.entries(supply.byCategory ?? {})
    .filter(([id, n]) => n > 0 && categoryImageUrl(id))
    .sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([id]): HeroSlide => {
      const label = getCategoryLabel(id, locale);
      return { key: id, image: categoryImageUrl(id)!.replace("w=1100", "w=900"), title: heroLine(id), button: label, href: `/buscar?categoria=${id}` };
    });
  const fallback: HeroSlide[] = ["electricidad", "plomeria", "carpinteria"].map((id) => ({ key: id, image: categoryImageUrl(id)!.replace("w=1100", "w=900"), title: heroLine(id), button: getCategoryLabel(id, locale), href: `/buscar?categoria=${id}` }));
  const list = services.length ? services : fallback;
  const restaurants: HeroSlide = { key: "restaurantes", image: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=900&auto=format&fit=crop&q=70", title: t("restaurants"), button: t("restaurantsButton"), href: "/restaurantes" };
  return <HomeHeroSlides slides={[list[0]!, restaurants, ...list.slice(1)]} />;
}

async function HomeZoneCoverage() {
  // Directory on (owner 2026-11-26): the zones block also says how many companies each province has.
  const directoryOn = sitemapSections().length > 0;
  const [coverage, companies] = await Promise.all([getZoneCoverage(), directoryOn ? companiesByProvince() : Promise.resolve(null)]);
  return <FindByZone coverage={coverage} companies={companies} />;
}

const companiesByProvince = unstable_cache(async (): Promise<Record<string, number> | null> => {
  try {
    const db = createAdminClient();
    const entries = await Promise.all(PROVINCES.map(async (p) => {
      const { count, error } = await db.from("dir_places").select("id", { count: "exact", head: true }).eq("status", "published").eq("admin_area_1", p.name);
      return [p.id, error ? 0 : count ?? 0] as const;
    }));
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}, ["home-companies-by-province-v1"], { revalidate: 600 });

export default async function HomePage({
  searchParams,
  params,
}: {
  searchParams: Promise<{ accountDeletion?: string }>;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Directory flag (DIR_ENABLED): with it off the home is exactly the production one.
  const directoryOn = sitemapSections().length > 0;
  // Real zone coverage, without fabricated canton counts, for the find-by-zone band.
  const [query, t] = await Promise.all([
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
      {/* Directory on (owner 2026-11-26): the navbar always carries the search on phones (not only after scrolling). */}
      <LandingNavbar forceCompactSearch={directoryOn} mobileSearch={directoryOn} />
      <DirectoryQuickNav spacer />

      <main className="ccr-portada flex-1">
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
        {/* Directory on, phones: the header already has the search, so the page opens on recommendations (Yelp style). */}
        {/* Owner 2026-11-26: the web (computer and phone browser) keeps the production landing, which explains and sells; the
            installed app opens on the professional and company cards (people who installed it want results). */}
        {directoryOn && <div className="hidden [.ccr-native-app_&]:block lg:[.ccr-native-app_&]:hidden"><Suspense fallback={null}><HomeFeed /></Suspense></div>}
                <div className={directoryOn ? "[.ccr-native-app_&]:max-lg:hidden" : undefined}>
        {/* Directory on, phones: the Yelp-like slides; computers keep the production hero. */}
        {directoryOn && <div className="lg:hidden"><Suspense fallback={<div className="h-[500px] bg-[#162543]" />}><HomeHeroSlidesServer locale={locale} /></Suspense></div>}
        <div className={directoryOn ? "hidden lg:block" : undefined}><LandingHero /></div>

        {/* Negocios reales justo bajo el hero, antes de los servicios: la
            prueba de que ContrataCR ya tiene negocios de verdad. */}
        {/* Directory on: the best-rated professionals and companies instead of the brands strip (owner 2026-11-26). */}
        {/* Directory on (owner 2026-11-26): the best-rated professionals and companies right under the photos (instead of the
            brands strip), then Categorías (like the Categorías page). Directory off: production order. */}
        {directoryOn ? (
          <>
            <Suspense fallback={null}><HomeTopRated /></Suspense>
            <Suspense fallback={null}><HomeCategories /></Suspense>
          </>
        ) : (
          <>
            <FeaturedBrands />
            {/* Services carousel. */}
            <FadeInUp>
              <Suspense fallback={null}><ProsSection /></Suspense>
            </FadeInUp>
          </>
        )}


        {/* How it works + trust, merged into one sticky-phone story. */}
        <FadeInUp>
          <WhyContratacr />
        </FadeInUp>

        {/* Zones: find professionals by province using real coverage. */}
        <div className="ccr-fin-de-portada">
          <Suspense fallback={null}><HomeZoneCoverage /></Suspense>
        </div>
        {/* Lo que ya cabe en la primera pantalla se marca visible antes del
            primer cuadro: el aparecer solo es para lo que llega al desplazar. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{document.querySelectorAll(".fade-in-up").forEach(function(e){if(e.getBoundingClientRect().top<innerHeight)e.classList.add("visible")})}catch(e){}`,
          }}
        />
        </div>

      </main>

      <div className={directoryOn ? "[.ccr-native-app_&]:max-lg:hidden" : undefined}>
        <AppDownloadSection />
        <LandingFooter />
      </div>
    </div>
  );
}
