"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BadgePercent, ChevronDown, MoreHorizontal, Plus } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { effectiveOfferStatus, formatOfferPrice, OFFER_TYPES, type ProfessionalOffer } from "@/lib/offers";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import type { SelectMenuOption } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import { crTodayISO } from "@/lib/time-cr";

const OFFER_STATES = {
  published: "Publicada",
  paused: "Pausada",
  expired: "Vencida",
  sold_out: "Agotada",
  draft: "Borrador",
} as const;

function statusClass(status: ProfessionalOffer["status"]) {
  if (status === "published") return "bg-[#e8f8f3] text-[#08775c]";
  if (status === "expired" || status === "sold_out") return "bg-[#fff1f2] text-[#be123c]";
  if (status === "paused") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#eef2f6] text-[#60708a]";
}

export function OffersManager({ initialOffers, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=offers", professionalId, serviceOptions = [], onRefresh }: { initialOffers: ProfessionalOffer[]; embedded?: boolean; backHref?: string; professionalId?: string; serviceOptions?: SelectMenuOption[]; onRefresh?: () => void }) {
  const router = useRouter();
  const [offers, setOffers] = useState(initialOffers);
  const [openId, setOpenId] = useState<string | null>(null);
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

  async function updateStatus(id: string, status: ProfessionalOffer["status"]) {
    const { error } = await createClient().from("professional_offers").update({ status }).eq("id", id);
    if (!error) setOffers((current) => current.map((offer) => offer.id === id ? { ...offer, status } : offer));
  }

  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="min-w-0">
            {!embedded && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label="Volver al panel" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">Mis ofertas</h1>
              </div>
            )}
            <p className="text-sm text-[#65758c]">Administra promociones, paquetes y productos.</p>
          </div>
          <>
            <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:inline-flex"><Plus className="h-4 w-4" />Publicar</button>
            <Link href="/ofertas/publicar?from=panel" className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white lg:hidden"><Plus className="h-4 w-4" />Publicar</Link>
          </>
        </div>
        <div className="space-y-3.5">
          {offers.map((offer) => {
            const isOpen = openId === offer.id;
            const imageUrl = offer.image_urls[0];
            const displayStatus = effectiveOfferStatus(offer, crTodayISO());
            return (
              <article key={offer.id} className={cn("relative overflow-visible rounded-2xl border border-[#d9e6ef] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]", actionsOpen === offer.id && "z-40")}>
                <button type="button" onClick={() => setOpenId(isOpen ? null : offer.id)} className="flex w-full items-center gap-3 p-4 text-left sm:gap-4 sm:p-5">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#eaf7fc] text-[#009fd9] sm:h-14 sm:w-14">
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : <div className="grid h-full place-items-center"><BadgePercent className="h-5 w-5" /></div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-extrabold leading-tight text-[#111827] sm:text-base">{offer.title}</h2>
                    <p className="mt-1.5 truncate text-xs font-semibold text-[#65758c]">{OFFER_TYPES[offer.offer_type]} | {formatOfferPrice(offer)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", statusClass(displayStatus))}>{OFFER_STATES[displayStatus]}</span>
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e6edf3] px-4 pb-4 pt-3 sm:px-5 sm:pb-5">
                    {offer.description && <p className="mb-4 line-clamp-3 text-sm leading-6 text-[#52627a]">{offer.description}</p>}
                    <div ref={actionsRef} className="relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2 sm:w-fit sm:grid-cols-[128px_128px_40px]">
                      <Link href={`/ofertas/${offer.id}?from=panel`} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">Ver oferta</Link>
                      <button type="button" onClick={() => setEditingOffer(offer)} className="hidden h-10 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex">Editar</button>
                      <Link href={`/ofertas/${offer.id}/editar?from=panel`} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-xs font-bold text-white transition hover:bg-[#008fc3] lg:hidden">Editar</Link>
                      <div className="relative">
                        <button type="button" onClick={() => setActionsOpen((current) => current === offer.id ? null : offer.id)} aria-label="Más opciones" aria-haspopup="menu" aria-expanded={actionsOpen === offer.id} className="grid h-10 w-10 place-items-center rounded-lg border border-[#d7e1ea] text-[#718096] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb] hover:text-[#162543]"><MoreHorizontal className="h-5 w-5" /></button>
                        {actionsOpen === offer.id && (
                          <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-xl border border-[#dfe8f0] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]">
                            {displayStatus !== "published" && displayStatus !== "expired" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "published"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#008fc3] hover:bg-[#f0f9fc]">Publicar</button>}
                            {displayStatus === "published" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "paused"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">Pausar</button>}
                            {offer.status !== "sold_out" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "sold_out"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] hover:bg-[#f4f8fb]">Marcar agotada</button>}
                            {displayStatus !== "expired" && <button role="menuitem" onClick={() => { setActionsOpen(null); updateStatus(offer.id, "expired"); }} className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 hover:bg-red-50">Marcar vencida</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {offers.length === 0 && <div className="rounded-2xl border border-[#dfe8f0] bg-white px-6 py-14 text-center shadow-[0_2px_8px_rgba(15,23,42,0.05)]"><h2 className="font-bold">Todavía no has publicado ofertas</h2><p className="mt-1 text-sm text-[#68778d]">Crea una oferta para impulsar tus ventas.</p></div>}
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title="Publicar oferta" subtitle="Publica una promoción clara y fácil de comparar." size="xl" bodyClassName="px-5 py-5 sm:px-6">
          <OfferForm professionalId={professionalId} serviceOptions={serviceOptions} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/ofertas/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingOffer && professionalId && (
        <Modal onClose={() => setEditingOffer(null)} title="Editar oferta" subtitle="Actualiza la información de esta publicación." size="xl" bodyClassName="px-5 py-5 sm:px-6">
          <OfferForm key={editingOffer.id} professionalId={professionalId} serviceOptions={serviceOptions} initialOffer={editingOffer} presentation="modal" backHref={backHref} onSaved={() => { setEditingOffer(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
    </div>
  );
}
