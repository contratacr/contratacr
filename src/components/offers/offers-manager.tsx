"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, ChevronDown, MoreVertical, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { effectiveOfferStatus, formatOfferPrice, type ProfessionalOffer } from "@/lib/offers";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import type { SelectMenuOption } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import { crTodayISO } from "@/lib/time-cr";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { marketplaceLocale, offerTypeLabel } from "@/lib/marketplace-copy";
import { invalidateAppData } from "@/lib/app-data-invalidation";

const OFFERS_MANAGER_COPY = {
  es: {
    back: "Volver al panel",
    title: "Mis ofertas",
    subtitle: "Administra promociones, paquetes y productos.",
    publish: "Publicar",
    view: "Ver oferta",
    edit: "Editar",
    more: "Más opciones",
    pause: "Pausar",
    soldOut: "Marcar agotada",
    expire: "Marcar vencida",
    emptyTitle: "Todavía no has publicado ofertas",
    emptyBody: "Crea una oferta para impulsar tus ventas.",
    publishTitle: "Publicar oferta",
    publishSubtitle: "Publica una promoción clara y fácil de comparar.",
    editTitle: "Editar oferta",
    editSubtitle: "Actualiza la información de esta publicación.",
    statuses: { published: "Publicada", paused: "Pausada", expired: "Vencida", sold_out: "Agotada", draft: "Borrador" },
  },
  en: {
    back: "Back to dashboard",
    title: "My offers",
    subtitle: "Manage promotions, packages and products.",
    publish: "Publish",
    view: "View offer",
    edit: "Edit",
    more: "More options",
    pause: "Pause",
    soldOut: "Mark as sold out",
    expire: "Mark as expired",
    emptyTitle: "You have not published any offers yet",
    emptyBody: "Create an offer to help grow your sales.",
    publishTitle: "Publish offer",
    publishSubtitle: "Publish a clear promotion that is easy to compare.",
    editTitle: "Edit offer",
    editSubtitle: "Update this offer's information.",
    statuses: { published: "Published", paused: "Paused", expired: "Expired", sold_out: "Sold out", draft: "Draft" },
  },
} as const;

function statusClass(status: ProfessionalOffer["status"]) {
  if (status === "published") return "bg-[#e8f8f3] text-[#08775c]";
  if (status === "expired" || status === "sold_out") return "bg-[#fff1f2] text-[#be123c]";
  if (status === "paused") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#eef2f6] text-[#60708a]";
}

