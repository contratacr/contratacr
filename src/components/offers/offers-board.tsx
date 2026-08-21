"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Mail, MapPin, Menu, Phone, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { useLocale } from "next-intl";
import {
  MarketplaceFilterChip,
  MarketplaceNavbarPortal,
  MarketplaceSearch,
} from "@/components/marketplace/marketplace-controls";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import { OfferImageGallery } from "@/components/offers/offer-image-gallery";
import { SaveItemButton } from "@/components/saved/save-item-button";
import {
  formatOfferBeforePrice,
  formatOfferPrice,
  OFFER_TYPES,
  offerDiscountPercent,
  type ProfessionalOffer,
} from "@/lib/offers";
import {
  marketplaceLocale,
  offerTypeLabel,
  type MarketplaceLocale,
} from "@/lib/marketplace-copy";

type Props = {
  offers: ProfessionalOffer[];
  canPost: boolean;
  currentProfessionalId?: string | null;
  currentUserId?: string | null;
  serviceOptions: Array<{ value: string; label: string }>;
};

const MARKETPLACE_LIST_CLASS =
  "ccr-marketplace-card-list min-w-0 bg-white lg:h-[calc(100dvh-190px)] lg:min-h-[420px] lg:overflow-y-scroll lg:border-r lg:border-[#dfe6ec]";

const OFFERS_COPY = {
  es: {
    allServices: "Todos los servicios",
    searchPlaceholder: "¿Qué oferta estás buscando?",
    service: "Servicio",
    servicePlaceholder: "Servicio",
    date: "Fecha",
    anyDate: "Cualquier fecha",
    last24Hours: "Últimas 24 horas",
    lastWeek: "Última semana",
    lastMonth: "Último mes",
    offerType: "Tipo de oferta",
    anyType: "Cualquier tipo",
    myOffers: "Mis ofertas",
    publishOffer: "Publicar oferta",
    offers: "Ofertas",
    promotions: "Promociones de profesionales",
    openMenu: "Abrir menú",
    offer: "oferta",
    offerPlural: "ofertas",
    country: "Costa Rica",
    noResults: "No encontramos resultados",
    noOffers: "Todavía no hay ofertas",
    tryAgain: "Prueba con otra búsqueda o restablece los filtros.",
    futureOffers: "Las nuevas promociones de profesionales aparecerán aquí.",
    viewAll: "Ver todas las ofertas",
    publishFirst: "Publicar la primera oferta",
    publishSubtitle: "Publica una promoción clara y fácil de comparar.",
    editOffer: "Editar oferta",
    editSubtitle: "Actualiza la información de esta publicación.",
    manageOffer: "Administrar oferta",
    professional: "Profesional",
    profile: "Ver perfil",
    call: "Llamar",
    email: "Correo",
    emailSubject: "Consulta desde ContrataCR",
    emailBody: (title: string) =>
      `Hola, vi tu oferta \"${title}\" en ContrataCR y me gustaría recibir más información.`,
    view: (title: string) => `Ver ${title}`,
    availableUntil: "Disponible hasta",
  },
  en: {
    allServices: "All services",
    searchPlaceholder: "What offer are you looking for?",
    service: "Service",
    servicePlaceholder: "Service",
    date: "Date posted",
    anyDate: "Any date",
    last24Hours: "Past 24 hours",
    lastWeek: "Past week",
    lastMonth: "Past month",
    offerType: "Offer type",
    anyType: "Any type",
    myOffers: "My offers",
    publishOffer: "Post an offer",
    offers: "Offers",
    promotions: "Promotions from professionals",
    openMenu: "Open menu",
    offer: "offer",
    offerPlural: "offers",
    country: "Costa Rica",
    noResults: "No results found",
    noOffers: "There are no offers yet",
    tryAgain: "Try another search or reset the filters.",
    futureOffers: "New promotions from professionals will appear here.",
    viewAll: "View all offers",
    publishFirst: "Post the first offer",
    publishSubtitle: "Post a clear promotion that is easy to compare.",
    editOffer: "Edit offer",
    editSubtitle: "Update this offer's information.",
    manageOffer: "Manage offer",
    professional: "Professional",
    profile: "View profile",
    call: "Call",
    email: "Email",
    emailSubject: "ContrataCR inquiry",
    emailBody: (title: string) =>
      `Hi, I saw your offer \"${title}\" on ContrataCR and would like more information.`,
    view: (title: string) => `View ${title}`,
    availableUntil: "Available until",
  },
} satisfies Record<MarketplaceLocale, Record<string, unknown>>;

