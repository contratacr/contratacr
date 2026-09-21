"use client";

import { useState } from "react";
import { BotonCompartir } from "@/components/ui/boton-compartir";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import type { ProfessionalOffer } from "@/lib/offers";
import type { SelectMenuOption } from "@/components/ui/select-menu";
import { marketplaceLocale } from "@/lib/marketplace-copy";

const OWNER_ACTION_COPY = {
  es: { edit: "Editar promoción", manage: "Administrar promoción", subtitle: "Actualiza la información de esta publicación." },
  en: { edit: "Edit offer", manage: "Manage offer", subtitle: "Update this offer's information." },
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
      {/* UNO ARRIBA Y DOS ABAJO. Tres botones del mismo ancho apilados no
          dicen cuál importa: el color es la única diferencia. Con el principal
          a lo ancho y los dos secundarios en pareja, la jerarquía se ve sin
          leer, y es la misma forma que ya tiene la fila de acciones de las
          tarjetas del panel. */}
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="col-span-2 hidden h-11 w-full min-w-0 items-center justify-center rounded-full bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
        >
          <span className="truncate">{copy.edit}</span>
        </button>
        <Link href={editHref} className="col-span-2 inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:px-4 lg:hidden">
          <span className="truncate">{copy.edit}</span>
        </Link>
        <Link href="/dashboard/profesional?mode=offer&tab=offers" className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-full border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc] sm:px-4">
          {/* Siempre en corto: comparte fila con «Copiar enlace», y
              «Administrar promoción» no cabe en media columna. */}
          <span className="truncate">{locale === "es" ? "Administrar" : "Manage"}</span>
        </Link>
        {/* COMPARTIR, CON LOS DEMÁS. En la ficha de otro, compartir va arriba
            en círculo y la pila de abajo queda para lo que contacta; pero esta
            es la ficha PROPIA: no hay a quién contactar y esta columna es toda
            de acciones sobre la publicación, que es donde compartir
            pertenece. Escondido en el «···» no lo encontraba nadie, y es lo
            primero que uno quiere hacer con algo recién publicado. En el
            teléfono ocupa las dos columnas: los otros dos ya van en pareja. */}
        <BotonCompartir url={`/ofertas/${offer.id}`} titulo={offer.title} className="h-11 w-full min-w-0 whitespace-nowrap px-3 [&>svg]:hidden" />
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
