import { ServerContactAvailability } from "@/components/professionals/server-contact-availability";
import { getProfessionalBySlug, fichaEnCache, searchProfessionals } from "@/lib/queries/professionals";
import { sitemapSections } from "@/lib/directory/sitemap-sections";
import type { SimilarPro } from "@/components/professionals/profile-similar";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { publicacionesDelProfesional } from "@/lib/queries/publicaciones-del-profesional";
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
  // Las promociones y los empleos también vienen pintados: si no, la fila de
  // pestañas nace con cinco y salta a siete al llegar el navegador. Se piden A
  // LA VEZ que las comprobaciones en vivo de la ficha (el id sale de la caché):
  // en serie eran tres viajes a la base y casi un segundo de esqueleto.
  const base = await fichaEnCache(slug);
  const [ficha, publicaciones] = await Promise.all([
    getProfessionalBySlug(slug),
    base ? publicacionesDelProfesional(base.id) : Promise.resolve({ ofertas: [], empleos: [] }),
  ]);
  // «Profesionales similares» (rediseño 26-nov-2026) solo con el directorio encendido; en producción no se consulta.
  const similares = ficha && sitemapSections().length > 0 ? await profesionalesSimilares(ficha, locale) : undefined;
  return (
    <>
      {ficha && <DatosEstructurados datos={fichaComoNegocioLocal(ficha, locale)} />}
      {ficha ? <ServerContactAvailability professionalId={ficha.id}><ProfileClient fichaInicial={ficha} ofertasIniciales={publicaciones.ofertas} empleosIniciales={publicaciones.empleos} {...(similares ? { similaresIniciales: similares } : {})} /></ServerContactAvailability> : <ProfileClient fichaInicial={ficha} />}
    </>
  );
}

// Mismo oficio, mejor calificados primero (la búsqueda pública), sin la ficha propia; seis como máximo.
async function profesionalesSimilares(pro: NonNullable<Awaited<ReturnType<typeof getProfessionalBySlug>>>, locale: string): Promise<SimilarPro[]> {
  const oficio = pro.categoryId || pro.professions?.[0];
  if (!oficio) return [];
  try {
    // Primero el oficio principal; si no alcanza, cualquiera de sus oficios.
    let lista = await searchProfessionals({ categoryId: oficio, sortBy: "rating" });
    if (lista.filter((p) => p.slug !== pro.slug).length < 3 && (pro.professions?.length ?? 0) > 1) {
      lista = await searchProfessionals({ categoryIds: pro.professions, sortBy: "rating" });
    }
    return lista.filter((p) => p.slug !== pro.slug).slice(0, 6).map((p) => ({
      slug: p.slug,
      name: p.businessName?.trim() || proDisplayName(p.fullName),
      avatarUrl: p.avatarUrl ?? null,
      trade: getCategoryLabel(p.categoryId, locale),
      area: [p.cantonName, p.provinceName].filter(Boolean).join(", "),
      ratingAvg: p.ratingAvg,
      reviewCount: p.reviewCount,
      verified: p.verificationStatus === "verified",
    }));
  } catch {
    return [];
  }
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
  const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com"}${prefijoDeIdioma(locale)}/profesionales/${pro.slug}`;
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