export function OffersBoard({
  offers,
  canPost,
  currentProfessionalId = null,
  currentUserId = null,
  serviceOptions: publishServiceOptions,
}: Props) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProfessionalOffer | null>(
    null,
  );
  const initialLocation =
    searchParams.get("location")?.trim().toLocaleLowerCase("es-CR") ?? "";
  const [locationFilter, setLocationFilter] = useState(initialLocation);
  const [type, setType] = useState("all");
  const [serviceQuery, setServiceQuery] = useState(
    () => searchParams.get("service")?.trim() ?? "",
  );
  const [published, setPublished] = useState("all");
  const [selectedId, setSelectedId] = useState(
    () => searchParams.get("offer") ?? offers[0]?.id ?? "",
  );
  const deferredQuery = useDeferredValue(query);
  const deferredServiceQuery = useDeferredValue(serviceQuery);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const cleanQuery = query.trim();
      if (cleanQuery) params.set("q", cleanQuery);
      else params.delete("q");
      const cleanService = serviceQuery.trim();
      if (cleanService) params.set("service", cleanService);
      else params.delete("service");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, serviceQuery]);
  const serviceOptions = useMemo(() => {
    const unique = new Map<string, string>();
    publishServiceOptions.forEach((option) =>
      unique.set(option.label, option.label),
    );
    offers.forEach((offer) => {
      if (offer.service_label) unique.set(offer.service_label, offer.service_label);
    });
    return [["all", copy.allServices], ...unique.entries()] as Array<
      [string, string]
    >;
  }, [copy.allServices, offers, publishServiceOptions]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("es-CR");
    const serviceNeedle = deferredServiceQuery
      .trim()
      .toLocaleLowerCase("es-CR");
    return offers.filter((offer) => {
      const matchesQuery =
        !needle ||
        [
          offer.title,
          offer.description,
          offer.service_label,
          offer.location_label,
          offer.professional_name,
        ].some((value) => value?.toLocaleLowerCase("es-CR").includes(needle));
      const matchesService =
        !serviceNeedle ||
        offer.service_label
          ?.toLocaleLowerCase("es-CR")
          .includes(serviceNeedle) ||
        offer.service_category_id
          ?.toLocaleLowerCase("es-CR")
          .includes(serviceNeedle);
      const matchesDate =
        published === "all" ||
        Date.now() - new Date(offer.created_at).getTime() <=
          Number(published) * 86_400_000;
      const matchesLocation =
        !locationFilter ||
        offer.location_label
          ?.toLocaleLowerCase("es-CR")
          .includes(locationFilter);
      return (
        matchesQuery &&
        matchesService &&
        matchesLocation &&
        matchesDate &&
        (type === "all" || offer.offer_type === type)
      );
    });
  }, [
    deferredQuery,
    deferredServiceQuery,
    locationFilter,
    offers,
    published,
    type,
  ]);
  const selected =
    filtered.find((offer) => offer.id === selectedId) ?? filtered[0] ?? null;
  const suggestions = useMemo(
    () => [...new Set(offers.map((offer) => offer.title).filter(Boolean))],
    [offers],
  );
  const hasActiveFilters =
    Boolean(query.trim()) ||
    Boolean(serviceQuery.trim()) ||
    Boolean(locationFilter) ||
    type !== "all" ||
    published !== "all";

  useEffect(() => {
    const offerId = searchParams.get("offer");
    if (offerId) setSelectedId(offerId);
  }, [searchParams]);
  function clearSearchAndFilters() {
    setQuery("");
    setType("all");
    setServiceQuery("");
    setPublished("all");
    setLocationFilter("");
    const params = new URLSearchParams(window.location.search);
    params.delete("location");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState(null, "", nextUrl);
  }

  useEffect(() => {
    if (
      filtered.length > 0 &&
      !filtered.some((offer) => offer.id === selectedId)
    )
      setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const renderSearch = () => (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder={copy.searchPlaceholder}
      suggestions={suggestions}
      recentStorageKey="ccr-offer-search-recents"
      secondary={{
        value: serviceQuery,
        onChange: setServiceQuery,
        placeholder: copy.servicePlaceholder,
        ariaLabel: copy.service,
        suggestions: serviceOptions.slice(1).map(([, label]) => label),
        icon: "service",
        clearLabel: locale === "en" ? "Clear service" : "Limpiar servicio",
      }}
    />
  );

  const renderFilters = () => (
    <>
      <MarketplaceFilterChip
        label={copy.date}
        value={published}
        onChange={setPublished}
        options={[
          ["all", copy.anyDate],
          ["1", copy.last24Hours],
          ["7", copy.lastWeek],
          ["30", copy.lastMonth],
        ]}
      />
      <MarketplaceFilterChip
        label={copy.offerType}
        value={type}
        onChange={setType}
        options={[
          ["all", copy.anyType],
          ...Object.keys(OFFER_TYPES).map((value) => [
            value,
            offerTypeLabel(value as ProfessionalOffer["offer_type"], locale),
          ] as [string, string]),
        ]}
      />
    </>
  );
  const renderActions = () => (
    <div className={canPost ? "grid w-full grid-cols-2 gap-2 sm:w-[296px] [&>*]:w-full" : "flex w-full sm:w-auto"}>
      {canPost && (
        <Link
          href="/dashboard/profesional?mode=offer&tab=offers&returnTo=%2Fofertas"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#cddae6] bg-white px-3 text-[13px] font-bold text-[#162543] transition hover:border-[#9fb6ca] hover:bg-[#f4f8fb] lg:h-[42px] lg:px-4 lg:text-sm"
        >
          {copy.myOffers}
        </Link>
      )}
      {canPost ? (
        <>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="hidden h-[42px] items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
          >
            {copy.publishOffer}
          </button>
          <Link
            href="/ofertas/publicar"
            className="inline-flex h-9 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-[13px] font-bold text-white transition hover:bg-[#008fc3] lg:hidden"
          >
            {copy.publishOffer}
          </Link>
        </>
      ) : (
        <Link
          href="/login?redirect=/ofertas/publicar"
          className="inline-flex h-9 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-4 text-[13px] font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:h-10 lg:px-5 lg:text-sm"
        >
          {copy.publishOffer}
        </Link>
      )}
    </div>
  );

  return (
    <main className="min-h-[calc(100vh-72px)] overflow-x-clip bg-white pb-16 text-[#162543] lg:bg-[#f4f7fa]">
      <section className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden">
        <div className="px-0">
          <div className="relative flex min-h-[56px] items-center justify-center px-14">
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event("ccr:open-mobile-menu"))
              }
              aria-label={copy.openMenu}
              className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]"
            >
              <Menu className="h-5 w-5" strokeWidth={2.5} />
            </button>
            <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">
              {copy.offers}
            </h1>
          </div>
          <div className="px-4 pb-3">{renderSearch()}</div>
          <div className="ccr-chip-row scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-4">
            {renderFilters()}
          </div>
          <div className="px-4 pb-3" data-testid="offers-mobile-sticky-actions">
            {renderActions()}
          </div>
        </div>
      </section>
      <MarketplaceNavbarPortal>
        <section className="hidden h-full bg-transparent lg:block">
          <div className="flex h-full w-full items-center py-2">
            <div className="w-full">{renderSearch()}</div>
          </div>
        </section>
      </MarketplaceNavbarPortal>
      <div className="mx-auto hidden max-w-7xl items-end justify-between gap-4 px-6 pt-3 lg:flex">
        <div>
          <h1 className="text-2xl font-extrabold">{copy.offers}</h1>
          <p className="text-sm text-[#68778d]">{copy.promotions}</p>
        </div>
        <div className="flex shrink-0 gap-2">{renderActions()}</div>
      </div>

      <div className="relative z-30 mx-auto hidden max-w-7xl px-6 pt-3 lg:block">
        <div className="flex flex-wrap items-center gap-2 overflow-visible">
          {renderFilters()}
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-0 sm:px-6 sm:py-5 lg:pt-3">
        <div className={`${filtered.length > 0 ? "lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]" : ""} lg:max-h-[calc(100vh-190px)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#dfe8f0] lg:bg-white`}>
          <section className={filtered.length > 0 ? MARKETPLACE_LIST_CLASS : "min-w-0 bg-white"}>
            <div className="border-b border-[#e7edf2] px-4 py-3">
              <p className="font-bold">
                 {filtered.length} {filtered.length === 1 ? copy.offer : copy.offerPlural}
              </p>
               <p className="text-xs text-[#68778d]">{copy.country}</p>
            </div>
            <div>
              {filtered.map((offer) => (
                <OfferRow
                  key={offer.id}
                  offer={offer}
                  selected={selected?.id === offer.id}
                  onSelect={() => setSelectedId(offer.id)}
                />
              ))}
              {filtered.length === 0 && (
                <div className="flex min-h-[320px] flex-col items-center justify-center px-7 py-12 text-center lg:min-h-[360px]">
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]">
                    <Store className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h2 className="mt-4 text-lg font-extrabold text-[#162543]">
                    {hasActiveFilters
                       ? copy.noResults
                       : copy.noOffers}
                  </h2>
                  <p className="mt-1.5 max-w-xs text-sm leading-6 text-[#68778d]">
                    {hasActiveFilters
                       ? copy.tryAgain
                       : copy.futureOffers}
                  </p>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearSearchAndFilters}
                      className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]"
                    >
                       {copy.viewAll}
                    </button>
                  ) : canPost ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPublishOpen(true)}
                        className="mt-5 hidden h-10 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
                      >
                        {copy.publishFirst}
                      </button>
                      <Link
                        href="/ofertas/publicar"
                        className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden"
                      >
                        {copy.publishFirst}
                      </Link>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </section>
          {selected && (
            <OfferPreview
              offer={selected}
              userId={currentUserId}
              currentProfessionalId={currentProfessionalId}
              onEdit={() => setEditingOffer(selected)}
            />
          )}
        </div>
      </div>
      {publishOpen && currentProfessionalId && (
        <Modal
          onClose={() => setPublishOpen(false)}
          title={copy.publishOffer}
          subtitle={copy.publishSubtitle}
          size="lg"
          bodyClassName="px-5 py-5 sm:px-6"
        >
          <OfferForm
            professionalId={currentProfessionalId}
            serviceOptions={publishServiceOptions}
            presentation="modal"
            backHref="/ofertas"
            onSaved={(id) => {
              setPublishOpen(false);
              router.push(`/ofertas/${id}`);
            }}
          />
        </Modal>
      )}
      {editingOffer && currentProfessionalId && (
        <Modal
          onClose={() => setEditingOffer(null)}
          title={copy.editOffer}
          subtitle={copy.editSubtitle}
          size="lg"
          bodyClassName="px-5 py-5 sm:px-6"
        >
          <OfferForm
            professionalId={currentProfessionalId}
            serviceOptions={publishServiceOptions}
            initialOffer={editingOffer}
            presentation="modal"
            backHref="/ofertas"
            onSaved={() => {
              setEditingOffer(null);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </main>
  );
}

function OfferImage({
  offer,
  large = false,
}: {
  offer: ProfessionalOffer;
  large?: boolean;
}) {
  const extraCount = Math.max(0, offer.image_urls.length - 1);
  return (
    <div
      className={`${large ? "aspect-[16/8] w-full rounded-lg bg-[#f3f7fa]" : "h-11 w-11 shrink-0 sm:h-12 sm:w-12"} relative overflow-hidden`}
    >
      {offer.image_urls[0] ? (
        <img
          src={offer.image_urls[0]}
          alt={offer.title}
          className={`block h-full max-h-full w-full max-w-full rounded-lg ${large ? "object-cover" : "object-cover"}`}
        />
      ) : (
        <span className="grid h-full place-items-center rounded-lg bg-[#f3f7fa] text-xs font-extrabold text-[#009fd9]">
          {offer.title.slice(0, 2).toUpperCase()}
        </span>
      )}
      {extraCount > 0 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-[#162543]/85 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
          +{extraCount}
        </span>
      )}
    </div>
  );
}

function offerSaveSnapshot(offer: ProfessionalOffer, locale: MarketplaceLocale) {
  return {
    title: offer.title,
    professional_name: offer.professional_name,
    professional_slug: offer.professional_slug,
    image_url: offer.image_urls[0] ?? null,
    service_label: offer.service_label,
    offer_type: offerTypeLabel(offer.offer_type, locale),
    location_label: offer.location_label,
    price: formatOfferPrice(offer, locale),
    created_at: offer.created_at,
  };
}

export function OfferContactActions({
  offer,
  userId,
  isOwner,
  compact = false,
}: {
  offer: ProfessionalOffer;
  userId: string | null;
  isOwner: boolean;
  compact?: boolean;
}) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const whatsapp = offer.professional_whatsapp?.trim();
  const callPhone = (
    offer.professional_call_phone ||
    offer.professional_whatsapp ||
    ""
  ).replace(/\D/g, "");
  const email = offer.professional_contact_email?.trim();
  const showCall =
    !!offer.professional_allow_phone_call && callPhone.length >= 8;
  const showEmail = !!email;
  if (isOwner) return null;

  function requireAuth() {
    if (userId) return true;
    const redirect =
      typeof window !== "undefined"
        ? `${window.location.pathname}${window.location.search}${window.location.hash}`
        : "/ofertas";
    window.location.assign(
      `/${locale}/login?redirect=${encodeURIComponent(redirect)}`,
    );
    return false;
  }

  function track(method: "phone" | "email") {
    trackInteraction({
      type: method === "phone" ? "phone_click" : "external_link_click",
      professionalId: offer.professional_id,
      source: "unknown",
      locale,
      metadata:
        method === "email"
          ? { channel: "email", offerId: offer.id }
          : { offerId: offer.id },
    });
  }

  const secondaryClass = compact
    ? "inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[#d7e1ea] bg-white px-2 text-[12px] font-bold text-[#162543] transition hover:border-[#b9d9e8] hover:bg-[#f8fbfd]"
    : "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-lg border border-[#d7e1ea] bg-white px-3 text-sm font-bold text-[#162543] transition hover:border-[#b9d9e8] hover:bg-[#f8fbfd]";
  return (
    <div className="relative z-[2] mt-3 space-y-2">
      <div className={`grid gap-2 ${whatsapp && offer.professional_slug ? "grid-cols-2" : "grid-cols-1"}`}>
        {whatsapp && (
          <DirectChatLauncher
            professionalId={offer.professional_id}
            professionalName={offer.professional_name || copy.professional}
            contextTitle={offer.title}
            analyticsSource="unknown"
            buttonLabel="WhatsApp"
            className={`${compact ? "h-9 text-[12px]" : "h-11 text-sm"} w-full rounded-lg font-bold`}
          />
        )}
        {offer.professional_slug && (
          <Link
            href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`}
            className={`${compact ? "h-9 px-2 text-[12px]" : "h-11 px-3 text-sm"} inline-flex w-full items-center justify-center rounded-lg bg-[#009fd9] font-bold text-white transition-colors hover:bg-[#008fc3]`}
          >
            {copy.profile}
          </Link>
        )}
      </div>
      {(showCall || showEmail) && (
        <div
          className={`grid gap-2 ${showCall && showEmail ? "grid-cols-2" : "grid-cols-1"}`}
        >
          {showCall && (
            <a
              href={`tel:+${callPhone.startsWith("506") ? callPhone : `506${callPhone}`}`}
              onClick={(event) => {
                if (!requireAuth()) {
                  event.preventDefault();
                  return;
                }
                track("phone");
              }}
              className={secondaryClass}
            >
              <Phone className="h-4 w-4 shrink-0" />
               <span className="truncate">{copy.call}</span>
            </a>
          )}
          {showEmail && (
            <a
               href={`mailto:${email}?subject=${encodeURIComponent(copy.emailSubject)}&body=${encodeURIComponent(copy.emailBody(offer.title))}`}
              onClick={(event) => {
                if (!requireAuth()) {
                  event.preventDefault();
                  return;
                }
                track("email");
              }}
              className={secondaryClass}
            >
              <Mail className="h-4 w-4 shrink-0" />
               <span className="truncate">{copy.email}</span>
            </a>
          )}
        </div>
      )}
      <SaveItemButton
        itemType="offer"
        itemId={offer.id}
         snapshot={offerSaveSnapshot(offer, locale)}
        userId={userId}
        loginRedirect={`/ofertas/${offer.id}`}
        withLabel
        className={`${compact ? "h-9 px-2 text-[12px]" : "h-11 px-3 text-sm"} w-full border-[#d7e1ea] bg-white text-[#162543] hover:border-[#b9d9e8] hover:bg-[#f8fbfd] hover:text-[#162543] aria-pressed:border-[#d7e1ea] aria-pressed:bg-white aria-pressed:text-[#162543] aria-pressed:hover:border-[#b9d9e8] aria-pressed:hover:bg-[#f8fbfd]`}
      />
    </div>
  );
}
function OfferRow({
  offer,
  selected,
  onSelect,
}: {
  offer: ProfessionalOffer;
  selected: boolean;
  onSelect: () => void;
}) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const discount = offerDiscountPercent(offer);
  return (
    <article
      className={`relative overflow-hidden border-b border-[#dfe6ec] bg-white px-3 py-2 transition hover:bg-[#f8fafc] sm:px-4 sm:py-2.5 ${selected ? "lg:bg-[#eef9fd] lg:shadow-[inset_4px_0_0_#162543]" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={copy.view(offer.title)}
        className="absolute inset-0 hidden lg:block"
      />
      <Link
        href={`/ofertas/${offer.id}`}
        className="relative z-[1] block lg:pointer-events-none"
      >
        <div className="flex gap-2.5 sm:gap-3">
          <OfferImage offer={offer} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-[14px] font-extrabold leading-5 text-[#005eaa] sm:text-[15px] lg:text-base">
                {offer.title}
              </h2>
              {discount && (
                <span className="shrink-0 rounded-full bg-[#009fd9] px-2 py-0.5 text-[10px] font-extrabold leading-4 text-white shadow-sm">
                  -{discount}%
                </span>
              )}
            </div>
            <p className="truncate text-[13px] font-semibold leading-5 text-[#101d35] sm:text-sm">
              {offer.professional_name}
            </p>
            <p className="truncate text-[13px] font-extrabold leading-5 text-[#007fae] sm:text-sm">
               {formatOfferPrice(offer, locale)}
            </p>
            <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-[11px] leading-4 sm:text-xs">
              <span className="shrink-0 text-[#68778d]">
                 {offerTypeLabel(offer.offer_type, locale)}
              </span>
              {offer.service_label && (
                <>
                  <span aria-hidden="true" className="text-[#c0cad5]">
                    ·
                  </span>
                  <span className="min-w-0 truncate font-semibold text-[#008fc3]">
                    {offer.service_label}
                  </span>
                </>
              )}
            </div>
            {offer.location_label && (
              <p className="truncate text-[11px] leading-4 text-[#68778d] sm:text-xs">
                {offer.location_label}
              </p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

function OfferPreview({
  offer,
  userId,
  currentProfessionalId,
  onEdit,
}: {
  offer: ProfessionalOffer;
  userId: string | null;
  currentProfessionalId: string | null;
  onEdit: () => void;
}) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const before = formatOfferBeforePrice(offer, locale);
  const discount = offerDiscountPercent(offer);
  const isOwner = offer.professional_id === currentProfessionalId;
  return (
    <article className="ccr-marketplace-result-list hidden min-w-0 bg-white p-7 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto">
      <div className="relative">
        <OfferImageGallery images={offer.image_urls} title={offer.title} />
        {discount && (
          <span className="absolute left-3 top-3 rounded-md bg-[#009fd9] px-3 py-1.5 text-sm font-extrabold text-white">
            -{discount}%
          </span>
        )}
      </div>
      <div className="mt-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-extrabold leading-tight">
            {offer.title}
          </h2>
          <p className="mt-1 font-semibold text-[#52627a]">
            {offer.professional_name}
          </p>
        </div>
      </div>
      {isOwner && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex h-11 min-w-0 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:px-5"
          >
            <span className="truncate">{copy.editOffer}</span>
          </button>
                        <Link
                          href={`/dashboard/profesional?mode=offer&tab=offers&offer=${offer.id}`}
                          className="inline-flex h-11 min-w-0 items-center justify-center rounded-lg border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc] sm:px-5"
                        >
                          <span className="truncate sm:hidden">{locale === "es" ? "Administrar" : copy.manageOffer}</span>
                          <span className="hidden truncate sm:inline">{copy.manageOffer}</span>
                        </Link>
                      </div>
                    )}
      <OfferContactActions offer={offer} userId={userId} isOwner={isOwner} />
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <p className="text-2xl font-extrabold text-[#007fae]">
           {formatOfferPrice(offer, locale)}
        </p>
        {before && (
          <p className="pb-1 text-sm font-semibold text-[#8794a7] line-through">
            {before}
          </p>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full border border-[#cbd7e2] px-3 py-1.5 font-bold">
           {offerTypeLabel(offer.offer_type, locale)}
        </span>
        {offer.service_label && (
          <span className="rounded-full border border-[#cbd7e2] px-3 py-1.5 font-bold">
            {offer.service_label}
          </span>
        )}
      </div>
      <p className="mt-6 whitespace-pre-line break-words border-t border-[#e7edf2] pt-6 text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">
        {offer.description}
      </p>
      <div className="mt-5 flex flex-wrap gap-4 text-sm text-[#60708a]">
        {offer.location_label && (
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-4 w-4 text-[#009fd9]" />
            {offer.location_label}
          </span>
        )}
        {offer.valid_until && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-[#009fd9]" />
             {copy.availableUntil}{" "}
             {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CR", { dateStyle: "medium" }).format(
              new Date(`${offer.valid_until}T12:00:00`),
            )}
          </span>
        )}
      </div>
    </article>
  );
}
