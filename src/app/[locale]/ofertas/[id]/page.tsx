import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OfferImageGallery } from "@/components/offers/offer-image-gallery";
import { OfferDetailNavbarSearch } from "@/components/offers/offer-detail-navbar-search";
import { OfferContactActions } from "@/components/offers/offers-board";
import { offerSaveSnapshot } from "@/lib/offer-snapshot";
import { AccionesAlPie } from "@/components/ui/acciones-al-pie";
import { MenuOferta } from "@/components/offers/menu-oferta";
import { claveDeTramo, enlaceOferta, rangoDePrefijo } from "@/lib/marketplace-url";
import { OfferOwnerActions } from "@/components/offers/offer-owner-actions";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import {
  formatOfferBeforePrice,
  formatOfferPrice,
  offerDiscountPercent,
  isOfferExpired,
  type ProfessionalOffer,
} from "@/lib/offers";
import { marketplaceLocale, offerTypeLabel } from "@/lib/marketplace-copy";
import { safeGetUser } from "@/lib/supabase/get-user";
import { contactFlagsFor, profesionalesBloqueados } from "@/lib/contact-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { recordServerInteraction } from "@/lib/analytics/server-events";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { crTodayISO } from "@/lib/time-cr";
import { RecordRecentVisit } from "@/components/mobile/record-recent-visit";
import { safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";
import { CABECERA_BOTON, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const COPY = {
  es: {
    back: "Volver",
    title: "Promoción",
    professionalFallback: "Profesional en ContrataCR",
    savings: "Ahorras",
    unavailable: "Esta promoción ya no está disponible.",
    validUntil: "Válida hasta",
    available: "disponibles",
    rowType: "Tipo",
    rowService: "Servicio",
    rowLocation: "Ubicación",
    rowValid: "Vigencia",
    rowAvailable: "Disponibles",
    wholeCountry: "Todo Costa Rica",
    details: "Detalles",
    before: "Antes",
    publishedBy: "Publicada por",
  },
  en: {
    back: "Back",
    title: "Promotion",
    professionalFallback: "Professional on ContrataCR",
    savings: "Save",
    unavailable: "This promotion is no longer available.",
    validUntil: "Available until",
    available: "available",
    rowType: "Type",
    rowService: "Service",
    rowLocation: "Location",
    rowValid: "Valid until",
    rowAvailable: "Available",
    wholeCountry: "All of Costa Rica",
    details: "Details",
    before: "Before",
    publishedBy: "Published by",
  },
} as const;

/**
 * Solo la promoción viva se indexa. La cerrada se marca para que salga del
 * buscador: dejarla indexada manda gente a una puerta que ya está cerrada, y
 * ahora que la página sí abre para cualquiera eso importa.
 */
export async function generateMetadata({ params }: { params: Promise<{ id: string; locale: string }> }) {
  const { id } = await params;
  const clave = claveDeTramo(id);
  if (!clave.id) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("professional_offers")
    .select("id, status, valid_until")
    .eq("id", clave.id)
    .maybeSingle();
  const viva = data && data.status === "published" && !isOfferExpired({ valid_until: (data as { valid_until?: string | null }).valid_until ?? null }, crTodayISO());
  return viva ? {} : { robots: { index: false, follow: true } };
}

export default async function OfferDetailPage({ params, searchParams }: { params: Promise<{ id: string; locale: string }>; searchParams?: Promise<{ from?: string }> }) {
  const { id, locale: rawLocale } = await params;
  const locale = marketplaceLocale(rawLocale);
  const copy = COPY[locale];
  const idioma: "en" | "es" = locale === "en" ? "en" : "es";
  const dateLocale = idioma === "en" ? "en-US" : "es-CR";
  const from = (await searchParams)?.from;
  const backHref = safeMarketplaceReturnHref(from, "/ofertas");
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  // Las columnas de contacto no se leen aquí: `contact_email` está negado por
  // columna para el invitado y tumbaría la consulta entera. Las banderas salen
  // de contactFlagsFor y el dato, de /api/contact/reveal al tocar el botón.
  const professionalColumns = user
    ? "slug,business_name,profile_id,profiles(full_name)"
    : "slug,business_name,profiles(full_name)";
  // El enlace corto trae el título y los 8 primeros del id; el largo, el id
  // entero. Los dos abren la misma oferta.
  const clave = claveDeTramo(id);
  if (!clave.id && !clave.prefijo) notFound();
  const consulta = supabase
    .from("professional_offers")
    .select(`*, professionals!professional_offers_professional_id_fkey(${professionalColumns})`);
  const { data: publicada, error: offerError } = clave.id
    ? await consulta.eq("id", clave.id).maybeSingle()
    : await (() => {
        const { desde, hasta } = rangoDePrefijo(clave.prefijo!);
        return consulta.gte("id", desde).lte("id", hasta).limit(1).maybeSingle();
      })();
  if (offerError) throw offerError;
  // UNA PROMOCIÓN CERRADA NO DESAPARECE: DICE QUE SE CERRÓ.
  // Los permisos de la base solo dejan leer las publicadas, así que a un
  // visitante cualquiera una promoción pausada, agotada o vencida le daba
  // «página no encontrada» —y el aviso «ya no está disponible», que existe
  // desde hace tiempo, no lo veía nadie salvo el dueño—. Un enlace compartido
  // por WhatsApp o guardado en Google es de alguien: romperlo no explica nada.
  // Se relee con la llave de servicio SOLO para pintar la lápida, y la página
  // sale con `noindex` (ver generateMetadata) para que Google la suelte.
  const ofertaVisible = publicada ?? await (async () => {
    const admin = createAdminClient();
    const consultaAdmin = admin
      .from("professional_offers")
      .select(`*, professionals!professional_offers_professional_id_fkey(${professionalColumns})`);
    const { data: cerrada } = clave.id
      ? await consultaAdmin.eq("id", clave.id).maybeSingle()
      : await (() => {
          const { desde, hasta } = rangoDePrefijo(clave.prefijo!);
          return consultaAdmin.gte("id", desde).lte("id", hasta).limit(1).maybeSingle();
        })();
    return cerrada;
  })();
  if (!ofertaVisible) notFound();
  const offerOwnerProfileId = (ofertaVisible.professionals as { profile_id?: string | null } | null)?.profile_id ?? null;
  if (!user || offerOwnerProfileId !== user.id) {
    void recordServerInteraction({ type: "offer_view", source: "offers", locale, professionalId: ofertaVisible.professional_id ?? null, categoryId: ofertaVisible.service_category_id ?? null, viewerUserId: user?.id ?? null, metadata: { offerId: id } });
  }
  const professional = ofertaVisible.professionals as {
    slug?: string;
    business_name?: string;
    profile_id?: string;
    profiles?: { full_name?: string } | null;
  } | null;
  const idProfesional = String((ofertaVisible as { professional_id?: string }).professional_id ?? "");
  // La ficha de una cuenta bloqueada no se abre: su dueño tampoco sale en la
  // búsqueda y no hay a quién escribirle.
  if ((await profesionalesBloqueados([idProfesional])).has(idProfesional)) notFound();
  const banderas = (await contactFlagsFor([idProfesional]))[String((ofertaVisible as { professional_id?: string }).professional_id ?? "")] ?? { hasWhatsapp: false, allowPhoneCall: false, hasEmail: false };
  const offer = {
    ...ofertaVisible,
    title: repairVisibleText(ofertaVisible.title),
    description: repairVisibleText(ofertaVisible.description),
    service_label: ofertaVisible.service_label ? repairVisibleText(ofertaVisible.service_label) : null,
    location_label: ofertaVisible.location_label ? repairVisibleText(ofertaVisible.location_label) : null,
    image_urls: Array.isArray(ofertaVisible.image_urls) ? ofertaVisible.image_urls : [],
    professional_name: repairVisibleText(professional?.business_name || professional?.profiles?.full_name || copy.professionalFallback),
    professional_slug: professional?.slug ?? null,
    // Solo banderas: el número y el correo se piden al tocar el botón.
    professional_has_whatsapp: !!banderas.hasWhatsapp,
    professional_allow_phone_call: !!banderas.allowPhoneCall,
  } as ProfessionalOffer;
  const isOwner = !!user && professional?.profile_id === user.id;
  const before = formatOfferBeforePrice(offer, locale);
  const filasDeDatos: Array<[string, string]> = ([
    [copy.rowType, offerTypeLabel(offer.offer_type, locale)] as [string, string],
    ...(offer.service_label ? [[copy.rowService, offer.service_label] as [string, string]] : []),
    [copy.rowLocation, offer.location_label || copy.wholeCountry],
    ...(offer.valid_until ? [[copy.rowValid, new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(`${offer.valid_until}T12:00:00`))] as [string, string]] : []),
    ...(offer.quantity_available != null ? [[copy.rowAvailable, `${offer.quantity_available}`] as [string, string]] : []),
  ] as Array<[string, string]>).filter(([, valor]) => Boolean(valor));
  const quienPublica = offer.professional_slug ? (
    <Link href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`} className="inline-flex min-w-0 max-w-full items-center gap-1 font-semibold text-[#005eaa] hover:underline">
      <span className="min-w-0 truncate">{offer.professional_name}</span>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
  ) : (
    <p className="min-w-0 truncate font-semibold text-[#52627a]">{offer.professional_name}</p>
  );
  const discount = offerDiscountPercent(offer);
  const unavailable = offer.status !== "published" || isOfferExpired(offer, crTodayISO());
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));
  if (offer.service_category_id && !serviceOptions.some((option) => option.value === offer.service_category_id)) {
    serviceOptions.unshift({ value: offer.service_category_id, label: offer.service_label || getCategoryLabel(offer.service_category_id, locale) });
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-white text-[#162543] lg:bg-[#f4f7fa]">
      <OfferDetailNavbarSearch title={offer.title} />
      <RecordRecentVisit
        surface="ofertas"
        visita={{
          id: String(offer.id),
          titulo: offer.title,
          subtitulo: offer.professional_name ?? undefined,
          imagen: offer.image_urls?.[0],
          href: `/ofertas/${offer.id}`,
        }}
      />
      {/* La línea bajo la cabecera SE VE SIEMPRE, como en Empleos, la ficha del
          profesional, Ayuda y Soporte. Aquí aparecía solo al desplazar: en
          reposo la barra y el contenido se fundían y la promoción era la única
          pantalla del app sin esa separación. */}
      <header className="sticky top-0 z-30 border-b border-[#e5e7eb] bg-white lg:hidden">
        <div className={CABECERA_FILA_CENTRADA}>
          <Link href={backHref} aria-label={copy.back} className={cn("absolute left-4 top-1/2 -translate-y-1/2", CABECERA_BOTON)}>
            <ArrowLeft className={cn(CABECERA_GLIFO, "stroke-[2.4]")} />
          </Link>
          <h1 className={cn(CABECERA_TITULO, "text-center")}>{copy.title}</h1>
          {/* Guardar y compartir viven juntos DENTRO del «...»: son acciones
              sobre la ficha, no formas de contactar. Abajo solo lo que contacta. */}
          <MenuOferta
            grande
            className="absolute right-3 top-1/2 -translate-y-1/2"
            ofertaId={offer.id}
            titulo={offer.title}
            enlace={enlaceOferta(offer)}
            profesionalNombre={offer.professional_name || copy.professionalFallback}
            profesionalSlug={offer.professional_slug}
            esPropia={isOwner}
            guardar={isOwner ? undefined : { itemId: offer.id, snapshot: offerSaveSnapshot(offer, idioma), userId: user?.id ?? null, loginRedirect: `/ofertas/${offer.id}` }}
          />
        </div>
      </header>
      {/* EN COMPUTADORA LA FLECHA DE ATRÁS YA LA PONE EL NAVEGADOR, a la
          izquierda de la dirección. Duplicarla confunde: nadie sabe si nuestro
          «Volver» hace lo mismo que la del navegador o algo distinto. Así que
          este enlace NO es un «atrás»: solo aparece cuando el navegador NO
          puede ayudar —cuando se llegó de fuera, por Google o por un enlace de
          WhatsApp, y su flecha saca del sitio en vez de subir un nivel—. Ahí
          deja de fingir un regreso y ofrece la puerta hacia adentro: «Ver todas
          las promociones». Viniendo del tablero o del panel no se dibuja nada,
          porque la flecha del navegador ya hace exactamente eso.
          En el teléfono no cambia: ahí la salida es la flecha de la cabecera. */}
      {/* Sin dibujar, no escondido: un «Volver al panel» oculto por CSS seguía
          en el documento, para los lectores de pantalla y para Google. */}
      {/* EN COMPUTADORA NO HAY FLECHA DE VOLVER, NUNCA. La del navegador ya
          está, a la izquierda de la dirección, y hace exactamente eso; una
          segunda flecha dentro de la página duplica el camino y obliga a
          adivinar si hacen lo mismo. En el teléfono la salida sigue siendo la
          flecha de la cabecera, que ahí sí es la única que hay. */}
      {/* FLEX CON UTILIDADES NORMALES, NO UNA REJILLA CON VALOR ARBITRARIO.
            `lg:grid-cols-[minmax(0,1fr)_320px]` depende de que Tailwind genere
            esa clase; donde no la generó, quedaba `lg:grid` con una sola
            columna y las dos tarjetas salían APILADAS, una debajo de la otra.
            `lg:flex` + `lg:flex-1` + `lg:w-80` son utilidades de siempre: no
            hay nada que generar y no hay forma de que degrade. */}
      <div className="mx-auto flex max-w-[84rem] flex-col gap-5 px-0 py-0 sm:px-6 sm:py-8 lg:flex-row lg:items-start lg:pt-3">
        <article className="min-w-0 overflow-hidden bg-white lg:flex-1 lg:rounded-lg lg:border lg:border-[#e5e7eb]">
          <div className="relative bg-white p-0 sm:p-3">
            <OfferImageGallery images={offer.image_urls} title={offer.title} />
            {/* El descuento se lee como en el tablón: una marca sobre la foto,
                no una pastilla más en una fila de pastillas. */}
            {discount && (
              <span className="absolute left-5 top-5 rounded-md bg-[#009fd9] px-3 py-1.5 text-sm font-extrabold text-white shadow-sm">-{discount}%</span>
            )}
          </div>
          <div className="px-5 pt-6 sm:p-8">
            {/* El MISMO orden que la ficha de un empleo: primero quién publica,
                debajo el título a todo el ancho, luego la línea de datos y el
                precio. Aquí el título iba primero y el negocio debajo, así que
                dos fichas del mismo app se leían al revés. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">{quienPublica}</div>
              <MenuOferta
                className="-mr-2 hidden shrink-0 lg:block"
                ofertaId={offer.id}
                titulo={offer.title}
                enlace={enlaceOferta(offer)}
                profesionalNombre={offer.professional_name || copy.professionalFallback}
                profesionalSlug={offer.professional_slug}
                esPropia={isOwner}
              />
            </div>
            <h2 className="mt-0.5 text-2xl font-extrabold leading-tight">{offer.title}</h2>
            {/* Tipo y servicio en una línea con punto, igual que en la tarjeta
                del tablón: eran tres pastillas de colores distintos para decir
                lo mismo. */}
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-5 text-[#68778d]">
              <span>{offerTypeLabel(offer.offer_type, locale)}</span>
              {offer.service_label && (
                <>
                  <span aria-hidden="true" className="text-[#c0cad5]">·</span>
                  <span className="font-semibold text-[#008fc3]">{offer.service_label}</span>
                </>
              )}
            </p>
            {/* En computadora el precio vive en la tarjeta de al lado; aquí
                salía por segunda vez, a 3xl, diez líneas más abajo. */}
            <div className="mt-2 flex flex-wrap items-end gap-3 lg:hidden">
              <p className="text-base font-extrabold text-[#007fae]">{formatOfferPrice(offer, locale)}</p>
              {before && <p className="text-sm font-bold text-[#8794a7] line-through">{before}</p>}
            </div>
            {isOwner ? (
              // En la franja fija de abajo, igual que el contacto para los demás.
              <AccionesAlPie className="mt-5 lg:hidden">
                <OfferOwnerActions offer={offer} professionalId={offer.professional_id} serviceOptions={serviceOptions} fromPanel={from === "panel"} />
              </AccionesAlPie>
            ) : unavailable ? (
              <p className="mt-5 rounded-lg bg-[#f4f7fa] p-4 text-sm font-bold lg:hidden">{copy.unavailable}</p>
            ) : (
              <AccionesAlPie className="mt-5 lg:hidden">
                <OfferContactActions offer={offer} userId={user?.id ?? null} isOwner={false} soloContacto />
              </AccionesAlPie>
            )}
            {/* Etiqueta arriba y valor debajo, como en la ficha de un empleo.
                Eran cuatro líneas con ícono azul que se leían como enlaces. */}
            <dl className="mt-6 grid gap-3 border-y border-[#e5e7eb] py-5 text-sm sm:grid-cols-2">
              {filasDeDatos.map(([etiqueta, valor]) => (
                <div key={etiqueta} className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-wide text-[#7a899d]">{etiqueta}</dt>
                  <dd className="mt-0.5 break-words font-bold text-[#162543] [overflow-wrap:anywhere]">{valor}</dd>
                </div>
              ))}
            </dl>
            <section className="mt-7 pb-6">
              <h3 className="text-lg font-bold">{copy.details}</h3>
              <p className="mt-3 max-w-[68ch] whitespace-pre-line break-words pr-1 text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">
                {offer.description}
              </p>
            </section>
          </div>
        </article>
        {/* El tope de lo pegajoso es la barra MÁS el mismo aire que usa la
            rejilla (lg:pt-3). Con 96px fijos, en una ficha sin enlace de volver
            el contenido arranca a 76px y `sticky` empujaba la tarjeta 20px por
            debajo de la columna de la izquierda: las dos columnas nacían
            desalineadas. Con el tope igual a su sitio natural no empuja nunca,
            y al desplazar se pega igual. */}
        <aside className="hidden h-fit w-80 shrink-0 rounded-lg border border-[#e5e7eb] bg-white p-5 lg:sticky lg:top-6 lg:block">
          <p className="text-xs font-bold uppercase text-[#7a899d]">{copy.title}</p><p className="mt-1 text-2xl font-extrabold text-[#007fae]">{formatOfferPrice(offer, locale)}</p>{before && <p className="mt-1 text-sm font-bold text-[#8794a7] line-through">{copy.before} {before}</p>}
          <p className="mb-4 mt-4 border-y border-[#e5e7eb] py-4 text-sm font-semibold text-[#52627a]">{copy.publishedBy}{" "}{offer.professional_slug ? (<Link href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`} className="text-[#005eaa] hover:underline">{offer.professional_name}</Link>) : offer.professional_name}</p>
          {isOwner ? (
            <OfferOwnerActions offer={offer} professionalId={offer.professional_id} serviceOptions={serviceOptions} fromPanel={from === "panel"} />
          ) : (
            unavailable ? <p className="rounded-lg bg-[#f4f7fa] p-4 text-sm font-bold">{copy.unavailable}</p> : <div className="space-y-3">
              <OfferContactActions offer={offer} userId={user?.id ?? null} isOwner={false} />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
