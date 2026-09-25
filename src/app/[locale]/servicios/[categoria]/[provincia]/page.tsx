import { imagenSocial } from "@/lib/seo/imagen-social";
import type { Metadata } from "next";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceLanding } from "@/components/landing-servicios/service-landing";
import { DatosEstructurados } from "@/components/seo/datos-estructurados";
import { categorySlug, getCategoryIdBySlug, getCategoryLabel } from "@/lib/data/categories";
import { getProvinceBySlugOrId, type Province } from "@/lib/data/cr-geography";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const OG_LOCALE: Record<string, string> = { en: "en_US", es: "es_CR" };

type Props = { params: Promise<{ locale: string; categoria: string; provincia: string }> };

export const revalidate = 3600;

// La dirección trae el servicio con guiones y la provincia por su nombre; las
// dos llaves de la base (guion bajo, código de dos letras) se siguen aceptando
// porque las direcciones viejas llegan de Google y de enlaces ya compartidos.
function conocido(categoria: string, provincia: string) {
  const id = getCategoryIdBySlug(categoria);
  const province = getProvinceBySlugOrId(provincia);
  return id && province ? { id, province } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, categoria, provincia } = await params;
  const encontrado = conocido(categoria, provincia);
  if (!encontrado) return {};
  const { id, province } = encontrado;
  const t = await getTranslations("serviceLanding");
  const supply = await getSupplyCounts();
  const category = getCategoryLabel(id, locale);
  const place = province.name;
  const direccion = categorySlug(id);
  // El conteo se busca por el ID de dos letras, que es como está guardado en
  // la base; la DIRECCIÓN usa el nombre legible.
  const count = supply.byCategoryProvince[supplyKey(id, province.id)] ?? 0;
  const path = `/${locale}/servicios/${direccion}/${province.slug}`;
  const title = t("metaTitle", { category, place });
  const description = t("metaDesc", { count, category, place });
  return {
    title,
    description,
    // La misma pantalla en los dos idiomas: sin `hreflang`, Google trata /es y
    // /en como dos páginas que compiten entre sí.
    alternates: alternativasDeIdioma(locale, `/servicios/${direccion}/${province.slug}`),
    robots: count >= MIN_SUPPLY_FOR_LANDING ? undefined : { index: false },
    openGraph: { title, description, url: `${APP_URL}${path}`, siteName: "ContrataCR", locale: OG_LOCALE[locale] ?? "es_CR", type: "website", ...imagenSocial(locale).openGraph },
  };
}

export default async function CategoryProvinceLandingPage({ params }: Props) {
  const { locale, categoria, provincia } = await params;
  const encontrado = conocido(categoria, provincia);
  if (!encontrado) notFound();
  const { id, province } = encontrado;
  // El 308 del código viejo (`/sj` → `/san-jose`) vive en el MIDDLEWARE, no
  // aquí: esta página se genera estáticamente (`revalidate`), así que un
  // redirect en el componente no llega a ejecutarse, y además en producción el
  // middleware corre primero y se traga lo que devuelva la página.
  return (
    <>
      {/* Estas son las páginas de más intención del sitio —quien busca
          «electricista en Alajuela» ya quiere contratar— y eran las únicas
          landings sin datos estructurados: el nivel oficio sí los tenía. Sin
          ellos Google no sabe que la página cubre una provincia concreta ni
          puede pintar las migas de pan, así que el resultado sale como una
          dirección suelta frente a competidores que sí las traen. */}
      <DatosEstructurados datos={oficioEnProvincia(locale, id, province)} />
      <ServiceLanding locale={locale} categoryId={id} provinceId={province.id} />
    </>
  );
}

function oficioEnProvincia(locale: string, categoria: string, province: Province) {
  const base = APP_URL;
  const nombre = getCategoryLabel(categoria, locale);
  const direccion = categorySlug(categoria);
  const esEn = locale === "en";
  const url = `${base}/${locale}/servicios/${direccion}/${province.slug}`;
  return [
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: esEn ? `${nombre} in ${province.name}` : `${nombre} en ${province.name}`,
      serviceType: nombre,
      url,
      // `State` es el tipo que schema.org usa para una división de primer
      // nivel de un país; la provincia de Costa Rica es exactamente eso.
      areaServed: {
        "@type": "State",
        name: province.name,
        containedInPlace: { "@type": "Country", name: "Costa Rica" },
      },
      provider: { "@type": "Organization", name: "ContrataCR", url: `${base}/${locale}` },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: esEn ? "Home" : "Inicio", item: `${base}/${locale}` },
        { "@type": "ListItem", position: 2, name: esEn ? "Services" : "Servicios", item: `${base}/${locale}/servicios` },
        { "@type": "ListItem", position: 3, name: nombre, item: `${base}/${locale}/servicios/${direccion}` },
        { "@type": "ListItem", position: 4, name: province.name, item: url },
      ],
    },
  ];
}
