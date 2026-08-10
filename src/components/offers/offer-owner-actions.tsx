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
  es: { edit: "Editar oferta", manage: "Administrar oferta", subtitle: "Actualiza la información de esta publicación." },
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
  const copy = OWNER_ACTION_COPY[marketplaceLocale(useLocale())];
  const [editing, setEditing] = useState(false);
  const editHref = `/ofertas/${offer.id}/editar${fromPanel ? "?from=panel" : ""}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hidden h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
        >
          {copy.edit}
        </button>
        <Link href={editHref} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
          {copy.edit}
        </Link>
        <Link href="/dashboard/profesional?mode=offer&tab=offers" className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#b9d9e8] px-4 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
          {copy.manage}
        </Link>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title={copy.edit} subtitle={copy.subtitle} size="lg" bodyClassName="px-5 py-5 sm:px-6">
          <OfferForm
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
