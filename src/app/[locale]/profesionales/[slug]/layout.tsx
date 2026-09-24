import type { Metadata } from "next";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

type ProfileLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

// Los datos que arman los metadatos del perfil vienen de una consulta ya
// cacheada; forzar dinámico aquí obligaba a repetir el render en cada visita.
export const revalidate = 300;

function cleanDescription(text?: string | null) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length >= 24 ? clean.slice(0, 155) : "";
}

export async function generateMetadata({ params }: ProfileLayoutProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const isEn = locale === "en";
  const pro = await getProfessionalBySlug(slug);

  if (!pro) {
    const title = isEn ? "Professional profile | ContrataCR" : "Perfil profesional | ContrataCR";
    const description = isEn
      ? "Find and hire service professionals in Costa Rica."
      : "Encuentra y contrata profesionales de servicios en Costa Rica.";
    // NO se llama a `notFound()` a propósito. Esta consulta devuelve lo mismo
    // —nada— cuando la ficha no existe y cuando la base no contestó, y la
    // página se guarda cinco minutos: un fallo pasajero dejaría a un
    // profesional de verdad respondiendo 404 durante cinco minutos, y eso a
    // Google le cuesta mucho más que un falso 404 (el 19-sep un nodo se cayó
    // así). Lo que sí se puede decir sin riesgo es que esto no se indexa.
    return { title, description, robots: { index: false, follow: true } };
  }

  const displayName = pro.businessName?.trim() || proDisplayName(pro.fullName);
  const serviceIds = pro.professions?.length ? pro.professions : pro.categoryId ? [pro.categoryId] : [];
  const services = serviceIds.slice(0, 3).map((id) => getCategoryLabel(id, locale)).filter(Boolean);
  const serviceText = services.join(" · ");
  const location = [pro.cantonName, pro.provinceName].filter(Boolean).join(", ");
  const title = serviceText ? `${displayName} | ${serviceText}` : `${displayName} | ContrataCR`;
  const fallbackDescription = isEn
    ? `View ${displayName}'s professional profile on ContrataCR${location ? ` in ${location}` : ""}.`
    : `Conoce el perfil profesional de ${displayName} en ContrataCR${location ? ` en ${location}` : ""}.`;
  const description = cleanDescription(pro.bio) || fallbackDescription;
  const path = `/${locale}/profesionales/${slug}`;
  const absoluteUrl = `${APP_URL}${path}`;
  const imageUrl = `${APP_URL}${path}/opengraph-image`;

  return {
    title,
    description,
    // La misma pantalla en los dos idiomas: sin `hreflang`, Google trata /es y
    // /en como dos páginas que compiten entre sí.
    alternates: alternativasDeIdioma(locale, `/profesionales/${slug}`),
    openGraph: {
      type: "profile",
      siteName: "ContrataCR",
      title,
      description,
      url: absoluteUrl,
      locale: isEn ? "en_US" : "es_CR",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return children;
}
