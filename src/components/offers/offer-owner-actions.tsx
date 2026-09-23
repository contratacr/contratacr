"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import type { ProfessionalOffer } from "@/lib/offers";
import type { SelectMenuOption } from "@/components/ui/select-menu";
import { marketplaceLocale } from "@/lib/marketplace-copy";

const OWNER_ACTION_COPY = {
  // `editCorto`: el rótulo que va en MEDIA columna. «Editar promoción» no cabe
  // ahí y salía como «Editar promo…», que no es un botón, es un acertijo. La
  // pantalla ya dice de qué es: al lado está «Administrar», también en corto.
  es: { edit: "Editar promoción", editCorto: "Editar", manage: "Administrar promoción", manageCorto: "Administrar", subtitle: "Actualiza la información de esta publicación." },
  en: { edit: "Edit promotion", editCorto: "Edit", manage: "Manage promotion", manageCorto: "Manage", subtitle: "Update this promotion's information." },
} as const;

type Props = {
  offer: ProfessionalOffer;
  professionalId: string;
  serviceOptions: SelectMenuOption[];
  fromPanel?: boolean;
};

export function OfferOwnerActions({ offer, professionalId, serviceOptions, fromPanel = false }: Props) {
  const router = useRouter();
  const locale = marketplaceLocale(useLocale());
  const copy = OWNER_ACTION_COPY[locale];
  const [editing, setEditing] = useState(false);
  const editHref = `/ofertas/${offer.id}/editar${fromPanel ? "?from=panel" : ""}`;

  return (
    <>
      {/* DOS ACCIONES, UNA A CADA LADO. Eran tres —editar, administrar y copiar
          enlace— y por eso editar iba a lo ancho arriba; al mudarse compartir
          al «···», administrar se quedó huérfano en media columna y la fila
          parecía cortada. Con dos, cada una toma su mitad y siguen
          distinguiéndose por el color. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hidden h-11 w-full min-w-0 items-center justify-center rounded-full bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
        >
          <span className="truncate">{copy.editCorto}</span>
        </button>
        <Link href={editHref} className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:px-4 lg:hidden">
          <span className="truncate">{copy.editCorto}</span>
        </Link>
        <Link href="/dashboard/profesional?mode=offer&tab=offers" className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc] sm:px-4">
          {/* Siempre en corto: comparte fila con «Editar», y «Administrar
              promoción» no cabe en media columna. Sale de la tabla de copy
              —como en Empleos y Proyectos— y no escrito a mano aquí. */}
          <span className="truncate">{copy.manageCorto}</span>
        </Link>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title={copy.edit} subtitle={copy.subtitle} size="lg" bodyClassName="bg-[#f4f7fa] px-0 py-0">
          <OfferForm
            onCancel={() => setEditing(false)}
            professionalId={professionalId}
            serviceOptions={serviceOptions}
            initialOffer={offer}
            presentation="modal"
            backHref={`/ofertas/${offer.id}`}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        </Modal>
      )}
    </>
  );
}
