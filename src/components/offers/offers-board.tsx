"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Mail, MapPin, Menu, Phone, Store } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { useLocale } from "next-intl";
import { MarketplaceFilterChip, MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import { OfferImageGallery } from "@/components/offers/offer-image-gallery";
import { SaveItemButton } from "@/components/saved/save-item-button";
import { formatOfferBeforePrice, formatOfferPrice, OFFER_TYPES, offerDiscountPercent, type ProfessionalOffer } from "@/lib/offers";

type Props = { offers: ProfessionalOffer[]; canPost: boolean; currentProfessionalId?: string | null; currentUserId?: string | null; serviceOptions: Array<{ value: string; label: string }> };

const MARKETPLACE_LIST_CLASS = "ccr-marketplace-result-list min-w-0 overflow-y-auto bg-white lg:max-h-[calc(100vh-190px)] lg:border-r lg:border-[#dfe6ec]";

export function OffersBoard({ offers, canPost, currentProfessionalId = null, currentUserId = null, serviceOptions: publishServiceOptions }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [publishOpen, setPublishOpen] = useState(false);
  const initialLocation = searchParams.get("location")?.trim().toLocaleLowerCase("es-CR") ?? "";
  const [type, setType] = useState("all");
  const [serviceQuery, setServiceQuery] = useState(() => searchParams.get("service")?.trim() ?? "");
  const [published, setPublished] = useState("all");
  const [selectedId, setSelectedId] = useState(() => searchParams.get("offer") ?? offers[0]?.id ?? "");
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
    publishServiceOptions.forEach((option) => unique.set(option.label, option.label));
    offers.forEach((offer) => { const id = offer.service_category_id || offer.service_label; if (id && offer.service_label) unique.set(id, offer.service_label); });
    return [["all", "Todos los servicios"], ...unique.entries()] as Array<[string, string]>;
  }, [offers, publishServiceOptions]);
  const filtered = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("es-CR");
    const serviceNeedle = deferredServiceQuery.trim().toLocaleLowerCase("es-CR");
    return offers.filter((offer) => {
      const matchesQuery = !needle || [offer.title, offer.description, offer.service_label, offer.location_label, offer.professional_name].some((value) => value?.toLocaleLowerCase("es-CR").includes(needle));
      const matchesService = !serviceNeedle || offer.service_label?.toLocaleLowerCase("es-CR").includes(serviceNeedle) || offer.service_category_id?.toLocaleLowerCase("es-CR").includes(serviceNeedle);
      const matchesDate = published === "all" || Date.now() - new Date(offer.created_at).getTime() <= Number(published) * 86_400_000;
      const matchesLocation = !initialLocation || offer.location_label?.toLocaleLowerCase("es-CR").includes(initialLocation);
      return matchesQuery && matchesService && matchesLocation && matchesDate && (type === "all" || offer.offer_type === type);
    });
  }, [deferredQuery, deferredServiceQuery, initialLocation, offers, published, type]);
  const selected = filtered.find((offer) => offer.id === selectedId) ?? filtered[0] ?? null;
  const suggestions = useMemo(() => [...new Set(offers.map((offer) => offer.title).filter(Boolean))], [offers]);
  const serviceSuggestions = useMemo(
    () => serviceOptions.map(([, label]) => label).filter((label) => label !== "Todos los servicios"),
    [serviceOptions],
  );
  const hasActiveFilters = Boolean(query.trim()) || Boolean(serviceQuery.trim()) || type !== "all" || published !== "all";

  useEffect(() => {
    const offerId = searchParams.get("offer");
    if (offerId) setSelectedId(offerId);
  }, [searchParams]);
  function clearSearchAndFilters() {
    setQuery("");
    setType("all");
    setServiceQuery("");
    setPublished("all");
  }

  useEffect(() => {
    if (filtered.length > 0 && !filtered.some((offer) => offer.id === selectedId)) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);


  const renderSearch = () => (
    <MarketplaceSearch
      value={query}
      onChange={setQuery}
      placeholder="¿Qué oferta estás buscando?"
      suggestions={suggestions}
      recentStorageKey="ccr-offer-search-recents"
      secondary={{
        value: serviceQuery,
        onChange: setServiceQuery,
        placeholder: "Servicio",
        ariaLabel: "Servicio",
        suggestions: serviceSuggestions,
      }}
    />
  );

  const renderFilters = () => (
    <>
      <MarketplaceFilterChip label="Fecha" value={published} onChange={setPublished} options={[["all", "Cualquier fecha"], ["1", "Últimas 24 horas"], ["7", "Última semana"], ["30", "Último mes"]]} />
      <MarketplaceFilterChip label="Tipo de oferta" value={type} onChange={setType} options={[["all", "Cualquier tipo"], ...Object.entries(OFFER_TYPES)]} />
    </>
  );
  const renderActions = () => (
    <div className="flex w-full flex-wrap gap-2 sm:w-auto">
      {canPost && (
        <Link href="/dashboard/profesional?mode=offer&tab=offers&returnTo=%2Fofertas" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-[#cddae6] bg-white px-5 text-sm font-bold text-[#162543] transition hover:border-[#b7c8d9] hover:bg-[#f8fafc] sm:flex-none">
          Mis ofertas
        </Link>
      )}
      {canPost ? (
        <>
          <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:inline-flex">
            Publicar oferta
          </button>
          <Link href="/ofertas/publicar" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none lg:hidden">
            Publicar oferta
          </Link>
        </>
      ) : (
        <Link href="/login?redirect=/ofertas/publicar" className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:flex-none">
          Publicar oferta
        </Link>
      )}
    </div>
  );

  return <main className="min-h-[calc(100vh-72px)] overflow-x-hidden bg-white pb-16 text-[#162543] lg:bg-[#f4f7fa]">
    <section className="sticky top-0 z-20 border-b border-[#d5d8dc] bg-white lg:hidden">
      <div className="px-0">
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <button type="button" onClick={() => window.dispatchEvent(new Event("ccr:open-mobile-menu"))} aria-label="Abrir menú" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543] transition hover:bg-[#eef5f9]">
            <Menu className="h-7 w-7" strokeWidth={2.5} />
          </button>
          <h1 className="truncate text-center text-[21px] font-extrabold text-[#162543]">Ofertas</h1>
        </div>
        <div className="px-4 pb-3">
          {renderSearch()}
        </div>
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-4">
          {renderFilters()}
        </div>
      </div>
    </section>
    <MarketplaceNavbarPortal>
    <section className="hidden h-full bg-transparent lg:block">
      <div className="flex h-full w-full items-center py-2">
        <div className="w-full">
          {renderSearch()}
        </div>
      </div>
    </section>
    </MarketplaceNavbarPortal>
    <div className="mx-auto flex max-w-7xl justify-end px-4 py-3 sm:px-6 lg:hidden">
      {renderActions()}
    </div>

    <div className="mx-auto hidden max-w-7xl items-end justify-between gap-4 px-6 pt-3 lg:flex">
      <div>
        <h1 className="text-2xl font-extrabold">Ofertas</h1>
        <p className="text-sm text-[#68778d]">Promociones de profesionales</p>
      </div>
      <div className="flex shrink-0 gap-2">{renderActions()}</div>
    </div>

    
    <div className="relative z-30 mx-auto hidden max-w-7xl px-6 pt-3 lg:block">
      <div className="flex flex-wrap items-center gap-2 overflow-visible">
        {renderFilters()}
      </div>
    </div>

    <div className="mx-auto max-w-7xl px-0 sm:px-6 sm:py-5 lg:pt-3">
      <div className="lg:grid lg:max-h-[calc(100vh-190px)] lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)] lg:overflow-hidden lg:rounded-lg lg:border lg:border-[#dfe8f0] lg:bg-white">
      <section className={MARKETPLACE_LIST_CLASS}>
        <div className="border-b border-[#e7edf2] px-4 py-3"><p className="font-bold">{filtered.length} {filtered.length === 1 ? "oferta" : "ofertas"}</p><p className="text-xs text-[#68778d]">Costa Rica</p></div>
        <div>
          {filtered.map((offer) => <OfferRow key={offer.id} offer={offer} selected={selected?.id === offer.id} userId={currentUserId} currentProfessionalId={currentProfessionalId} onSelect={() => setSelectedId(offer.id)} />)}
          {filtered.length === 0 && (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-7 py-12 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]">
                <Store className="h-6 w-6" strokeWidth={2} />
              </span>
              <h2 className="mt-4 text-lg font-extrabold text-[#162543]">
                {hasActiveFilters ? "No encontramos resultados" : "Todavía no hay ofertas"}
              </h2>
              <p className="mt-1.5 max-w-xs text-sm leading-6 text-[#68778d]">
                {hasActiveFilters
                  ? "Prueba con otra búsqueda o restablece los filtros."
                  : "Las nuevas promociones de profesionales aparecerán aquí."}
              </p>
              {hasActiveFilters ? (
                <button type="button" onClick={clearSearchAndFilters} className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
                  Ver todas las ofertas
                </button>
              ) : canPost ? (
                <Link href="/ofertas/publicar" className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white transition hover:bg-[#008fc3]">
                  Publicar la primera oferta
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </section>
      {selected && <OfferPreview offer={selected} userId={currentUserId} currentProfessionalId={currentProfessionalId} />}
      </div>
    </div>
  {publishOpen && currentProfessionalId && (
    <Modal onClose={() => setPublishOpen(false)} title="Publicar oferta" subtitle="Publica una promoción clara y fácil de comparar." size="lg" bodyClassName="px-5 py-5 sm:px-6">
      <OfferForm professionalId={currentProfessionalId} serviceOptions={publishServiceOptions} presentation="modal" backHref="/ofertas" onSaved={(id) => { setPublishOpen(false); router.push(`/ofertas/${id}`); }} />
    </Modal>
  )}
  </main>;
}

function OfferImage({ offer, large = false }: { offer: ProfessionalOffer; large?: boolean }) {
  const extraCount = Math.max(0, offer.image_urls.length - 1);
  return <div className={`${large ? "aspect-[16/8] w-full" : "h-14 w-14 shrink-0"} relative overflow-hidden rounded-lg bg-[#f3f7fa]`}>{offer.image_urls[0] ? <img src={offer.image_urls[0]} alt={offer.title} className={`h-full w-full ${large ? "object-cover" : "object-contain p-1"}`} /> : <span className="grid h-full place-items-center text-xs font-extrabold text-[#009fd9]">{offer.title.slice(0, 2).toUpperCase()}</span>}{extraCount > 0 && <span className="absolute bottom-1 right-1 rounded-full bg-[#162543]/85 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">+{extraCount}</span>}</div>;
}

function offerSaveSnapshot(offer: ProfessionalOffer) {
  return {
    title: offer.title,
    professional_name: offer.professional_name,
    professional_slug: offer.professional_slug,
    image_url: offer.image_urls[0] ?? null,
    service_label: offer.service_label,
    offer_type: offer.offer_type,
    location_label: offer.location_label,
    price: formatOfferPrice(offer),
    created_at: offer.created_at,
  };
}

export function OfferContactActions({ offer, userId, isOwner, compact = false }: { offer: ProfessionalOffer; userId: string | null; isOwner: boolean; compact?: boolean }) {
  const locale = useLocale();
  const whatsapp = offer.professional_whatsapp?.trim();
  const callPhone = (offer.professional_call_phone || offer.professional_whatsapp || "").replace(/\D/g, "");
  const email = offer.professional_contact_email?.trim();
  const showCall = !!offer.professional_allow_phone_call && callPhone.length >= 8;
  const showEmail = !!email;
  const hasActions = !!whatsapp || showCall || showEmail;
  if (isOwner || !hasActions) return null;

  function requireAuth() {
    if (userId) return true;
    const redirect = typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : "/ofertas";
    window.location.assign(`/${locale}/login?redirect=${encodeURIComponent(redirect)}`);
    return false;
  }

  function track(method: "phone" | "email") {
    trackInteraction({
      type: method === "phone" ? "phone_click" : "external_link_click",
      professionalId: offer.professional_id,
      source: "unknown",
      locale,
      metadata: method === "email" ? { channel: "email", offerId: offer.id } : { offerId: offer.id },
    });
  }

  const secondaryClass = compact
    ? "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#dfe6ec] bg-white px-2 text-[12px] font-bold text-[#162543] transition hover:bg-[#f8fafc]"
    : "inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-[#dfe6ec] bg-white px-3 text-sm font-bold text-[#162543] transition hover:bg-[#f8fafc]";

  return (
    <div className={`relative z-[2] mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
      {whatsapp && (
        <DirectChatLauncher
          professionalId={offer.professional_id}
          professionalName={offer.professional_name || "Profesional"}
          contextTitle={offer.title}
          analyticsSource="unknown"
          className={`${compact ? "h-9 text-[12px]" : "h-10 text-sm"} w-full rounded-full font-bold`}
        />
      )}
      {showCall && (
        <a
          href={`tel:+${callPhone.startsWith("506") ? callPhone : `506${callPhone}`}`}
          onClick={(event) => {
            if (!requireAuth()) { event.preventDefault(); return; }
            track("phone");
          }}
          className={secondaryClass}
        >
          <Phone className="h-4 w-4 shrink-0" />
          <span className="truncate">Llamar</span>
        </a>
      )}
      {showEmail && (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent("Consulta desde ContrataCR")}&body=${encodeURIComponent(`Hola, vi tu oferta \"${offer.title}\" en ContrataCR y me gustaría recibir más información.`)}`}
          onClick={(event) => {
            if (!requireAuth()) { event.preventDefault(); return; }
            track("email");
          }}
          className={secondaryClass}
        >
          <Mail className="h-4 w-4 shrink-0" />
          <span className="truncate">Correo</span>
        </a>
      )}
    </div>
  );
}
function OfferRow({ offer, selected, userId, currentProfessionalId, onSelect }: { offer: ProfessionalOffer; selected: boolean; userId: string | null; currentProfessionalId: string | null; onSelect: () => void }) {
  const discount = offerDiscountPercent(offer);
  const isOwner = offer.professional_id === currentProfessionalId;
  return <article className={`relative overflow-hidden border-b border-[#dfe6ec] bg-white px-4 py-3 transition last:border-b-0 hover:bg-[#f8fafc] ${selected ? "lg:bg-[#eef9fd] shadow-[inset_4px_0_0_#162543]" : ""}`}><button type="button" onClick={onSelect} aria-label={`Ver ${offer.title}`} className="absolute inset-0 hidden lg:block" /><Link href={`/ofertas/${offer.id}`} className="relative z-[1] block lg:pointer-events-none"><div className="flex gap-3"><OfferImage offer={offer} /><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h2 className="line-clamp-2 flex-1 text-[15px] font-extrabold leading-tight text-[#005eaa] lg:text-base">{offer.title}</h2>{discount && <span className="shrink-0 rounded-md bg-[#009fd9] px-2 py-1 text-[10px] font-extrabold text-white">-{discount}%</span>}</div><p className="mt-0.5 truncate text-sm font-semibold text-[#101d35]">{offer.professional_name}</p><p className="mt-0.5 text-sm font-extrabold text-[#007fae]">{formatOfferPrice(offer)}</p><div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs"><span className="shrink-0 text-[#68778d]">{OFFER_TYPES[offer.offer_type]}</span>{offer.service_label && <><span aria-hidden="true" className="text-[#c0cad5]">·</span><span className="min-w-0 font-semibold text-[#008fc3]">{offer.service_label}</span></>}</div>{offer.location_label && <p className="mt-1 line-clamp-2 text-xs leading-4 text-[#68778d]">{offer.location_label}</p>}</div>{!isOwner && <SaveItemButton itemType="offer" itemId={offer.id} snapshot={offerSaveSnapshot(offer)} userId={userId} loginRedirect={`/ofertas/${offer.id}`} className="relative z-[2] -mr-1 -mt-1 shrink-0" />}</div></Link></article>;
}

function OfferPreview({ offer, userId, currentProfessionalId }: { offer: ProfessionalOffer; userId: string | null; currentProfessionalId: string | null }) {
  const before = formatOfferBeforePrice(offer);
  const discount = offerDiscountPercent(offer);
  const isOwner = offer.professional_id === currentProfessionalId;
  return <article className="ccr-marketplace-result-list hidden min-w-0 bg-white p-7 lg:block lg:max-h-[calc(100vh-190px)] lg:overflow-y-auto"><div className="relative"><OfferImageGallery images={offer.image_urls} title={offer.title} />{discount && <span className="absolute left-3 top-3 rounded-md bg-[#009fd9] px-3 py-1.5 text-sm font-extrabold text-white">-{discount}%</span>}</div><div className="mt-5 flex items-start justify-between gap-4"><div className="min-w-0"><h2 className="text-2xl font-extrabold leading-tight">{offer.title}</h2><p className="mt-1 font-semibold text-[#52627a]">{offer.professional_name}</p></div>{!isOwner && <SaveItemButton itemType="offer" itemId={offer.id} snapshot={offerSaveSnapshot(offer)} userId={userId} loginRedirect={`/ofertas/${offer.id}`} withLabel />}</div><OfferContactActions offer={offer} userId={userId} isOwner={isOwner} /><div className="mt-5 flex flex-wrap items-end gap-3"><p className="text-2xl font-extrabold text-[#007fae]">{formatOfferPrice(offer)}</p>{before && <p className="pb-1 text-sm font-semibold text-[#8794a7] line-through">{before}</p>}</div><div className="mt-3 flex flex-wrap gap-2 text-sm"><span className="rounded-full border border-[#cbd7e2] px-3 py-1.5 font-bold">{OFFER_TYPES[offer.offer_type]}</span>{offer.service_label && <span className="rounded-full border border-[#cbd7e2] px-3 py-1.5 font-bold">{offer.service_label}</span>}</div><p className="mt-6 whitespace-pre-line break-words border-t border-[#e7edf2] pt-6 text-sm leading-7 text-[#43536b] [overflow-wrap:anywhere]">{offer.description}</p><div className="mt-5 flex flex-wrap gap-4 text-sm text-[#60708a]">{offer.location_label && <span className="inline-flex items-center gap-1.5"><MapPin className="h-4 w-4 text-[#009fd9]" />{offer.location_label}</span>}{offer.valid_until && <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-[#009fd9]" />Disponible hasta {new Intl.DateTimeFormat("es-CR", { dateStyle: "medium" }).format(new Date(`${offer.valid_until}T12:00:00`))}</span>}</div></article>;
}
