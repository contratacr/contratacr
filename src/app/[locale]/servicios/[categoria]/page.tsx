import { imagenSocial } from "@/lib/seo/imagen-social";
import type { Metadata } from "next";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceLanding } from "@/components/landing-servicios/service-landing";
import { DatosEstructurados } from "@/components/seo/datos-estructurados";
import { categorySlug, getAllCategories, getCategoryIdBySlug, getCategoryLabel } from "@/lib/data/categories";
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
  // La dirección trae la forma con guiones; la llave del servicio sigue siendo
  // la de la base. Se aceptan las dos porque las direcciones viejas siguen
  // llegando de Google y de enlaces ya compartidos.
  const id = getCategoryIdBySlug(categoria);
  if (!id) return {};
  const t = await getTranslations("serviceLanding");
  const supply = await getSupplyCounts();
  const category = getCategoryLabel(id, locale);
  const count = supply.byCategory[supplyKey(id)] ?? 0;
  const direccion = categorySlug(id);
  const path = `/${locale}/servicios/${direccion}`;
  const title = t("metaTitleCountry", { category });
  const description = t("metaDesc", { count, category, place: "Costa Rica" });
  return {
    title,
    description,
    // La misma pantalla en los dos idiomas: sin `hreflang`, Google trata /es y
    // /en como dos páginas que compiten entre sí.
    alternates: alternativasDeIdioma(locale, `/servicios/${direccion}`),
    robots: count >= MIN_SUPPLY_FOR_LANDING ? undefined : { index: false },
    openGraph: { title, description, url: `${APP_URL}${path}`, siteName: "ContrataCR", locale: OG_LOCALE[locale] ?? "es_CR", type: "website", ...imagenSocial(locale).openGraph },
  };
}

export default async function CategoryLandingPage({ params }: Props) {
  const { locale, categoria } = await params;
  const id = getCategoryIdBySlug(categoria);
  if (!id) notFound();
  return (
    <>
      {/* Un servicio con su lista de profesionales y la ruta de migas: es lo
          que permite que el resultado salga con «Inicio › Servicios › Oficio»
          en vez de una dirección suelta. */}
      <DatosEstructurados datos={oficioComoServicio(locale, id)} />
      <ServiceLanding locale={locale} categoryId={id} />
    </>
  );
}

function oficioComoServicio(locale: string, categoria: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
  const nombre = getCategoryLabel(categoria, locale);
  const direccion = categorySlug(categoria);
  const esEn = locale === "en";
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: nombre,
      serviceType: nombre,
      url: `${base}/${locale}/servicios/${direccion}`,
      areaServed: { "@type": "Country", name: "Costa Rica" },
      provider: { "@type": "Organization", name: "ContrataCR", url: `${base}/${locale}` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: esEn ? "Home" : "Inicio", item: `${base}/${locale}` },
        { "@type": "ListItem", position: 2, name: esEn ? "Services" : "Servicios", item: `${base}/${locale}/servicios` },
        { "@type": "ListItem", position: 3, name: nombre, item: `${base}/${locale}/servicios/${direccion}` },
      ],
    },
  ];
}
