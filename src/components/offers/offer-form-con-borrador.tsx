"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { OfferForm } from "@/components/offers/offer-form";
import { AvisoDeBorrador } from "@/components/ui/aviso-de-borrador";
import { leerBorrador } from "@/lib/borrador-sin-sesion";
import type { ProfessionalOffer } from "@/lib/offers";
import type { SelectMenuOption } from "@/components/ui/select-menu";

/** El formulario de promoción, lleno (fotos incluidas) con lo escrito antes de entrar. */
export function OfferFormConBorrador({ professionalId, serviceOptions, backHref, conBorrador }: { professionalId: string | null; serviceOptions: SelectMenuOption[]; backHref: string; conBorrador: boolean }) {
  const locale = useLocale();
  const [listo, setListo] = useState(!conBorrador);
  const [borrador, setBorrador] = useState<{ datos: Partial<ProfessionalOffer>; archivos: File[] } | null>(null);
  useEffect(() => {
    if (!conBorrador) return;
    let vivo = true;
    void leerBorrador<Partial<ProfessionalOffer>>("promocion").then((b) => {
      if (!vivo) return;
      setBorrador(b);
      setListo(true);
    });
    return () => { vivo = false; };
  }, [conBorrador]);
  if (!listo) return <div className="min-h-dvh bg-white" />;
  return (
    <>
      {borrador && professionalId && <AvisoDeBorrador texto={locale === "en" ? "Your promotion was saved. Review it and tap Publish." : "Tu promoción quedó guardada. Revísala y toca Publicar."} />}
      <OfferForm professionalId={professionalId} serviceOptions={serviceOptions} backHref={backHref} initialOffer={borrador?.datos ?? null} initialFiles={borrador?.archivos} />
    </>
  );
}
