"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";

/**
 * PEDIR UNA RESEÑA EN GOOGLE, EN EL ÚNICO MOMENTO EN QUE ALGUIEN LA DARÍA.
 *
 * La gente entra, busca, contacta y se va: nadie se queda a dejarnos una
 * reseña, y una sección para eso la vería nadie. El único instante en que
 * una persona acaba de tener una buena experiencia Y está en modo de
 * reseñar es justo después de dejarle una reseña a un profesional —desde la
 * ficha o desde la tarjeta de seguimiento («¿Llegaste a contratarlo?» → «Sí,
 * dejar una reseña»)—. Ahí se pide, una sola vez en la vida de ese
 * navegador, y con salida de un toque: «Ahora no» y no vuelve.
 *
 * Se entera por el evento `ccr:resena-enviada`, que dispara el formulario de
 * reseña al guardar: así cubre los dos caminos sin que ninguno sepa de esto.
 */
export const ENLACE_RESENA_GOOGLE = "https://g.page/r/CeZkdYZpL2enECE/review";
export const EVENTO_RESENA_ENVIADA = "ccr:resena-enviada";
const CLAVE = "ccr:resena-google:v1";

export function PedirResenaGoogle() {
  const t = useTranslations("reviews.google");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alEnviar = () => {
      try {
        if (window.localStorage.getItem(CLAVE)) return;
      } catch {
        /* sin almacenamiento se pregunta igual; no hay forma de recordar */
      }
      // Después del «¡Gracias!» del formulario, no encima.
      window.setTimeout(() => setVisible(true), 1600);
    };
    window.addEventListener(EVENTO_RESENA_ENVIADA, alEnviar);
    return () => window.removeEventListener(EVENTO_RESENA_ENVIADA, alEnviar);
  }, []);

  function cerrar(motivo: "fue" | "no") {
    try {
      window.localStorage.setItem(CLAVE, `${motivo}:${Date.now()}`);
    } catch {
      /* sin almacenamiento, se cierra igual */
    }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <section
      role="dialog"
      aria-label={t("titulo")}
      // La misma caja que la tarjeta de seguimiento del servicio: abajo,
      // sobre la barra de la app si la hay, y por encima de lo demás.
      className="fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+var(--ccr-barra-app,0px))] z-[145] rounded-2xl border border-[#d8e5ee] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.18)] sm:inset-x-auto sm:right-4 sm:w-[24rem]"
    >
      <button
        type="button"
        onClick={() => cerrar("no")}
        aria-label={t("cerrar")}
        className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-lg text-[#68778d] hover:bg-[#f1f5f9]"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-8 text-sm font-extrabold text-[#162543]">{t("titulo")}</p>
      <p className="mt-1 text-[13px] leading-5 text-[#526277]">{t("cuerpo")}</p>
      <div className="mt-3 flex gap-2">
        <a
          href={ENLACE_RESENA_GOOGLE}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => cerrar("fue")}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb]"
        >
          {t("boton")}
        </a>
        <button
          type="button"
          onClick={() => cerrar("no")}
          className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cdd8e1] px-4 text-sm font-bold text-[#526277] hover:border-[#009FD9]"
        >
          {t("ahoraNo")}
        </button>
      </div>
    </section>
  );
}
