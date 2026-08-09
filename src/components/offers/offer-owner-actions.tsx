"use client";

import { useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { Modal } from "@/components/ui/modal";
import { OfferForm } from "@/components/offers/offer-form";
import type { ProfessionalOffer } from "@/lib/offers";
import type { SelectMenuOption } from "@/components/ui/select-menu";

type Props = {
  offer: ProfessionalOffer;
  professionalId: string;
  serviceOptions: SelectMenuOption[];
  fromPanel?: boolean;
};

export function OfferOwnerActions({ offer, professionalId, serviceOptions, fromPanel = false }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const editHref = `/ofertas/${offer.id}/editar${fromPanel ? "?from=panel" : ""}`;

  return (
    <>
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="hidden h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:inline-flex"
        >
          Editar oferta
        </button>
        <Link href={editHref} className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#009fd9] px-4 text-sm font-bold text-white transition hover:bg-[#008fc3] lg:hidden">
          Editar oferta
        </Link>
        <Link href="/dashboard/profesional?mode=offer&tab=offers" className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-[#b9d9e8] px-4 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
          Administrar oferta
        </Link>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)} title="Editar oferta" subtitle="Actualiza la información de esta publicación." size="lg" bodyClassName="px-5 py-5 sm:px-6">
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
