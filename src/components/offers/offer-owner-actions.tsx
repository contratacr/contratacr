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
  const locale = marketplaceLocale(useLocale());
  const copy = OWNER_ACTION_COPY[locale];
  const [editing, setEditing] = useState(false);
  const editHref = `/ofertas/${offer.id}/editar${fromPanel ? "?from=panel" : ""}`;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hidden h-11 w-full min-w-0 items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
        >
          <span className="truncate">{copy.edit}</span>
        </button>
        <Link href={editHref} className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-lg bg-[#009fd9] px-3 text-sm font-bold text-white transition hover:bg-[#008fc3] sm:px-4 lg:hidden">
          <span className="truncate">{copy.edit}</span>
        </Link>
        <Link href="/dashboard/profesional?mode=offer&tab=offers" className="inline-flex h-11 w-full min-w-0 items-center justify-center rounded-lg border border-[#b9d9e8] px-3 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc] sm:px-4">
          <span className="truncate sm:hidden">{locale === "es" ? "Administrar" : copy.manage}</span>
          <span className="hidden truncate sm:inline">{copy.manage}</span>
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
