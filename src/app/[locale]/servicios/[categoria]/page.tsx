import type { Metadata } from "next";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceLanding } from "@/components/landing-servicios/service-landing";
import { DatosEstructurados } from "@/components/seo/datos-estructurados";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const OG_LOCALE: Record<string, string> = { en: "en_US", es: "es_CR" };

type Props = { params: Promise<{ locale: string; categoria: string }> };

export const revalidate = 3600;

export function isKnownCategory(id: string) {
  return getAllCategories().some((c) => c.id === id);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, categoria } = await params;
  if (!isKnownCategory(categoria)) return {};
  const t = await getTranslations("serviceLanding");
  const supply = await getSupplyCounts();
  const category = getCategoryLabel(categoria, locale);
  const count = supply.byCategory[supplyKey(categoria)] ?? 0;
  const path = `/${locale}/servicios/${categoria}`;
  const title = t("metaTitleCountry", { category });
  const description = t("metaDesc", { count, category, place: "Costa Rica" });
  return {
    title,
    description,
    // La misma pantalla en los dos idiomas: sin `hreflang`, Google trata /es y
    // /en como dos páginas que compiten entre sí.
    alternates: alternativasDeIdioma(locale, `/servicios/${categoria}`),
    robots: count >= MIN_SUPPLY_FOR_LANDING ? undefined : { index: false },
    openGraph: { title, description, url: `${APP_URL}${path}`, siteName: "ContrataCR", locale: OG_LOCALE[locale] ?? "es_CR", type: "website" },
  };
}

export default async function CategoryLandingPage({ params }: Props) {
  const { locale, categoria } = await params;
  if (!isKnownCategory(categoria)) notFound();
  return (
    <>
      {/* Un servicio con su lista de profesionales y la ruta de migas: es lo
          que permite que el resultado salga con «Inicio › Servicios › Oficio»
          en vez de una dirección suelta. */}
      <DatosEstructurados datos={oficioComoServicio(locale, categoria)} />
      <ServiceLanding locale={locale} categoryId={categoria} />
    </>
  );
}

function oficioComoServicio(locale: string, categoria: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
  const nombre = getCategoryLabel(categoria, locale);
  const esEn = locale === "en";
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: nombre,
      serviceType: nombre,
      url: `${base}/${locale}/servicios/${categoria}`,
      areaServed: { "@type": "Country", name: "Costa Rica" },
      provider: { "@type": "Organization", name: "ContrataCR", url: `${base}/${locale}` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: esEn ? "Home" : "Inicio", item: `${base}/${locale}` },
        { "@type": "ListItem", position: 2, name: esEn ? "Services" : "Servicios", item: `${base}/${locale}/servicios` },
        { "@type": "ListItem", position: 3, name: nombre, item: `${base}/${locale}/servicios/${categoria}` },
      ],
    },
  ];
}
