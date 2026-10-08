"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { VerifiedSeal } from "@/components/ui/verified-seal";

/**
 * Al publicar un empleo o una promoción sin la cédula verificada (8-oct-2026):
 * la publicación sale igual, pero sin «✓ Cédula verificada», y aquí se dice
 * antes de publicar, con el camino a la sección de verificación —que tiene
 * «Contactar soporte» para quien el padrón no cubre—.
 *
 * Va al final del formulario, justo antes del botón: es cuando importa. Y no
 * pinta nada mientras no sabe, para no parpadear a quien sí está verificado.
 */
export function AvisoSinVerificar({ professionalId, que }: { professionalId: string | null; que: "empleo" | "promocion" }) {
  const t = useTranslations("avisoSinVerificar");
  const [sinVerificar, setSinVerificar] = useState(false);
  useEffect(() => {
    if (!professionalId) return;
    let vigente = true;
    void createClient().from("professionals").select("verification_status").eq("id", professionalId).maybeSingle().then(({ data }) => {
      if (vigente && data && data.verification_status !== "verified") setSinVerificar(true);
    });
    return () => { vigente = false; };
  }, [professionalId]);
  if (!sinVerificar) return null;
  return (
    <div data-aviso-sin-verificar className="mt-5 flex items-start gap-3 rounded-xl border border-[#d9ecf6] bg-[#f3fbff] px-4 py-3">
      <VerifiedSeal className="mt-0.5 h-4 w-4 shrink-0 text-[#9aa5b4]" />
      <div className="min-w-0 text-[13px] leading-snug text-[#3d4b5f]">
        <p>{t(que)}</p>
        <Link
          href="/dashboard/profesional?tab=profile&mode=offer&focus=verification"
          className="mt-1 inline-flex items-center gap-0.5 font-bold text-[#007fae] hover:underline"
        >
          {t("accion")}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
