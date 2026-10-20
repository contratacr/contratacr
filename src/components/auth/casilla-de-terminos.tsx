"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * LA CASILLA DE ACEPTACIÓN DE TÉRMINOS, ÚNICA EN TODO EL APP.
 *
 * Los dos registros —el del cliente y el del profesional— mostraban los
 * términos como una frase suelta («Al crear tu cuenta aceptas…»). Apple pidió
 * por escrito, en la regla 1.2, que el usuario ACEPTE («require that users
 * agree to terms»), y que el video de revisión muestre ese acuerdo antes de
 * registrarse. Una frase informativa se puede leer de las dos maneras; una
 * casilla que hay que marcar, no.
 *
 * Es una casilla y no un `FilaInterruptor`: el interruptor es para prender y
 * apagar algo que ya existe, y esto es un consentimiento que se da una vez.
 *
 * Los enlaces abren las pantallas legales DENTRO del app: en la revisión de
 * Apple, mandar a Safari a leer los términos fue su propio motivo de rechazo
 * (regla 4).
 */
export function CasillaDeTerminos({
  aceptado,
  onCambio,
  className,
  reuseRecordedAcceptance = false,
}: {
  aceptado: boolean;
  onCambio: (valor: boolean) => void;
  className?: string;
  reuseRecordedAcceptance?: boolean;
}) {
  const t = useTranslations("terminosCasilla");
  const locale = useLocale();
  const { user } = useAuth();
  const [confirmedUserId, setConfirmedUserId] = useState<string | null>(null);
  useEffect(() => {
    if (!reuseRecordedAcceptance || !user?.id) return;
    const controller = new AbortController();
    fetch("/api/privacy/choices", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted && data?.requiresAcceptance === false) setConfirmedUserId(user.id); })
      .catch(() => {});
    return () => controller.abort();
  }, [reuseRecordedAcceptance, user?.id]);
  const alreadyRecorded = reuseRecordedAcceptance && !!user?.id && confirmedUserId === user.id;
  useEffect(() => { if (alreadyRecorded && !aceptado) onCambio(true); }, [alreadyRecorded, aceptado, onCambio]);
  if (alreadyRecorded) return null;


  return (
    // Sin tarjeta ni borde: una casilla no es una sección. Encerrarla en un
    // contenedor la hacía pesar más que el campo de contraseña que tiene
    // encima, y competía con el botón. Es la forma en que la muestran las apps
    // de hoy: la marca, el texto, y nada más.
    <label className={cn("flex w-full cursor-pointer items-start gap-2.5 text-left", className)}>
      <input
        type="checkbox"
        checked={aceptado}
        onChange={(e) => onCambio(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
          aceptado ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#b9c8d6] bg-white",
        )}
      >
        {aceptado && <Check className="h-3 w-3" strokeWidth={3.5} />}
      </span>
      <span className="text-[12.5px] leading-[18px] text-[#68778d]">
        {t.rich("texto", {
          terms: (c) => (
            <Link href="/terminos" locale={locale as "es" | "en"} className="font-semibold text-[#0089bb]">
              {c}
            </Link>
          ),
          privacy: (c) => (
            <Link href="/privacidad" locale={locale as "es" | "en"} className="font-semibold text-[#0089bb]">
              {c}
            </Link>
          ),
        })}
      </span>
    </label>
  );
}