export function OffersManager({ initialOffers, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=offers", professionalId, serviceOptions = [], onRefresh }: { initialOffers: ProfessionalOffer[]; embedded?: boolean; backHref?: string; professionalId?: string; serviceOptions?: SelectMenuOption[]; onRefresh?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_MANAGER_COPY[locale];
  const [offers, setOffers] = useState(initialOffers);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("offer"));
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProfessionalOffer | null>(null);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: PointerEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) setActionsOpen(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [actionsOpen]);

  useEffect(() => {
    setOffers(initialOffers);
  }, [initialOffers]);

  useEffect(() => {
    const offerId = searchParams.get("offer");
    if (offerId) setOpenId(offerId);
  }, [searchParams]);

  async function updateStatus(id: string, status: ProfessionalOffer["status"]) {
    const response = await fetch("/api/offers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (response.ok) {
      setOffers((current) => current.map((offer) => offer.id === id ? { ...offer, status } : offer));
      invalidateAppData("offers");
    }
  }

  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {!embedded && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label={copy.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">{copy.title}</h1>
              </div>
            )}
            <p className="text-sm text-[#65758c]">{copy.subtitle}</p>
          </div>
          <>
            <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:inline-flex"><Plus className="h-4 w-4" />{copy.publish}</button>
            <Link href="/ofertas/publicar?from=panel" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:hidden"><Plus className="h-4 w-4" />{copy.publish}</Link>
          </>
        </div>
        <div className="space-y-3.5">
          {offers.map((offer) => {
            const isOpen = openId === offer.id;
            const imageUrl = offer.image_urls[0];
            const displayStatus = effectiveOfferStatus(offer, crTodayISO());
            return (
              <article key={offer.id} className={cn("relative overflow-visible rounded-2xl border border-[#d9e6ef] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]", actionsOpen === offer.id && "z-40")}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : offer.id)} className="relative grid h-28 w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-3 px-4 pr-[116px] text-left sm:h-24 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-4 sm:px-5 sm:pr-[132px]">
                  <div className="grid h-[52px] w-[52px] min-h-0 min-w-0 shrink-0 place-items-center overflow-hidden rounded-lg text-[#009fd9] sm:h-14 sm:w-14">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="block h-full max-h-full w-full max-w-full object-contain object-center" />
                    ) : <div className="grid h-full place-items-center"><BadgePercent className="h-5 w-5" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-extrabold leading-tight text-[#111827] sm:text-base">{offer.title}</h2>
                    {offer.service_label && (
                      <p className="mt-1 line-clamp-2 text-xs font-bold leading-4 text-[#008fc3]" title={offer.service_label}>{offer.service_label}</p>
                    )}
                    <p className="mt-1 flex min-w-0 items-center gap-x-1.5 text-xs font-semibold text-[#65758c]">
                      <span className="min-w-0 truncate">{offerTypeLabel(offer.offer_type, locale)}</span>
                      <span aria-hidden="true" className="shrink-0 text-[#b8c4d1]">·</span>
                      <span className="shrink-0">{formatOfferPrice(offer, locale)}</span>
                    </p>
                  </div>
                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 sm:right-4 sm:gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusClass(displayStatus))}>{copy.statuses[displayStatus]}</span>
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e6edf3] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    {offer.description && <p className="mb-4 whitespace-pre-line break-words text-sm leading-6 text-[#52627a] [overflow-wrap:anywhere]">{offer.description}</p>}
                    <div ref={actionsRef} className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                      <Link href={`/ofertas/${offer.id}?from=panel`} onClick={openInNewTabOnDesktop} className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">{copy.view}</Link>
                      <button type="button" onClick={() => setEditingOffer(offer)} className="hidden h-10 w-full items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">{copy.edit}</button>
                      <Link href={`/ofertas/${offer.id}/editar?from=panel`} className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:hidden">{copy.edit}</Link>
                      <div className="relative">
                        <button type="button" onClick={() => setActionsOpen((current) => current === offer.id ? null : offer.id)} aria-label={copy.more} aria-haspopup="menu" aria-expanded={actionsOpen === offer.id} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7e1ea] text-[#718096] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] hover:text-[#162543]"><MoreVertical className="h-5 w-5" /></button>
                        {actionsOpen === offer.id && (
                          <div role="menu" className="absolute bottom-[calc(100%+6px)] right-0 z-50 w-44 overflow-hidden rounded-xl border border-[#dfe8f0] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">
                            {displayStatus !== "published" && displayStatus !== "expired" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "published"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#008fc3] hover:bg-[#f0f9fc]">{copy.publish}</button>}
                            {displayStatus === "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "paused"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">{copy.pause}</button>}
                            {offer.status !== "sold_out" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "sold_out"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">{copy.soldOut}</button>}
                            {displayStatus !== "expired" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "expired"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50">{copy.expire}</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {offers.length === 0 && <div className="rounded-2xl border border-[#dfe8f0] bg-white px-6 py-14 text-center shadow-[0_2px_8px_rgba(15,23,42,0.05)]"><h2 className="font-bold">{copy.emptyTitle}</h2><p className="mt-1 text-sm text-[#68778d]">{copy.emptyBody}</p></div>}
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title={copy.publishTitle} subtitle={copy.publishSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
          <OfferForm professionalId={professionalId} serviceOptions={serviceOptions} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/ofertas/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingOffer && professionalId && (
        <Modal onClose={() => setEditingOffer(null)} title={copy.editTitle} subtitle={copy.editSubtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
          <OfferForm key={editingOffer.id} professionalId={professionalId} serviceOptions={serviceOptions} initialOffer={editingOffer} presentation="modal" backHref={backHref} onSaved={() => { setEditingOffer(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
    </div>
  );
}
