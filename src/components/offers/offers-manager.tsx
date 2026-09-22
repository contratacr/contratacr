"use client";
import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";

import { AutoSaveHint, useAvisoDeGuardado } from "@/components/dashboard/auto-save-hint";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useEffect, useRef, useState } from "react";
import { useNativeApp } from "@/hooks/use-native-app";
import { ArrowLeft, BadgePercent, ChevronDown, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { effectiveOfferStatus, formatOfferPrice, type ProfessionalOffer } from "@/lib/offers";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { PanelEmptyState } from "@/components/ui/content-loading";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { OfferForm } from "@/components/offers/offer-form";
import type { SelectMenuOption } from "@/components/ui/select-menu";
import { cn } from "@/lib/utils";
import { StatusFilterTabs, PUBLICACION_ESTADO_TABS, publicacionBucket, sinFiltros } from "@/components/dashboard/status-filter-tabs";
import { crTodayISO } from "@/lib/time-cr";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { marketplaceLocale, offerTypeLabel } from "@/lib/marketplace-copy";
import { invalidateAppData } from "@/lib/app-data-invalidation";

const OFFERS_MANAGER_COPY = {
  es: {
    back: "Volver al panel",
    title: "Mis promociones",
    subtitle: "Promociones y descuentos para atraer clientes.",
    publish: "Publicar promoción",
    view: "Ver promoción",
    edit: "Editar",
    more: "Más opciones",
    close: "Cerrar promoción", republish: "Volver a publicar", remove: "Eliminar", removeTitle: "¿Eliminar esta promoción?", removeBody: "Se borra del todo y no se puede recuperar.", removeCancel: "Cancelar",
    emptyTitle: "Todavía no has publicado ofertas",
    emptyBody: "Crea una oferta para impulsar tus ventas.",
    publishTitle: "Publicar promoción",
    publishSubtitle: "Publica una promoción clara y fácil de comparar.",
    editTitle: "Editar promoción",
    editSubtitle: "Actualiza la información de esta publicación.",
  },
  en: {
    back: "Back to dashboard",
    title: "My promotions",
    subtitle: "Deals and discounts to attract clients.",
    publish: "Post offer",
    view: "View offer",
    edit: "Edit",
    more: "More options",
    close: "Close promotion", republish: "Publish again", remove: "Delete", removeTitle: "Delete this promotion?", removeBody: "It is removed for good and cannot be recovered.", removeCancel: "Cancel",
    emptyTitle: "You have not published any offers yet",
    emptyBody: "Create an offer to help grow your sales.",
    publishTitle: "Publish offer",
    publishSubtitle: "Publish a clear promotion that is easy to compare.",
    editTitle: "Edit offer",
    editSubtitle: "Update this offer's information.",
  },
} as const;

// UN color por significado, no un color por estado: azul de marca = está vivo
// ahora; gris = pasó o está en pausa; rojo = SOLO lo que salió mal (cancelado,
// no seleccionado). Un empleo cerrado suele ser el final feliz — pintarlo de
// rojo lo hacía leer como error, y con todo de colores el color deja de decir.

export function OffersManager({ initialOffers, embedded = false, backHref = "/dashboard/profesional?mode=offer&tab=offers", professionalId, serviceOptions = [], onRefresh }: { initialOffers: ProfessionalOffer[]; embedded?: boolean; backHref?: string; professionalId?: string; serviceOptions?: SelectMenuOption[]; onRefresh?: () => void }) {
  const nativeApp = useNativeApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = marketplaceLocale(useLocale());
  const copy = OFFERS_MANAGER_COPY[locale];
  const [offers, setOffers] = useState(initialOffers);
  const [openId, setOpenId] = useState<string | null>(() => searchParams.get("offer"));
  const [publishOpen, setPublishOpen] = useState(false);
  const [editingOffer, setEditingOffer] = useState<ProfessionalOffer | null>(null);


  const [etapa, setEtapa] = useState("activas");
  // Con pocos elementos no hay etapas dibujadas: la lista sale entera.
  const visibles = sinFiltros(offers.length) ? offers : offers.filter((item) => publicacionBucket(item.status) === etapa);
  // A status changed here must survive a server re-render that was started
  // before the change committed (quick pause → publish on a slow network);
  // the local status wins until the server snapshot agrees with it.
  const pendingStatus = useRef<Record<string, ProfessionalOffer["status"]>>({});
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOffers(initialOffers.map((item) => {
      const pending = pendingStatus.current[item.id];
      if (!pending) return item;
      if (item.status === pending) {
        delete pendingStatus.current[item.id];
        return item;
      }
      return { ...item, status: pending };
    })));
    return () => cancelAnimationFrame(frame);
  }, [initialOffers]);

  useEffect(() => {
    const offerId = searchParams.get("offer");
    if (!offerId) return;
    const frame = requestAnimationFrame(() => setOpenId(offerId));
    return () => cancelAnimationFrame(frame);
  }, [searchParams]);

  const { dialogNode, confirm, showMessage } = useAppDialog();
  const aviso = useAvisoDeGuardado();

  // Solo lo que ya no está publicado se puede eliminar, y se pregunta antes:
  // no hay forma de recuperarlo.
  async function eliminar(id: string) {
    const result = await confirm({ title: copy.removeTitle, description: copy.removeBody, confirmLabel: copy.remove, cancelLabel: copy.removeCancel, tone: "danger" });
    if (!result.confirmed) return;
    let response!: Response;
    await aviso.correr(async () => { response = await fetch(`/api/offers?id=${encodeURIComponent(id)}`, { method: "DELETE" }); return response.ok; });
    if (!response.ok) {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      await showMessage({ title: copy.remove, description: data?.error ?? "" });
      return;
    }
    setOffers((current) => current.filter((fila) => fila.id !== id));
    invalidateAppData("offers");
  }

  async function updateStatus(id: string, status: ProfessionalOffer["status"]) {
    // Se guarda en el momento, así que se confirma a la vista (ver AutoSaveHint).
    await aviso.correr(async () => {
      const response = await fetch("/api/offers", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
      if (response.ok) {
        pendingStatus.current[id] = status;
        setOffers((current) => current.map((offer) => offer.id === id ? { ...offer, status } : offer));
        invalidateAppData("offers");
      }
      return response.ok;
    });
  }

  return (
    <div className={embedded ? "text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] px-4 py-6 text-[#162543] sm:px-6 sm:py-10"}>
      <div className={embedded ? "w-full" : "mx-auto max-w-4xl"}>
        <div className="mb-5 flex flex-col gap-4">
          <div className="min-w-0">
            {!embedded && !nativeApp && (
              <div className="mb-1.5 flex items-center gap-2">
                <Link href={backHref} aria-label={copy.back} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[#162543] hover:bg-white">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <h1 className="truncate text-2xl font-bold">{copy.title}</h1>
              </div>
            )}
          </div>
          {/* Cabecera de la sección: el contexto a la izquierda y la acción a la
              derecha, la misma fila que en Mis proyectos y en Soporte. */}
          <SectionHeadline subtitulo={copy.subtitle}>
              {offers.length > 0 && (<>
              <button type="button" onClick={() => setPublishOpen(true)} className="hidden h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 lg:flex"><Plus className="h-4 w-4" />{copy.publish}</button>
              <Link href="/ofertas/publicar?from=panel" className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 lg:hidden max-sm:[&>svg]:hidden"><Plus className="h-4 w-4" />{copy.publish}</Link>
              </>)}
          </SectionHeadline>
        </div>
        {/* Filtro y lista en el mismo bloque y con la misma separación que en
            Mis proyectos: pegado a las tarjetas parecía parte de la primera.
            Las etapas siguen la misma regla: con pocos elementos no se dibujan
            y la lista sale entera. */}
        <div className="flex flex-col gap-3.5">
        <StatusFilterTabs
          tabs={PUBLICACION_ESTADO_TABS}
          value={etapa}
          onChange={setEtapa}
          counts={{
            activas: offers.filter((item) => publicacionBucket(item.status) === "activas").length,
            cerradas: offers.filter((item) => publicacionBucket(item.status) === "cerradas").length,
          }}
          totalElementos={offers.length}
        />
        <div className="flex flex-col gap-3.5">
          {visibles.map((offer) => {
            const isOpen = openId === offer.id;
            const imageUrl = offer.image_urls[0];
            const displayStatus = effectiveOfferStatus(offer, crTodayISO());
            return (
              <article key={offer.id} className="relative overflow-visible rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
                <button type="button" onClick={() => setOpenId(isOpen ? null : offer.id)} className="relative grid h-28 w-full grid-cols-[52px_minmax(0,1fr)] items-center gap-3 px-4 pr-11 text-left sm:h-24 sm:grid-cols-[56px_minmax(0,1fr)] sm:gap-4 sm:px-5 sm:pr-12">
                  {/* La misma caja que Mis proyectos y Favoritos: antes el icono
                      iba suelto, sin fondo, y la fila no se parecía a las de al
                      lado. SIN RELIEVE: en una lista, diez degradados con
                      sombra pesan más que el contenido, y la tarjeta ya tiene
                      su propia elevación —dos relieves anidados se ven sucios.
                      Es la misma regla que ya seguía Notificaciones. El
                      degradado se reserva para donde el icono es protagonista:
                      un vacío, un diálogo, una tarjeta de portada.
                      Y con LOGO dentro la caja va blanca con filo fino: la
                      imagen es contenido, no una pastilla del app. */}
                  <div className={cn("grid h-[52px] w-[52px] min-h-0 min-w-0 shrink-0 place-items-center overflow-hidden rounded-xl sm:h-14 sm:w-14", imageUrl ? "ccr-caja-imagen" : "ccr-caja-icono-plana")}>
                    {imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl} alt="" className="block h-full max-h-full w-full max-w-full object-contain object-center" />
                    ) : <BadgePercent className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* El estado como ANTETÍTULO, igual que en Postulaciones: en su
                        pastilla a la derecha obligaba a reservarle ancho fijo a TODAS
                        las tarjetas, tuviera la palabra corta o larga, y ese ancho se
                        lo quitaba al título. Arriba no compite con nada y se lee
                        primero, que es lo que uno busca al recorrer la lista. */}
                    {/* Sin rotulo de estado, como en Empleos y Proyectos: la
                        pestana «Inactivas» ya lo dice y solo hay «Cerrar». */}
                    <h2 className="mt-0.5 line-clamp-2 text-[15px] font-extrabold leading-tight text-[#162543] sm:text-base">{offer.title}</h2>
                    {offer.service_label && (
                      <p className="mt-1 line-clamp-2 text-xs font-bold leading-4 text-[#008fc3]" title={offer.service_label}>{offer.service_label}</p>
                    )}
                    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold text-[#65758c]">
                      <span className="min-w-0 whitespace-nowrap">{offerTypeLabel(offer.offer_type, locale)}</span>
                      <span className="whitespace-nowrap">{formatOfferPrice(offer, locale)}</span>
                    </p>
                  </div>
                  <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 sm:right-4 sm:gap-2">
                    <ChevronDown className={cn("h-5 w-5 text-[#6b7b90] transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-[#e5e7eb] px-4 pb-5 pt-3 sm:px-5">
                    {offer.description && <p className="mb-4 whitespace-pre-line break-words text-sm leading-6 text-[#52627a] [overflow-wrap:anywhere]">{offer.description}</p>}
                                        {/* EDITAR ES LA ACCIÓN DE ESTA FILA, y va en azul lleno:
                        «Ver» solo mira, el «···» guarda lo de cambiar de estado,
                        y editar es a lo que se viene cuando se abre una
                        publicación propia. La misma fila en las tres secciones. */}
                    <div data-offer-actions={offer.id} className="ccr-acciones-tarjeta relative grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] gap-2">
                      <Link href={`/ofertas/${offer.id}?from=panel`} onClick={openInNewTabOnDesktop} className="inline-flex h-10 w-full items-center justify-center rounded-full border border-[#d7e1ea] px-3 text-xs font-bold text-[#162543]">{copy.view}</Link>
                      <button type="button" onClick={() => setEditingOffer(offer)} className="hidden h-10 w-full items-center justify-center rounded-full bg-[#009FD9] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0089bb] lg:inline-flex">{copy.edit}</button>
                      <Link href={`/ofertas/${offer.id}/editar?from=panel`} className="inline-flex h-10 w-full items-center justify-center rounded-full bg-[#009FD9] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0089bb] lg:hidden">{copy.edit}</Link>
                      {/* LAS MISMAS DOS OPCIONES QUE EN EMPLEOS Y PROYECTOS.
                          Eran TRES para cerrar —pausar, marcar agotada, marcar
                          vencida— y las tres hacian lo mismo: sacarla del
                          tablero y mandarla a «Inactivas», de donde vuelve con
                          «Volver a publicar». La unica diferencia era la
                          palabra que el dueno leia en su tarjeta, y obligaba a
                          elegir entre tres sinonimos. «Vencida» ademas se
                          calcula SOLA por la fecha de validez, asi que
                          marcarla a mano era repetir lo que el sistema ya
                          hace. */}
                      <CardActionsMenu
                        label={copy.more}
                        triggerClassName="h-10 w-10 border-[#d7e1ea]"
                        actions={displayStatus === "published"
                          ? [
                              { label: copy.close, destructive: true, onClick: () => updateStatus(offer.id, "expired") },
                            ]
                          : [
                              { label: copy.republish, primary: true, onClick: () => updateStatus(offer.id, "published") },
                              { label: copy.remove, destructive: true, onClick: () => void eliminar(offer.id) },
                            ]}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
          {offers.length === 0 && (
            // El MISMO vacío del resto del app, ya no una copia a mano.
            <PanelEmptyState
              icon={BadgePercent}
              title={copy.emptyTitle}
              description={copy.emptyBody}
              action={(<>
                <Button type="button" size="crear" onClick={() => setPublishOpen(true)} className="hidden lg:inline-flex">{copy.publishTitle}</Button>
                <Button asChild size="crear" className="lg:hidden"><Link href="/ofertas/publicar?from=panel">{copy.publishTitle}</Link></Button>
              </>)}
            />
          )}
        </div>
        </div>
      </div>
      {publishOpen && professionalId && (
        <Modal onClose={() => setPublishOpen(false)} title={copy.publishTitle} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
          <OfferForm onCancel={() => setPublishOpen(false)} professionalId={professionalId} serviceOptions={serviceOptions} presentation="modal" backHref={backHref} onSaved={(id) => { setPublishOpen(false); onRefresh?.(); router.push(`/ofertas/${id}?from=panel`); }} />
        </Modal>
      )}
      {editingOffer && professionalId && (
        <Modal onClose={() => setEditingOffer(null)} title={copy.editTitle} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
          <OfferForm onCancel={() => setEditingOffer(null)} key={editingOffer.id} professionalId={professionalId} serviceOptions={serviceOptions} initialOffer={editingOffer} presentation="modal" backHref={backHref} onSaved={() => { setEditingOffer(null); onRefresh?.(); router.refresh(); }} />
        </Modal>
      )}
      {dialogNode}
      <AutoSaveHint {...aviso.estado} />
    </div>
  );
}
