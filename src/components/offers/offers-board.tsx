"use client";

import { conFiltroDeFecha } from "@/lib/marketplace/filtros-por-volumen";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { cn } from "@/lib/utils";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { cldLarge, cldThumb } from "@/lib/cloudinary";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, MapPin, Menu, Store } from "lucide-react";
import { ContrataCRMark, HeaderAccountLink, HeaderMessagesLink, HeaderNotificationsLink } from "@/components/landing/landing-navbar";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useDirectMessageUnread } from "@/hooks/use-direct-message-unread";
import { Link } from "@/i18n/navigation";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { useLocale } from "next-intl";
import { useNativeApp } from "@/hooks/use-native-app";
import {
  MarketplaceFilterChip,
  MarketplaceNavbarPortal,
  MarketplaceSearch,
} from "@/components/marketplace/marketplace-controls";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import { OfferImageGallery } from "@/components/offers/offer-image-gallery";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { offerSaveSnapshot } from "@/lib/offer-snapshot";
import { enlaceOferta } from "@/lib/marketplace-url";
import {
  formatOfferBeforePrice,
  formatOfferPrice,
  offerDiscountPercent,
  OFFER_TYPES,
  type ProfessionalOffer,
} from "@/lib/offers";
import { ScrollRail } from "@/components/ui/scroll-rail";
import { MenuOferta } from "@/components/offers/menu-oferta";
import {
  marketplaceLocale,
  offerTypeLabel,
  type MarketplaceLocale,
} from "@/lib/marketplace-copy";
import { CABECERA_BOTON, CABECERA_FILA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";
import { useAvisoPerfilProfesional } from "@/components/marketplace/use-aviso-perfil-profesional";

type Props = {
  offers: ProfessionalOffer[];
  canPost: boolean;
  currentProfessionalId?: string | null;
  currentUserId?: string | null;
  serviceOptions: Array<{ value: string; label: string }>;
};

// Sin línea de cierre abajo: separaba la lista blanca del lienzo gris, y el
// lienzo del teléfono ya es blanco, así que quedaba una raya suelta después de
// la última fila.
const MARKETPLACE_LIST_CLASS =
  "ccr-marketplace-card-list ccr-lista-tablero min-w-0 bg-white lg:h-full lg:overflow-y-scroll";

const OFFERS_COPY = {
  es: {
    location: "Ubicación",
    searchPlaceholder: "¿Qué promoción buscas?",
    service: "Servicio",
    servicePlaceholder: "Servicio",
    date: "Fecha",
    anyDate: "Cualquier fecha",
    last24Hours: "Últimas 24 horas",
    lastWeek: "Última semana",
    lastMonth: "Último mes",
    offerType: "Tipo de promoción",
    anyType: "Cualquier tipo",
    myOffers: "Mis promociones",
    publishOffer: "Publicar promoción",
    offers: "Promociones",
    promotions: "Promociones de profesionales",
    openMenu: "Abrir menú",
    messages: "Mensajes",
    notifications: "Notificaciones",
    offer: "promoción",
    offerPlural: "promociones",
    country: "Costa Rica",
    noResults: "No encontramos promociones",
    noOffers: "Todavía no hay promociones",
    tryAgain: "Prueba otra búsqueda o cambia los filtros.",
    futureOffers: "Las nuevas promociones de profesionales aparecerán aquí.",
    viewAll: "Ver todas las promociones",
    publishFirst: "Publicar la primera promoción",
    publishSubtitle: "Publica una promoción clara y fácil de comparar.",
    editOffer: "Editar promoción",
    editSubtitle: "Actualiza la información de esta publicación.",
    manageOffer: "Administrar promoción",
    professional: "Profesional",
    profile: "Ver perfil",
    call: "Llamar",
    view: (title: string) => `Ver ${title}`,
    availableUntil: "Disponible hasta",
  },
  en: {
    location: "Location",
    searchPlaceholder: "Search promotions",
    service: "Service",
    servicePlaceholder: "Service",
    date: "Date posted",
    anyDate: "Any date",
    last24Hours: "Past 24 hours",
    lastWeek: "Past week",
    lastMonth: "Past month",
    offerType: "Promotion type",
    anyType: "Any type",
    myOffers: "My promotions",
    publishOffer: "Post a promotion",
    offers: "Promotions",
    promotions: "Promotions from professionals",
    openMenu: "Open menu",
    messages: "Messages",
    notifications: "Notifications",
    offer: "promotion",
    offerPlural: "promotions",
    country: "Costa Rica",
    noResults: "No promotions found",
    noOffers: "There are no promotions yet",
    tryAgain: "Try another search or change the filters.",
    futureOffers: "New promotions from professionals will appear here.",
    viewAll: "View all promotions",
    publishFirst: "Post the first promotion",
    publishSubtitle: "Post a clear promotion that is easy to compare.",
    editOffer: "Edit promotion",
    editSubtitle: "Update this offer's information.",
    manageOffer: "Manage promotion",
    professional: "Professional",
    profile: "View profile",
    call: "Call",
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
  const { avisoNode, avisar } = useAvisoPerfilProfesional();
  const { cabeceraRef, conLinea } = useHairlineOnScroll();
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const mensajesSinLeer = useDirectMessageUnread();
  const nativeApp = useNativeApp();
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
  // Los dos filtros de producción: tipo de promoción y fecha. Ver la nota en
  // Empleos: se fueron junto con los chips de servicio y no debían.
  const [tipo, setTipo] = useState("all");
  const [published, setPublished] = useState("all");
  const [ahora, setAhora] = useState(0);
  useEffect(() => { queueMicrotask(() => setAhora(Date.now())); }, []);
  const [selectedId, setSelectedId] = useState(
    () => searchParams.get("offer") ?? offers[0]?.id ?? "",
  );
  const deferredQuery = useDeferredValue(query);

  // Sin sesión, los avisos llevan a la pantalla de acceso y de ahí a su destino.
  const accesoHref = (destino: string) => `/login?redirect=${encodeURIComponent(`/${locale}${destino}`)}`;

  useEffect(() => {
    if (!nativeApp) return;
    console.info("[native-debug] offers-board-mounted", {
      offers: offers.length,
      canPost,
      currentUserId: currentUserId ? "present" : "none",
      selectedId,
      href: window.location.href,
    });
  }, [canPost, currentUserId, nativeApp, offers.length, selectedId]);


  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const cleanQuery = query.trim();
      if (cleanQuery) params.set("q", cleanQuery);
      else params.delete("q");
      // La ubicación también viaja en la dirección: así un enlace compartido
      // abre con el mismo lugar puesto.
      const cleanLocation = locationFilter.trim();
      if (cleanLocation) params.set("location", cleanLocation);
      else params.delete("location");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState(null, "", nextUrl);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [locationFilter, query]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("es-CR");
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
      const matchesLocation =
        !locationFilter ||
        offer.location_label
          ?.toLocaleLowerCase("es-CR")
          .includes(locationFilter);
      const edad = ahora - new Date(offer.created_at).getTime();
      const matchesDate = published === "all" || (ahora > 0 && edad <= Number(published) * 86_400_000);
      const matchesType = tipo === "all" || offer.offer_type === tipo;
      return matchesQuery && matchesLocation && matchesDate && matchesType;
    });
  }, [
    ahora,
    deferredQuery,
    locationFilter,
    offers,
    published,
    tipo,
  ]);

  const selected =
    filtered.find((offer) => offer.id === selectedId) ?? filtered[0] ?? null;
  const suggestions = useMemo(
    () => [...new Set(offers.map((offer) => offer.title).filter(Boolean))],
    [offers],
  );
  const hasActiveFilters = Boolean(query.trim()) || Boolean(locationFilter) || tipo !== "all" || published !== "all";

  useEffect(() => {
    const offerId = searchParams.get("offer");
    if (offerId) queueMicrotask(() => setSelectedId(offerId));
  }, [searchParams]);
  function clearSearchAndFilters() {
    setQuery("");
    setLocationFilter("");
    setTipo("all");
    setPublished("all");
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
      queueMicrotask(() => setSelectedId(filtered[0].id));
  }, [filtered, selectedId]);

  const locationSuggestions = useMemo(
    () => [...new Set(offers.map((offer) => offer.location_label?.trim()).filter((v): v is string => Boolean(v)))],
    [offers],
  );

  const renderSearch = () => (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder={copy.searchPlaceholder}
      suggestions={suggestions}
      recentStorageKey="ccr-offer-search-recents"
      visitSurface="ofertas"
      // Misma pareja que en /buscar y en Empleos: texto + ubicación. Nada de
      // chips de servicio debajo: el buscador ya encuentra la promoción por su
      // nombre y la ubicación es lo que de verdad falta para decidir.
      secondary={{
        value: locationFilter,
        onChange: setLocationFilter,
        placeholder: copy.location,
        ariaLabel: copy.location,
        suggestions: locationSuggestions,
        icon: "location",
        clearLabel: locale === "en" ? "Clear location" : "Limpiar ubicación",
      }}
    />
  );

  // «Tipo de promoción» se retira: sus opciones —Servicio en promoción,
  // Producto, Paquete— son vocabulario de quien publica, no de quien busca, y
  // nadie que llega nuevo sabe en cuál está lo que necesita. Lo que de verdad
  // se busca es el servicio, y para eso está el buscador.
  const hayFiltros = conFiltroDeFecha(offers.length);
  const renderFilters = () => (
    <>
      {conFiltroDeFecha(offers.length) && (
        <MarketplaceFilterChip
          label={copy.date}
          value={published}
          onChange={setPublished}
          options={[["all", copy.anyDate], ["1", copy.last24Hours], ["7", copy.lastWeek], ["30", copy.lastMonth]]}
        />
      )}
    </>
  );
  const renderActions = () => (
    <div className={canPost ? "grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center [&>*]:w-full sm:[&>*]:w-auto" : "flex w-full sm:w-auto"}>
      {canPost && (
        <Link
          href="/dashboard/profesional?mode=offer&tab=offers&returnTo=%2Fofertas"
          className="inline-flex h-9 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-3 text-[13px] font-bold text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] lg:h-11 lg:whitespace-nowrap lg:px-5 lg:text-sm"
        >
          {copy.myOffers}
        </Link>
      )}
      {canPost ? (
        <>
          <button
            type="button"
            onClick={() => setPublishOpen(true)}
            className="hidden h-11 items-center justify-center whitespace-nowrap rounded-full bg-[#009fd9] px-6 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
          >
            {copy.publishOffer}
          </button>
          <Link
            href="/ofertas/publicar"
            className="inline-flex h-9 items-center justify-center rounded-full bg-[#009fd9] px-3 text-[13px] font-bold text-white transition hover:bg-[#008fc3] lg:hidden"
          >
            {copy.publishOffer}
          </Link>
        </>
      ) : currentUserId ? (
        // Ver la nota de Empleos: con sesión y sin perfil profesional se
        // explica qué falta, no se manda al login.
        <button type="button" onClick={() => void avisar("promocion", "/ofertas/publicar")} className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[#009fd9] px-4 text-[13px] font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:h-10 lg:px-5 lg:text-sm">
          {copy.publishOffer}
        </button>
      ) : (
        <Link
          href="/login?redirect=/ofertas/publicar"
          className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-[#009fd9] px-4 text-[13px] font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:h-10 lg:px-5 lg:text-sm"
        >
          {copy.publishOffer}
        </Link>
      )}
    </div>
  );

  return (
    <main className="ccr-tablero-fijo min-h-[calc(100vh-72px)] overflow-x-clip bg-white pb-0 text-[#162543] sm:bg-[#fafafa] sm:pb-16 lg:flex lg:h-[calc(100dvh-64px)] lg:min-h-0 lg:flex-col lg:overflow-hidden lg:bg-white lg:pb-0">
      {avisoNode}
      <section ref={cabeceraRef} className={cn("ccr-cabecera-pegada ccr-marketplace-sticky sticky top-0 z-20 border-b bg-white transition-colors duration-200 lg:hidden", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
        <div className="px-0">
          <div className={CABECERA_FILA}>
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(new Event("ccr:open-mobile-menu"))
              }
              aria-label={copy.openMenu}
              className={CABECERA_BOTON}
            >
              <Menu className={CABECERA_GLIFO} strokeWidth={2.5} />
            </button>
            <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
              <ContrataCRMark />
            </Link>
            <h1 className={CABECERA_TITULO}>{copy.offers}</h1>
            {/* El icono de Mensajes es de la barra de la APP: en la web se llega
                desde el menú y desde el panel. */}
            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              {currentUserId ? (
                <>
                  {nativeApp && <HeaderMessagesLink unreadCount={mensajesSinLeer} label={copy.messages} />}
                  <NotificationBell scope="all" />
                </>
              ) : (
                <>
                  {nativeApp && <HeaderMessagesLink unreadCount={0} label={copy.messages} href={accesoHref("/mensajes")} />}
                  {/* En la web, sin sesión va la cuenta; la campana queda para quien ya entró. */}
                {nativeApp ? <HeaderNotificationsLink href={accesoHref("/notificaciones")} label={copy.notifications} /> : <HeaderAccountLink />}
                </>
              )}
            </div>
          </div>
          <div className="px-4 pb-3">{renderSearch()}</div>
          {hayFiltros && <ScrollRail className="ccr-chip-row flex gap-1 px-4 pb-3 sm:gap-1.5">{renderFilters()}</ScrollRail>}
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
      {/* Título, acciones y filtros en UNA tarjeta blanca (ver jobs-board). */}
      <div className="relative z-30 hidden shrink-0 border-b border-[#e5e7eb] bg-white lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-2.5">
                      {/* SIN RAYA ENTRE EL TÍTULO Y LOS FILTROS. Separaba dos cosas que
                no compiten: el nombre de la sección es texto y los filtros son
                pastillas con contorno, así que ya se distinguen solos. Era
                además la única raya vertical del app —todo lo demás separa en
                horizontal o con aire— y el aire que ya hay basta. */}
<div className="flex shrink-0 items-baseline gap-2 pr-4">
            {/* El nombre de la pantalla, a la vista: antes era solo para lectores
                de pantalla y la barra arrancaba en frío con los filtros —quien
                llegaba de Google no sabía en qué sección estaba—.
                EL CONTEO SOLO CUANDO DICE ALGO: «cuántos quedaron» tras buscar o
                filtrar. Sin filtros es el inventario entero, un dato que no le
                sirve a nadie y que le compite al título; en el teléfono ya se
                hacía así y en computadora no. Y la raya divisoria solo si hay
                filtros al otro lado: sin ellos separaba el título de la nada. */}
            <h1 className="text-[17px] font-extrabold text-[#162543]">{copy.offers}</h1>
            {hasActiveFilters && filtered.length > 0 && (
              <span className="text-[13px] font-semibold text-[#68778d]">
                <span className="tabular-nums">{filtered.length}</span> {filtered.length === 1 ? copy.offer : copy.offerPlural}{locationFilter.trim() ? ` · ${locationFilter.trim()}` : ""}
              </span>
            )}
          </div>
          {hayFiltros && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 overflow-visible">{renderFilters()}</div>}
          <div className="flex shrink-0 gap-2">{renderActions()}</div>
        </div>
      </div>

      <div className="ccr-tablero-cuerpo mx-auto w-full max-w-7xl px-0 sm:max-w-[46rem] sm:px-6 sm:py-5 lg:max-w-7xl lg:flex-1 lg:min-h-0 lg:px-6 lg:py-0">
        <div className={`ccr-tablero-marco ${filtered.length > 0 ? "lg:grid lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] xl:grid-cols-[380px_minmax(0,1fr)]" : ""} sm:overflow-hidden sm:rounded-[22px] sm:border sm:border-[#e5e7eb] sm:bg-white sm:shadow-[0_12px_34px_-28px_rgba(15,23,42,0.55)] lg:h-full ccr-panel-tablero`}>
          <section className={filtered.length > 0 ? MARKETPLACE_LIST_CLASS : "min-w-0 bg-white"}>
            {/* Con cero, el vacío ya lo dice: «0 promociones» encima era lo mismo dos veces. */}
            {hasActiveFilters && filtered.length > 0 && (
              <div className="border-b border-[#e5e7eb] px-4 py-3 lg:hidden">
                <p className="font-bold">
                  {filtered.length} {filtered.length === 1 ? copy.offer : copy.offerPlural}
                </p>
                {locationFilter.trim() && <p className="text-xs text-[#68778d]">{locationFilter.trim()}</p>}
              </div>
            )}
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
                // El MISMO vacío del resto del app: este tenía el mosaico
                // copiado a mano y se salía de la tarjeta compartida.
                // En computadora la lista ocupa el alto entero de la pantalla:
                // con el vacío midiendo sus 20rem de siempre, el aviso quedaba
                // arriba de una losa blanca enorme y parecía que la página se
                // había cortado. Ocupando el alto disponible se centra, que es
                // lo que hace que un vacío se lea como una respuesta y no como
                // un error de dibujo.
                <PanelEmptyState
                  className="lg:min-h-full"
                  plano
                  icon={Store}
                  title={hasActiveFilters ? copy.noResults : copy.noOffers}
                  description={hasActiveFilters ? copy.tryAgain : copy.futureOffers}
                  action={hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearSearchAndFilters}
                      className="inline-flex items-center justify-center rounded-full border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]"
                    >
                      {copy.viewAll}
                    </button>
                  ) : canPost ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setPublishOpen(true)}
                        className="hidden items-center justify-center rounded-full bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
                      >
                        {copy.publishFirst}
                      </button>
                      <Link
                        href="/ofertas/publicar"
                        className="inline-flex items-center justify-center rounded-full bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden"
                      >
                        {copy.publishFirst}
                      </Link>
                    </>
                  ) : null}
                />
              )}
            </div>
          </section>
          {selected && (
            <OfferPreview
              onFiltrarServicio={setQuery}
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
         
          size="lg"
          bodyClassName="bg-[#f4f7fa] px-0 py-0"
        >
          <OfferForm
            onCancel={() => setPublishOpen(false)}
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
         
          size="lg"
          bodyClassName="bg-[#f4f7fa] px-0 py-0"
        >
          <OfferForm
            onCancel={() => setEditingOffer(null)}
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
        <ProgressiveImage
          src={cldLarge(offer.image_urls[0], 640)}
          alt={offer.title}
          fit="cover"
          wrapperClassName="block h-full max-h-full w-full max-w-full rounded-lg"
          className="rounded-lg"
        />
      ) : offer.professional_avatar_url ? (
        // Sin arte propio, la cara de quien la ofrece: 250 de 290 profesionales
        // tienen foto, y dice mucho más que dos letras del título. La foto del
        // profesional NO se agrega cuando la promoción sí trae su imagen: ahí
        // manda el arte, que es lo que se compra con los ojos.
        <ProgressiveImage
          src={cldThumb(offer.professional_avatar_url, 160)}
          alt={offer.professional_name ?? ""}
          fit="cover"
          wrapperClassName="block h-full max-h-full w-full max-w-full rounded-lg"
          className="rounded-lg"
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


export function OfferSaveButton({
  offer,
  userId,
  pastilla = false,
  className = "",
}: {
  offer: ProfessionalOffer;
  userId: string | null;
  /** Con marco, para acompañar al botón de contacto. */
  pastilla?: boolean;
  className?: string;
}) {
  const locale = marketplaceLocale(useLocale());
  return (
    <SaveItemButton
      itemType="offer"
      itemId={offer.id}
      snapshot={offerSaveSnapshot(offer, locale)}
      userId={userId}
      loginRedirect={`/ofertas/${offer.id}`}
      withLabel={pastilla}
      sutil={!pastilla}
      className={`shrink-0 ${className}`}
    />
  );
}

export function OfferContactActions({
  offer,
  userId,
  isOwner,
  compact = false,
  soloContacto = false,
  escritorio = false,
}: {
  offer: ProfessionalOffer;
  userId: string | null;
  isOwner: boolean;
  compact?: boolean;
  /** En la ficha la franja de abajo lleva solo lo que contacta; guardar sube al «...». */
  soloContacto?: boolean;
  /** El panel de computadora: WhatsApp a la izquierda y Guardar a la derecha. */
  escritorio?: boolean;
}) {
  const locale = marketplaceLocale(useLocale());
  const nativeApp = useNativeApp();
  const copy = OFFERS_COPY[locale];
  const hasWhatsapp = !!offer.professional_has_whatsapp;
  const showPrimaryContact = nativeApp || hasWhatsapp;
  if (isOwner) return null;

  // En la franja pegada al fondo los botones miden 48 px, lo mismo que
  // «Publicar» en Crear proyecto; en la lista siguen midiendo 44 (o 36 en la
  // fila apretada). Es la misma franja en todas las secciones.
  const alto = compact ? "h-9" : soloContacto || escritorio ? "h-12" : "h-11";
  // Ver la nota de Empleos: en la franja, el botón de «Publicar».
  const letra = compact ? "text-[12px] font-bold" : soloContacto || escritorio ? "text-base font-semibold" : "text-sm font-bold";
  const secondaryClass = `w-full ${alto} ${letra} rounded-full border border-[#d7e1ea] bg-white ${compact ? "px-2" : "px-3"} text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]`;
  // Llamar y escribir no piden cuenta, igual que el WhatsApp de al lado: exigir
  // registro para contactar costaba tres de cada cuatro contactos, y aquí
  // además quedaba raro que un botón dejara pasar y el de al lado no. Lo que sí
  // se protege es el dato: el número NO baja con la página, se pide al tocar por
  // /api/contact/reveal, que lleva tope por hora.
  //
  // El correo se retiró: en dos meses hubo 86 toques a WhatsApp, 4 a «Llamar» y
  // CERO al correo, con 92 profesionales que tienen uno puesto.
  const escribir = showPrimaryContact && (
    <DirectChatLauncher
      professionalId={offer.professional_id}
      professionalName={offer.professional_name || copy.professional}
      contextTitle={offer.title}
      analyticsSource="unknown"
      offerId={offer.id}
      className={`${alto} ${letra} w-full rounded-full`}
    />
  );
  // En la ficha: escribir y llamar, uno a cada lado, y nada más. Guardar no
  // contacta a nadie y vive arriba, junto al «...».
  if (escritorio) {
    // Ver la nota de Empleos: en computadora no se llama, se guarda. Los dos a
    // su ancho, en un solo renglón: desde que el «···» subió a la línea del
    // nombre, la fila de acciones solo lleva esto y ya no hace falta apilar.
    return (
      <>
        {/* LOS DOS COMPARTEN EL RENGLÓN, a su mitad cada uno. A su ancho
            natural sumaban 317 px en una fila de 314 —medido—, así que se
            pasaban por tres píxeles y el segundo caía debajo del primero. Con
            `flex-1 basis-0` no depende de cuánto mida el rótulo ni de lo ancha
            que sea la fila: siempre uno a la izquierda y otro a la derecha. */}
        {showPrimaryContact && (
          <DirectChatLauncher
            professionalId={offer.professional_id}
            professionalName={offer.professional_name || copy.professional}
            contextTitle={offer.title}
            analyticsSource="unknown"
            offerId={offer.id}
            className="h-12 min-w-fit flex-1 basis-0 rounded-full px-3 text-base font-semibold"
          />
        )}
        <SaveItemButton grande className="min-w-fit flex-1 basis-0 px-3" itemType="offer" itemId={offer.id} snapshot={offerSaveSnapshot(offer, locale)} userId={userId} />
      </>
    );
  }
  if (soloContacto) {
    // Escribir a la izquierda, llamar a la derecha: dos acciones, un renglón.
    return (
      <div className="relative z-[2] grid w-full grid-cols-1 gap-2">{escribir}</div>
    );
  }
  // UNO A LA IZQUIERDA Y OTRO A LA DERECHA. Antes WhatsApp se llevaba la línea
  // entera y debajo iba «lo secundario»: eso se escribió cuando eran TRES
  // —WhatsApp, Llamar y Guardar— y apilarlos habría dado tres píldoras iguales.
  // Al retirarse «Llamar» quedaron dos, que es justo lo que el reparto en una
  // línea resuelve mejor: la ficha gana alto y las dos acciones se ven juntas.
  return (
    <div className="relative z-[2] mt-3 flex items-stretch gap-2">
      {escribir && <div className="min-w-fit flex-1 basis-0">{escribir}</div>}
      <OfferSaveButton offer={offer} userId={userId} pastilla className={`${secondaryClass} min-w-fit flex-1 basis-0`} />
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
      className={`relative overflow-hidden border-b border-[#e5e7eb] bg-white px-3 py-2 transition sm:max-lg:last:border-b-0 hover:bg-[#f8fafc] sm:px-4 sm:py-2.5 ${selected ? "lg:bg-[#eef9fd] lg:shadow-[inset_4px_0_0_#162543]" : ""}`}
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
              <h2 className="min-w-0 flex-1 line-clamp-2 text-[14px] font-extrabold leading-5 text-[#005eaa] sm:text-[15px] lg:text-base">
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
            {/* En computadora, un solo azul por fila: el del título, que es lo
                que se abre. El precio va en azul marino y fuerte —es dinero—, y
                tipo, servicio y lugar comparten un renglón gris. */}
            <p className="truncate text-[13px] font-extrabold leading-5 text-[#007fae] sm:text-sm lg:text-[#162543]">
               {formatOfferPrice(offer, locale)}
            </p>
            <p className="hidden truncate text-xs leading-4 text-[#68778d] lg:block">
              {offerTypeLabel(offer.offer_type, locale)}
              {offer.service_label && <><span aria-hidden="true" className="mx-1.5 text-[#c0cad5]">·</span>{offer.service_label}</>}
              {offer.location_label && <><span aria-hidden="true" className="mx-1.5 text-[#c0cad5]">·</span>{offer.location_label}</>}
            </p>
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-4 sm:text-xs lg:hidden">
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
              <p className="truncate text-[11px] leading-4 text-[#68778d] sm:text-xs lg:hidden">
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
  onFiltrarServicio,
}: {
  offer: ProfessionalOffer;
  userId: string | null;
  currentProfessionalId: string | null;
  onEdit: () => void;
  /** Tocar el servicio en azul deja en el tablero solo ese servicio. */
  onFiltrarServicio?: (servicio: string) => void;
}) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_COPY[locale];
  const before = formatOfferBeforePrice(offer, locale);
  const discount = offerDiscountPercent(offer);
  const isOwner = offer.professional_id === currentProfessionalId;
  // El orden del panel, el de las tiendas en computadora (Facebook Marketplace,
  // Mercado Libre, Amazon): la FOTO a la izquierda y, a su lado, qué es,
  // cuánto cuesta y qué se puede hacer. Así la foto manda —en una promoción es
  // lo que vende— sin empujar WhatsApp y Guardar debajo del pliegue, que es lo
  // que pasaba con la foto arriba a lo ancho: medía media pantalla.
  // Con el panel angosto (menos de 1280 px) no caben lado a lado: la foto va
  // arriba, más baja, y el resumen debajo.
  return (
    <article className="relative ccr-marketplace-result-list hidden min-w-0 bg-white p-7 lg:block lg:h-full lg:overflow-y-auto">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] xl:items-start">
        <div className="relative">
          <OfferImageGallery images={offer.image_urls} title={offer.title} className="[&_img]:max-h-[320px] xl:[&_img]:aspect-square xl:[&_img]:max-h-[560px]" />
          {discount && (
            <span className="absolute left-3 top-3 rounded-md bg-[#009fd9] px-3 py-1.5 text-sm font-extrabold text-white">
              -{discount}%
            </span>
          )}
        </div>
        <div className="min-w-0">
          {/* Quién publica va PRIMERO y, al final de esa misma línea, el «···»
              con compartir adentro —el orden de LinkedIn—. El nombre es la
              entrada al perfil: un botón "Ver perfil" aparte competía con el
              contacto y decía lo mismo. */}
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              {offer.professional_slug ? (
                <Link
                  href={`/profesionales/${offer.professional_slug}?from=${encodeURIComponent(`/ofertas/${offer.id}`)}`}
                  className="inline-flex max-w-full items-center gap-1 font-semibold text-[#005eaa] hover:underline"
                >
                  <span className="min-w-0 truncate">{offer.professional_name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0" />
                </Link>
              ) : (
                <p className="truncate font-semibold text-[#52627a]">
                  {offer.professional_name}
                </p>
              )}
            </div>
            {/* Compartir vive dentro del «···»: ver la nota de la ficha de un empleo. */}
            <MenuOferta
              grande
              className="-my-2.5 -mr-2 shrink-0"
              ofertaId={offer.id}
              titulo={offer.title}
              enlace={enlaceOferta(offer)}
              profesionalNombre={offer.professional_name || copy.professional}
              profesionalSlug={offer.professional_slug}
              esPropia={isOwner}
            />
          </div>
          <h2 className="mt-0.5 text-2xl font-extrabold leading-tight">
            {offer.title}
          </h2>
          <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-sm leading-5">
            <span className="text-[#68778d]">{offerTypeLabel(offer.offer_type, locale)}</span>
            {offer.service_label && (
              <>
                <span aria-hidden="true" className="text-[#c0cad5]">·</span>
                {/* Salía en azul de enlace y no hacía nada. Ahora filtra. */}
                <button type="button" onClick={() => onFiltrarServicio?.(offer.service_label ?? "")} className="font-semibold text-[#008fc3] hover:underline">{offer.service_label}</button>
              </>
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <p className="text-2xl font-extrabold text-[#007fae]">
              {formatOfferPrice(offer, locale)}
            </p>
            {before && (
              <p className="pb-1 text-sm font-semibold text-[#8794a7] line-through">
                {before}
              </p>
            )}
          </div>

          {/* Las acciones, junto al precio. Con la foto arriba (panel angosto)
              la fila se queda pegada arriba del panel al bajar. */}
          <div style={{ top: -28 }} className="sticky z-10 -mx-7 mt-4 flex flex-wrap items-center gap-2 border-b border-[#eef2f6] bg-white px-7 py-3 xl:static xl:mx-0 xl:border-0 xl:px-0">
            {isOwner ? (
              <>
                <button
                  type="button"
                  onClick={onEdit}
                  className="inline-flex h-12 items-center justify-center rounded-full bg-[#009fd9] px-6 text-base font-semibold text-white transition hover:bg-[#008fc3]"
                >
                  {copy.editOffer}
                </button>
                <Link
                  href={`/dashboard/profesional?mode=offer&tab=offers&offer=${offer.id}`}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-[#b9d9e8] px-6 text-base font-semibold text-[#007fae] transition hover:bg-[#f1f9fc]"
                >
                  {copy.manageOffer}
                </Link>
              </>
            ) : (
              <OfferContactActions offer={offer} userId={userId} isOwner={false} escritorio />
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 text-sm text-[#60708a]">
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
                {new Intl.DateTimeFormat(locale === "en" ? "en-US" : "es-CR", { day: "numeric", month: "long", year: "numeric" }).format(
                  new Date(`${offer.valid_until}T12:00:00`),
                )}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="mt-6 whitespace-pre-line break-words border-t border-[#eef2f6] pt-6 text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">
        {offer.description}
      </p>
    </article>
  );
}
