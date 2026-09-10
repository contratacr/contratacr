import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ChevronRight, MapPin, PackageCheck, Tag } from "lucide-react";
import { StickyHairlineHeader } from "@/components/util/sticky-hairline-header";
import { Link } from "@/i18n/navigation";
import { OfferImageGallery } from "@/components/offers/offer-image-gallery";
import { OfferDetailNavbarSearch } from "@/components/offers/offer-detail-navbar-search";
import { OfferContactActions } from "@/components/offers/offers-board";
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
import { createClient } from "@/lib/supabase/server";
import { recordServerInteraction } from "@/lib/analytics/server-events";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { crTodayISO } from "@/lib/time-cr";
import { RecordRecentVisit } from "@/components/mobile/record-recent-visit";
import { marketplaceReturnLabel, safeMarketplaceReturnHref } from "@/lib/navigation/marketplace-return";

export const dynamic = "force-dynamic";

const COPY = {
  es: {
    back: "Volver",
    title: "Oferta",
    professionalFallback: "Profesional en ContrataCR",
    savings: "Ahorras",
    unavailable: "Esta oferta ya no está disponible.",
    validUntil: "Válida hasta",
    available: "disponibles",
    details: "Detalles",
    before: "Antes",
    publishedBy: "Publicada por",
  },
  en: {
    back: "Back",
    title: "Offer",
    professionalFallback: "Professional on ContrataCR",
    savings: "Save",
    unavailable: "This offer is no longer available.",
    validUntil: "Available until",
    available: "available",
    details: "Details",
    before: "Before",
    publishedBy: "Published by",
  },
} as const;

