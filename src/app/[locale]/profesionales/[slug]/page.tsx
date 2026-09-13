import { getProfessionalBySlug } from "@/lib/queries/professionals";
import ProfileClient from "./profile-client";
import { DatosEstructurados } from "@/components/seo/datos-estructurados";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

// La ficha se arma en el SERVIDOR y el navegador la recibe pintada.
//
// Antes esta ruta era un componente de cliente que pedía el perfil al montar:
// hasta que respondía solo había un esqueleto (primer pintado a los 2,6 s en un
// teléfono, medido en producción) y el HTML que recibía Google no traía ni el
// nombre ni los servicios, solo los metadatos de la cabecera. El dato ya estaba
// aquí: la cabecera lo consulta para los metadatos con una consulta cacheada
// cinco minutos, así que traerlo de nuevo no cuesta una lectura más.
//
// El componente de cliente sigue siendo el mismo y revalida en silencio al
// montar; lo único que cambia es que arranca con la ficha puesta.
export const revalidate = 300;

export default async function ProfilePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const ficha = await getProfessionalBySlug(slug);
  return (
    <>
      {ficha && <DatosEstructurados datos={fichaComoNegocioLocal(ficha, locale)} />}
      <ProfileClient fichaInicial={ficha} />
    </>
  );
}

// La ficha, descrita como un negocio local de servicios: nombre, oficio, zona,
// foto, teléfono si es público y la calificación. Es lo que permite que un
// resultado salga con estrellas.
function fichaComoNegocioLocal(pro: Awaited<ReturnType<typeof getProfessionalBySlug>>, locale: string) {
  if (!pro) return null;
  const nombre = pro.businessName?.trim() || proDisplayName(pro.fullName);
  const oficios = (pro.professions?.length ? pro.professions : pro.categoryId ? [pro.categoryId] : [])
    .map((id) => getCategoryLabel(id, locale))
    .filter(Boolean);
  const zona = [pro.cantonName, pro.provinceName].filter(Boolean).join(", ");
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com"}/${locale}/profesionales/${pro.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: nombre,
    url,
    ...(pro.avatarUrl ? { image: pro.avatarUrl } : {}),
    ...(pro.bio?.trim() ? { description: pro.bio.trim().slice(0, 400) } : {}),
    ...(oficios.length ? { knowsAbout: oficios } : {}),
    address: {
      "@type": "PostalAddress",
      addressCountry: "CR",
      ...(pro.provinceName ? { addressRegion: pro.provinceName } : {}),
      ...(pro.cantonName ? { addressLocality: pro.cantonName } : {}),
    },
    ...(zona ? { areaServed: zona } : {}),
    // Solo se declara la calificación cuando hay reseñas de verdad: un
    // agregado inventado es motivo de penalización.
    ...(pro.reviewCount && pro.reviewCount > 0 && pro.ratingAvg
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: Number(pro.ratingAvg.toFixed(1)),
            reviewCount: pro.reviewCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };
}
