"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { esRutaDeBusqueda } from "@/lib/buscar-url";
import { esServicioDelCatalogo } from "@/lib/data/categories";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { alCambiarElTurno, hayAlguienEnTurno } from "@/lib/turno-en-pantalla";
import { Clock3, Star, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";

type FollowUp = {
  id: string;
  professional_id: string;
  professional_name: string;
  service_name?: string | null;
  contact_method?: "whatsapp" | "phone" | "email" | null;
  status: "contacted" | "hire_intent";
};

type ReviewTarget = {
  contactId: string;
  professionalId: string;
  professionalName: string;
  /** Sin cuenta: la reseña se publica pidiendo solo el nombre. */
  needsName?: boolean;
};

export function WhatsAppReviewFollowUp() {
  const locale = useLocale();
  const t = useTranslations("seguimientoContacto");
  const { user, loading: authLoading } = useAuth();
  // SOLO EN PANTALLAS TRANQUILAS. La tarjeta se montaba en toda ruta y salía
  // encima de la franja de contactar de la ficha (justo sobre el botón que la
  // persona iba a tocar), en medio del registro y en los flujos de publicar.
  // Pedir una reseña es una conversación aparte: va en la portada, en Buscar,
  // en el panel o en la lista de Mensajes, donde no compite con nada.
  const pathname = usePathname();
  const ruta = (pathname ?? "/").replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
  const pantallaTranquila = /^\/(?:mensajes|dashboard(?:\/[^/]+)?)?\/?$/u.test(ruta) || esRutaDeBusqueda(ruta, esServicioDelCatalogo);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const handledFollowUpId = useRef<string | null>(null);
  // La persona dijo «Aún no» en esta visita: no se le pregunta nada más hasta la próxima.
  const enPausa = useRef(false);
  const followUpRequestInFlight = useRef(false);
  const lastFollowUpCheckAt = useRef(0);
  const userId = user?.id ?? null;

  const act = useCallback(async (item: FollowUp, action: "hired" | "not_now" | "not_hired" | "no_response") => {
    const response = await fetch("/api/contact/follow-up", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && payload.authRequired) {
      window.location.assign(`${prefijoDeIdioma(locale)}/login`);
      return null;
    }
    if (!response.ok) throw new Error(payload.error || "Follow-up failed");
    return payload as { review?: ReviewTarget };
  }, [locale]);

  const checkFollowUp = useCallback(async (active = true) => {
    if (followUpRequestInFlight.current || enPausa.current) return;
    followUpRequestInFlight.current = true;
    try {
      const response = await fetch("/api/contact/follow-up", { cache: "no-store" });
      const payload = await response.json();
      const item = payload.followUp as FollowUp | null;
      if (!active) return;
      setPendingCount(Number(payload.pendingCount ?? (item ? 1 : 0)));
      if (!item) {
        setFollowUp(null);
        return;
      }
      if (item.id === handledFollowUpId.current) {
        setFollowUp(null);
        return;
      }

      if (item.status === "hire_intent" && userId) {
        const result = await act(item, "hired");
        if (active && result?.review) setReviewTarget(result.review);
        return;
      }
      setFollowUp(item);
    } catch {
      // Follow-up is optional and must never interrupt the page being used.
    } finally {
      lastFollowUpCheckAt.current = Date.now();
      followUpRequestInFlight.current = false;
    }
  }, [act, userId]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    if (!pantallaTranquila) return;
    // Antes se filtraba por «hay sesión o el navegador ve la cookie de
    // contacto». La cookie es httpOnly: el navegador NUNCA la ve, así que a
    // quien no tenía sesión no se le preguntaba jamás al cargar. Decide el
    // servidor, que es quien tiene la cookie; y como ahora solo se consulta en
    // cuatro pantallas, deja de ser una petición en cada carga de cada ruta.
    //
    // Unos segundos de espera, no cero: la tarjeta no debe ser lo primero que
    // aparece al entrar. Se deja llegar a la pantalla y después se pregunta.
    const initialTimer = window.setTimeout(() => {
      if (active) void checkFollowUp(active);
    }, 4000);

    const onWhatsAppContacted = () => {
      window.setTimeout(() => {
        if (active) void checkFollowUp(active);
      }, 65 * 1000);
    };
    const onVisibilityChange = () => {
      const checkIsStale = Date.now() - lastFollowUpCheckAt.current >= 60 * 1000;
      if (document.visibilityState === "visible" && active && checkIsStale) {
        void checkFollowUp(active);
      }
    };
    window.addEventListener("contratacr:whatsapp-contacted", onWhatsAppContacted);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      active = false;
      window.clearTimeout(initialTimer);
      window.removeEventListener("contratacr:whatsapp-contacted", onWhatsAppContacted);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [authLoading, checkFollowUp, pantallaTranquila]);

  async function handle(action: "hired" | "not_now" | "not_hired" | "no_response") {
    if (!followUp || submitting) return;
    setSubmitting(true);
    try {
      const result = await act(followUp, action);
      if (result?.review) {
        setReviewTarget(result.review);
      } else {
        handledFollowUpId.current = followUp.id;
        // «Aún no» (o la X) también quiere decir «ahora no me pregunten»: no se
        // pasa a la siguiente pendiente en esta visita. Con un «No» sí: ahí la
        // persona está contestando y terminar la lista le toma un toque más.
        if (action === "not_now") enPausa.current = true;
        else window.setTimeout(() => void checkFollowUp(true), 500);
      }
      setFollowUp(null);
    } catch {
      // Keep the card visible so the user can retry.
    } finally {
      setSubmitting(false);
    }
  }

  const service = followUp?.service_name?.trim();
  const method = followUp?.contact_method ?? "whatsapp";
  const title = followUp ? t("titulo", { nombre: followUp.professional_name, metodo: t(`metodo.${method}`) }) : "";
  const question = t("pregunta");
  const pendingLabel = pendingCount > 1 ? t("pendientes", { n: pendingCount }) : "";

  // La tarjeta flota en el borde inferior. En la app ahí vive la barra de
  // navegación, y la tarjeta le tapaba los toques: quien tocaba «Empleos» le
  // respondía la tarjeta. Se intentó resolver por CSS —primero con
  // `.ccr-native-app`, después con `--ccr-aviso-barra-app`— pero ninguna de las
  // dos está puesta con certeza en el momento en que la tarjeta aparece. Se
  // MIDE la barra, que es lo único que no depende de en qué orden llegan las
  // clases. Sin barra (la web) el alto es 0 y la tarjeta no se mueve.
  const [altoBarra, setAltoBarra] = useState(0);
  // Y se aparta cuando hay algo abierto ENCIMA. Esta tarjeta vive en z-145, por
  // encima de los modales (z-100): mientras estaba abierta le comía los toques
  // al asistente y a cualquier ventana. Es un recordatorio pasivo —puede
  // esperar—, así que se esconde mientras haya un diálogo y vuelve al cerrarlo.
  const [hayVentana, setHayVentana] = useState(false);

  // Y también se aparta cuando el aviso de notificaciones PIDIÓ el turno, aunque
  // todavía no haya pintado nada. Mirar si hay un diálogo abierto no alcanzaba:
  // esa medición corre cada 500 ms y la hoja de notificaciones tarda 2,5 s en
  // aparecer, así que al entrar por primera vez esta tarjeta se asomaba medio
  // segundo y enseguida quedaba tapada. El turno se reserva al instante.
  // `useSyncExternalStore` y no un efecto con `useState`: esto es suscribirse a
  // algo de afuera de React, que es exactamente para lo que existe. En el
  // servidor siempre vale `false` —allá no hay turno que pedir— y así el HTML
  // pintado coincide con el primer render del navegador.
  const turnoAjeno = useSyncExternalStore(alCambiarElTurno, hayAlguienEnTurno, () => false);
  useEffect(() => {
    if (!followUp) return;
    const medir = () => {
      const barra = document.querySelector<HTMLElement>(".ccr-native-bottom-nav");
      const alto = barra ? barra.getBoundingClientRect().height : 0;
      setAltoBarra((previo) => (Math.abs(previo - alto) > 1 ? alto : previo));
      // Solo cuenta una ventana que SE VE. El menú lateral vive montado y
      // escondido en todas las pantallas (role="dialog"): contándolo, la tarjeta
      // se asomaba medio segundo y se escondía para siempre.
      const ajena = Array.from(document.querySelectorAll<HTMLElement>('.app-modal-screen, [role="dialog"]'))
        .some((el) => {
          if (el.classList.contains("ccr-seguimiento-servicio")) return false;
          const caja = el.getBoundingClientRect();
          const estilo = getComputedStyle(el);
          return caja.width > 0 && caja.height > 0 && estilo.visibility !== "hidden" && estilo.display !== "none" && Number(estilo.opacity) > 0;
        });
      setHayVentana((previo) => (previo === ajena ? previo : ajena));
    };
    medir();
    const observador = new ResizeObserver(medir);
    const barra = document.querySelector(".ccr-native-bottom-nav");
    if (barra) observador.observe(barra);
    window.addEventListener("resize", medir);
    const repaso = window.setInterval(medir, 500);
    return () => {
      observador.disconnect();
      window.removeEventListener("resize", medir);
      window.clearInterval(repaso);
    };
  }, [followUp]);

  return (
    <>
      {followUp && pantallaTranquila && !hayVentana && !turnoAjeno && (
        <section
          role="dialog"
          aria-label={t("aria")}
          // La tarjeta se sienta SOBRE la barra de navegación, no encima de
          // ella: en la app se pintaba justo en el borde inferior con z-145 y
          // se comía los toques de la barra —quien tocaba «Empleos» le
          // respondía la tarjeta—. `--ccr-native-live-bottom-nav-height` vale
          // 0 fuera de la app, así que en la web nada cambia.
          className="ccr-seguimiento-servicio ccr-entrada fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+var(--ccr-barra-app,0px))] z-[145] rounded-2xl border border-[#d9e8f2] bg-white p-4 shadow-[0_18px_55px_-18px_rgba(26,39,68,0.38)] sm:inset-x-auto sm:bottom-[calc(1.5rem+var(--ccr-barra-app,0px))] sm:right-6 sm:w-[390px] sm:p-5"
          // La medida entra como variable, no como `bottom` a secas: así se
          // conserva el margen distinto de escritorio (`sm:`), que un estilo en
          // línea habría pisado.
          style={{ "--ccr-barra-app": `${altoBarra}px` } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void handle("not_now")}
            aria-label={t("cerrar")}
            className="absolute right-3 top-3 rounded-md p-1 text-[#8a96aa] hover:bg-[#f2f6f9] hover:text-[#162543]"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-7">
            <div className="min-w-0">
              {pendingLabel && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#009FD9]">{pendingLabel}</p>}
              <p className="text-[15px] font-bold leading-5 text-[#162543]">{title}</p>
              <p className="mt-1 text-sm font-semibold text-[#162543]">{question}</p>
              {service && <p className="mt-2 inline-flex rounded-full bg-[#eef4f8] px-2.5 py-1 text-xs font-semibold text-[#667085]">{service}</p>}
              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {t("ayuda")}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handle("hired")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] disabled:opacity-60"
            >
              <Star className="h-4 w-4" />
              {t("si")}
            </button>
            {/* Dos «no» distintos: no haberlo contratado no dice nada malo del
                profesional; que no contestara, sí. */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handle("not_hired")}
                className="min-h-11 rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543] hover:bg-[#f7fafc] disabled:opacity-60"
              >
                {t("no")}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handle("no_response")}
                className="min-h-11 rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543] hover:bg-[#f7fafc] disabled:opacity-60"
              >
                {t("sinRespuesta")}
              </button>
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handle("not_now")}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[#667085] hover:bg-[#f7fafc] hover:text-[#162543] disabled:opacity-60"
            >
              <Clock3 className="h-4 w-4" />
              {t("aunNo")}
            </button>
          </div>
        </section>
      )}

      {reviewTarget && (
        <LeaveReviewModal
          contactId={reviewTarget.contactId}
          professionalId={reviewTarget.professionalId}
          professionalName={reviewTarget.professionalName}
          pedirNombre={!!reviewTarget.needsName}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </>
  );
}
