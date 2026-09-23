import { imagenSocial } from "@/lib/seo/imagen-social";
import type { Metadata } from "next";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceLanding } from "@/components/landing-servicios/service-landing";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { getProvinceBySlugOrId } from "@/lib/data/cr-geography";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const OG_LOCALE: Record<string, string> = { en: "en_US", es: "es_CR" };

type Props = { params: Promise<{ locale: string; categoria: string; provincia: string }> };

export const revalidate = 3600;

function known(categoria: string, provincia: string) {
  return getAllCategories().some((c) => c.id === categoria) && !!getProvinceBySlugOrId(provincia);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, categoria, provincia } = await params;
  if (!known(categoria, provincia)) return {};
  const t = await getTranslations("serviceLanding");
  const supply = await getSupplyCounts();
  const category = getCategoryLabel(categoria, locale);
  const province = getProvinceBySlugOrId(provincia)!;
  const place = province.name;
  // El conteo se busca por el ID de dos letras, que es como está guardado en
  // la base; la DIRECCIÓN usa el nombre legible.
  const count = supply.byCategoryProvince[supplyKey(categoria, province.id)] ?? 0;
  const path = `/${locale}/servicios/${categoria}/${province.slug}`;
  const title = t("metaTitle", { category, place });
  const description = t("metaDesc", { count, category, place });
  return {
    title,
    description,
    // La misma pantalla en los dos idiomas: sin `hreflang`, Google trata /es y
    // /en como dos páginas que compiten entre sí.
    alternates: alternativasDeIdioma(locale, `/servicios/${categoria}/${province.slug}`),
    robots: count >= MIN_SUPPLY_FOR_LANDING ? undefined : { index: false },
    openGraph: { title, description, url: `${APP_URL}${path}`, siteName: "ContrataCR", locale: OG_LOCALE[locale] ?? "es_CR", type: "website", ...imagenSocial(locale).openGraph },
  };
}

export default async function CategoryProvinceLandingPage({ params }: Props) {
  const { locale, categoria, provincia } = await params;
  if (!known(categoria, provincia)) notFound();
  const province = getProvinceBySlugOrId(provincia)!;
  // El 308 del código viejo (`/sj` → `/san-jose`) vive en el MIDDLEWARE, no
  // aquí: esta página se genera estáticamente (`revalidate`), así que un
  // redirect en el componente no llega a ejecutarse, y además en producción el
  // middleware corre primero y se traga lo que devuelva la página.
  return <ServiceLanding locale={locale} categoryId={categoria} provinceId={province.id} />;
}