export default async function OfferDetailPage({ params, searchParams }: { params: Promise<{ id: string; locale: string }>; searchParams?: Promise<{ from?: string }> }) {
  const { id, locale: rawLocale } = await params;
  const locale = marketplaceLocale(rawLocale);
  const copy = COPY[locale];
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const from = (await searchParams)?.from;
  const backHref = safeMarketplaceReturnHref(from, "/ofertas");
  const backLabel = marketplaceReturnLabel(backHref, "/ofertas", locale);
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const professionalColumns = user
    ? "slug,business_name,profile_id,whatsapp,allow_phone_call,call_phone,contact_email,profiles(full_name)"
    : "slug,business_name,profiles(full_name)";
  // El enlace corto trae el título y los 8 primeros del id; el largo, el id
  // entero. Los dos abren la misma oferta.
  const clave = claveDeTramo(id);
  if (!clave.id && !clave.prefijo) notFound();
  const consulta = supabase
    .from("professional_offers")
    .select(`*, professionals!professional_offers_professional_id_fkey(${professionalColumns})`);
  const { data, error: offerError } = clave.id
    ? await consulta.eq("id", clave.id).maybeSingle()
    : await (() => {
        const { desde, hasta } = rangoDePrefijo(clave.prefijo!);
        return consulta.gte("id", desde).lte("id", hasta).limit(1).maybeSingle();
      })();
  if (offerError) throw offerError;
  if (!data) notFound();
  const offerOwnerProfileId = (data.professionals as { profile_id?: string | null } | null)?.profile_id ?? null;
  if (!user || offerOwnerProfileId !== user.id) {
    void recordServerInteraction({ type: "offer_view", source: "offers", locale, professionalId: data.professional_id ?? null, categoryId: data.service_category_id ?? null, viewerUserId: user?.id ?? null, metadata: { offerId: id } });
  }
  const professional = data.professionals as {
    slug?: string;
    business_name?: string;
    profile_id?: string;
    whatsapp?: string | null;
    allow_phone_call?: boolean | null;
    call_phone?: string | null;
    contact_email?: string | null;
    profiles?: { full_name?: string } | null;
  } | null;
  const offer = {
    ...data,
    title: repairVisibleText(data.title),
    description: repairVisibleText(data.description),
    service_label: data.service_label ? repairVisibleText(data.service_label) : null,
    location_label: data.location_label ? repairVisibleText(data.location_label) : null,
    image_urls: Array.isArray(data.image_urls) ? data.image_urls : [],
    professional_name: repairVisibleText(professional?.business_name || professional?.profiles?.full_name || copy.professionalFallback),
    professional_slug: professional?.slug ?? null,
    professional_whatsapp: professional?.whatsapp ?? null,
    professional_allow_phone_call: professional?.allow_phone_call ?? false,
    professional_call_phone: professional?.call_phone ?? null,
    professional_contact_email: professional?.contact_email ?? null,
  } as ProfessionalOffer;
  const isOwner = !!user && professional?.profile_id === user.id;
  const before = formatOfferBeforePrice(offer, locale);
  const discount = offerDiscountPercent(offer);
  const unavailable = offer.status !== "published" || isOfferExpired(offer, crTodayISO());
  const serviceOptions = getAllCategories().map((category) => ({ value: category.id, label: getCategoryLabel(category.id, locale) }));
  if (offer.service_category_id && !serviceOptions.some((option) => option.value === offer.service_category_id)) {
    serviceOptions.unshift({ value: offer.service_category_id, label: offer.service_label || getCategoryLabel(offer.service_category_id, locale) });
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-[#f4f7fa] text-[#162543]">
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
      <StickyHairlineHeader shadow className="z-30 lg:hidden">
        <div className="relative flex min-h-[58px] items-center justify-center px-14">
          <Link href={backHref} aria-label={copy.back} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full text-[#162543] transition hover:bg-[#eef5f9]">
            <ArrowLeft className="h-6 w-6 stroke-[2.4]" />
          </Link>
          <h1 className="truncate text-center text-lg font-extrabold">{copy.title}</h1>
          <MenuOferta
            grande
            className="absolute right-2 top-1/2 -translate-y-1/2"
            ofertaId={offer.id}
            titulo={offer.title}
            enlace={enlaceOferta(offer)}
            profesionalNombre={offer.professional_name || copy.professionalFallback}
            profesionalSlug={offer.professional_slug}
            esPropia={isOwner}
          />
        </div>
      </StickyHairlineHeader>
      <div className="mx-auto hidden max-w-6xl px-4 pt-6 sm:px-6 lg:block">
        <Link href={backHref} className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold transition hover: ccr-caja-icono">
          <ArrowLeft className="h-4 w-4 stroke-[2.4]" />
          <span>{backLabel}</span>
        </Link>
      </div>
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,760px)_320px] lg:justify-center lg:pt-3">
        <article className="overflow-hidden rounded-lg border border-[#dfe8f0] bg-white">
          <div className="relative bg-white p-2 sm:p-3">
            <OfferImageGallery images={offer.image_urls} title={offer.title} />
            {/* El descuento se lee como en el tablón: una marca sobre la foto,
                no una pastilla más en una fila de pastillas. */}
            {discount && (
              <span className="absolute left-5 top-5 rounded-md bg-[#009fd9] px-3 py-1.5 text-sm font-extrabold text-white shadow-sm">-{discount}%</span>
            )}
          </div>
          <div className="p-5 sm:p-8">
            <div className="flex items-start justify-between gap-3">
              <h1 className="min-w-0 flex-1 text-2xl font-bold sm:text-3xl">{offer.title}</h1>
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
            {/* El nombre lleva al perfil: el botón "Ver perfil" decía lo mismo y
                competía con el contacto. */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {offer.professional_slug ? (
                <Link href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`} className="inline-flex items-center gap-1 font-semibold text-[#005eaa] hover:underline">
                  {offer.professional_name}
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              ) : (
                <p className="font-semibold text-[#52627a]">{offer.professional_name}</p>
              )}
            </div>
            {/* Tipo y servicio en una línea con punto, igual que en la tarjeta
                del tablón: eran tres pastillas de colores distintos para decir
                lo mismo. */}
            <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[13px] leading-5 sm:text-sm">
              <span className="text-[#68778d]">{offerTypeLabel(offer.offer_type, locale)}</span>
              {offer.service_label && (
                <>
                  <span aria-hidden="true" className="text-[#c0cad5]">·</span>
                  <span className="font-semibold text-[#008fc3]">{offer.service_label}</span>
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap items-end gap-3">
              <p className="text-3xl font-extrabold text-[#007fae]">{formatOfferPrice(offer, locale)}</p>
              {before && <p className="pb-1 text-sm font-bold text-[#8794a7] line-through">{before}</p>}
            </div>
            <div className="mt-5 lg:hidden">
              {isOwner ? (
                <OfferOwnerActions offer={offer} professionalId={offer.professional_id} serviceOptions={serviceOptions} fromPanel={from === "panel"} />
              ) : (
                unavailable ? <p className="rounded-lg bg-[#f4f7fa] p-4 text-sm font-bold">{copy.unavailable}</p> : <OfferContactActions offer={offer} userId={user?.id ?? null} isOwner={false} />
              )}
            </div>
            <div className="mt-5 grid gap-3 border-y border-[#e8eef3] py-5 text-sm text-[#60708a] sm:grid-cols-2">
              {offer.location_label && <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#009fd9]" />{offer.location_label}</span>}
              {offer.valid_until && <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-[#009fd9]" />{copy.validUntil} {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(new Date(`${offer.valid_until}T12:00:00`))}</span>}
              {offer.quantity_available != null && <span className="inline-flex items-center gap-2"><PackageCheck className="h-4 w-4 text-[#009fd9]" />{offer.quantity_available} {copy.available}</span>}
              <span className="inline-flex items-center gap-2"><Tag className="h-4 w-4 text-[#009fd9]" />{offerTypeLabel(offer.offer_type, locale)}</span>
            </div>
            <section className="mt-7 pb-2">
              <h2 className="text-lg font-bold">{copy.details}</h2>
              <p className="mt-3 max-w-full whitespace-pre-line break-words pr-1 text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">
                {offer.description}
              </p>
            </section>
          </div>
        </article>
        <aside className="hidden h-fit rounded-lg border border-[#dfe8f0] bg-white p-5 lg:sticky lg:top-24 lg:block">
          <p className="text-xs font-bold uppercase text-[#7a899d]">{copy.title}</p><p className="mt-1 text-2xl font-extrabold text-[#007fae]">{formatOfferPrice(offer, locale)}</p>{before && <p className="mt-1 text-sm font-bold text-[#8794a7] line-through">{copy.before} {before}</p>}
          <p className="mb-4 mt-4 border-y border-[#e8eef3] py-4 text-sm font-semibold text-[#52627a]">{copy.publishedBy}{" "}{offer.professional_slug ? (<Link href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`} className="text-[#005eaa] hover:underline">{offer.professional_name}</Link>) : offer.professional_name}</p>
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
