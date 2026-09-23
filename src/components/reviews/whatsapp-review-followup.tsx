"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, Star, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { WHATSAPP_CONTACT_COOKIE } from "@/lib/contact-followup";
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
  const isEn = locale === "en";
  const { user, loading: authLoading } = useAuth();
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

  const act = useCallback(async (item: FollowUp, action: "hired" | "not_now" | "not_hired") => {
    const response = await fetch("/api/contact/follow-up", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, action }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401 && payload.authRequired) {
      window.location.assign(`/${locale}/login`);
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
    // La consulta de seguimiento solo tiene sentido para quien ya contactó a
    // alguien: existe una marca en la cookie, o hay sesión. Sin este filtro
    // salía una petición (y dos consultas) en CADA carga de CADA pantalla del
    // app, también para un visitante que acaba de llegar.
    const yaContactoAAlguien = userId !== null
      || (typeof document !== "undefined" && document.cookie.includes(WHATSAPP_CONTACT_COOKIE));
    const initialTimer = window.setTimeout(() => {
      if (active && yaContactoAAlguien) void checkFollowUp(active);
    }, 0);

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
  }, [authLoading, checkFollowUp]);

  async function handle(action: "hired" | "not_now" | "not_hired") {
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
  const methodLabel = isEn
    ? method === "phone"
      ? "by phone"
      : method === "email"
        ? "by email"
        : "by WhatsApp"
    : method === "phone"
      ? "por llamada"
      : method === "email"
        ? "por correo"
        : "por WhatsApp";
  const title = followUp
    ? isEn
      ? `You contacted ${followUp.professional_name} ${methodLabel}`
      : `Contactaste a ${followUp.professional_name} ${methodLabel}`
    : "";
  const question = isEn ? "Did you end up hiring them?" : "¿Llegaste a contratarlo?";
  const pendingLabel = pendingCount > 1
    ? isEn
      ? `1 of ${pendingCount} pending confirmations`
      : `1 de ${pendingCount} confirmaciones pendientes`
    : "";

  // La tarjeta flota en el borde inferior. En la app ahí vive la barra de
  // navegación, y la tarjeta le tapaba los toques: quien tocaba «Empleos» le
  // respondía la tarjeta. Se intentó resolver por CSS —primero con
  // `.ccr-native-app`, después con `--ccr-aviso-barra-app`— pero ninguna de las
  // dos está puesta con certeza en el momento en que la tarjeta aparece. Se
  // MIDE la barra, que es lo único que no depende de en qué orden llegan las
  // clases. Sin barra (la web) el alto es 0 y la tarjeta no se mueve.
  const [altoBarra, setAltoBarra] = useState(0);
  useEffect(() => {
    if (!followUp) return;
    const medir = () => {
      const barra = document.querySelector<HTMLElement>(".ccr-native-bottom-nav");
      const alto = barra ? barra.getBoundingClientRect().height : 0;
      setAltoBarra((previo) => (Math.abs(previo - alto) > 1 ? alto : previo));
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
      {followUp && (
        <section
          role="dialog"
          aria-label={isEn ? "Service follow-up" : "Seguimiento del servicio"}
          // La tarjeta se sienta SOBRE la barra de navegación, no encima de
          // ella: en la app se pintaba justo en el borde inferior con z-145 y
          // se comía los toques de la barra —quien tocaba «Empleos» le
          // respondía la tarjeta—. `--ccr-native-live-bottom-nav-height` vale
          // 0 fuera de la app, así que en la web nada cambia.
          className="ccr-seguimiento-servicio fixed inset-x-3 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+var(--ccr-barra-app,0px))] z-[145] rounded-2xl border border-[#d9e8f2] bg-white p-4 shadow-[0_18px_55px_-18px_rgba(26,39,68,0.38)] sm:inset-x-auto sm:bottom-[calc(1.5rem+var(--ccr-barra-app,0px))] sm:right-6 sm:w-[390px] sm:p-5"
          // La medida entra como variable, no como `bottom` a secas: así se
          // conserva el margen distinto de escritorio (`sm:`), que un estilo en
          // línea habría pisado.
          style={{ "--ccr-barra-app": `${altoBarra}px` } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() => void handle("not_now")}
            aria-label={isEn ? "Close for now" : "Cerrar por ahora"}
            className="absolute right-3 top-3 rounded-md p-1 text-[#8a96aa] hover:bg-[#f2f6f9] hover:text-[#1A2744]"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="pr-7">
            <div className="min-w-0">
              {pendingLabel && <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#009FD9]">{pendingLabel}</p>}
              <p className="text-[15px] font-bold leading-5 text-[#1A2744]">{title}</p>
              <p className="mt-1 text-sm font-semibold text-[#1A2744]">{question}</p>
              {service && <p className="mt-2 inline-flex rounded-full bg-[#eef4f8] px-2.5 py-1 text-xs font-semibold text-[#667085]">{service}</p>}
              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {isEn ? "Your experience can help other people choose." : "Su experiencia puede ayudar a otras personas a elegir."}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handle("hired")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white hover:bg-[#0089bb] disabled:opacity-60"
            >
              <Star className="h-4 w-4" />
              {isEn ? "Yes, leave a review" : "Sí, dejar una reseña"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handle("not_now")}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#1A2744] hover:bg-[#f7fafc] disabled:opacity-60"
            >
              <Clock3 className="h-4 w-4" />
              {isEn ? "Not yet" : "Aún no"}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handle("not_hired")}
              className="min-h-11 rounded-xl px-3 text-sm font-semibold text-[#667085] hover:bg-[#f7fafc] hover:text-[#1A2744] disabled:opacity-60"
            >
              {isEn ? "No" : "No"}
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
