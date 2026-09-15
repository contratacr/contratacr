"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { Check, MessageCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { type ContactIntent } from "@/components/auth/client-registration-modal";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";

/**
 * Lo único que se le pide a alguien sin cuenta para contactar: su nombre y su
 * teléfono.
 *
 * Antes aquí se abría el registro completo —cédula, correo, contraseña y
 * código—. Medido en producción: de nueve personas que tocaron «WhatsApp»,
 * ocho se fueron y una se registró; la tasa de contacto cayó de 9,0% a 2,3% y
 * los registros no subieron (1,28 clientes/día antes, 1,20 después). La
 * investigación de formularios dice lo mismo: siete campos convierten ~11%, dos
 * campos ~23%.
 *
 * Los dos datos que se piden no son un trámite: son lo que el profesional
 * necesita para devolver la llamada si esa persona no vuelve a abrir el app.
 * La cuenta se crea después, si quiere.
 */

type GateOptions = {
  professionalName: string;
  intent: Exclude<ContactIntent, "booking">;
  professionalId?: string;
  source?: string;
  categoryId?: string | null;
};

export function useContactGate({ professionalName, intent, professionalId, source = "profile", categoryId = null }: GateOptions) {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("contactGate");
  const [pidiendoDatos, setPidiendoDatos] = useState(false);
  const [ready, setReady] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<(() => void) | null>(null);
  // La ventana se dibuja colgada de <body>, no donde está el botón. En /buscar
  // el panel de resultados se arrastra con `transform`, y eso rompe el
  // `position: fixed` de todo lo que viva adentro: el diálogo salía recortado
  // entre las tarjetas en vez de encima de la pantalla.
  const [destino, setDestino] = useState<HTMLElement | null>(null);
  useEffect(() => { queueMicrotask(() => setDestino(document.body)); }, []);

  // Devuelve true cuando quien llama puede seguir de una.
  const requireAccount = useCallback((run: () => void) => {
    if (user) return true;
    // El toque en sí es la señal: sin esto el embudo mostraría los contactos
    // desapareciendo cuando lo que pasa es que ya no se cuentan.
    trackInteraction({ type: "contact_gate_shown", professionalId: professionalId ?? null, source, metadata: { channel: intent } });
    pending.current = run;
    setError(null);
    setPidiendoDatos(true);
    return false;
  }, [user, intent, professionalId, source]);

  const resume = () => {
    const run = pending.current;
    pending.current = null;
    setReady(false);
    run?.();
  };

  async function enviarDatos(evento: React.FormEvent) {
    evento.preventDefault();
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/contact/invitado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, nombre, telefono, canal: intent, categoriaId: categoryId, locale }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) {
        setError(typeof datos.error === "string" ? datos.error : t("genericError"));
        return;
      }
      trackInteraction({ type: "contact_lead_created", professionalId: professionalId ?? null, source, metadata: { channel: intent } });
      setPidiendoDatos(false);
      setReady(true);
    } catch {
      setError(t("genericError"));
    } finally {
      setEnviando(false);
    }
  }

  const ventanas: ReactNode = (
    <>
      {pidiendoDatos && (
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setPidiendoDatos(false); pending.current = null; }} />
          <div role="dialog" aria-modal="true" aria-labelledby="contact-ask-title" className="app-centered-modal relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            {/* El mismo mosaico azul de los estados vacíos: la ventana se lee
                como parte del app y no como un formulario pegado. */}
            <span className="ccr-icono-mosaico mx-auto mb-4 h-14 w-14">
              <MessageCircle className="h-6 w-6" strokeWidth={1.6} />
            </span>
            <h3 id="contact-ask-title" className="text-lg font-bold text-[#162543]">{t("askTitle")}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6b7280]">{t("askBody", { name: professionalName })}</p>
            <form onSubmit={enviarDatos} className="mt-5 space-y-3 text-left">
              <div>
                <label htmlFor="ccr-contacto-nombre" className="mb-1.5 block text-sm font-medium text-[#374151]">{t("askName")}</label>
                <input
                  id="ccr-contacto-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder={t("askNamePlaceholder")}
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] px-4 text-sm text-[#162543] outline-none focus:border-[#009FD9]"
                />
              </div>
              <div>
                <label htmlFor="ccr-contacto-telefono" className="mb-1.5 block text-sm font-medium text-[#374151]">{t("askPhone")}</label>
                <input
                  id="ccr-contacto-telefono"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  maxLength={20}
                  placeholder="8888 8888"
                  className="h-11 w-full rounded-xl border border-[#e5e7eb] px-4 text-sm text-[#162543] outline-none focus:border-[#009FD9]"
                />
              </div>
              {error && <p className="text-sm font-semibold text-[#b4232a]">{error}</p>}
              <button
                type="submit"
                disabled={enviando}
                className="h-11 w-full rounded-full bg-[#009FD9] text-sm font-bold text-white transition-colors hover:bg-[#0089bb] disabled:opacity-60"
              >
                {intent === "whatsapp" ? t("openWhatsapp") : intent === "phone" ? t("call") : t("sendEmail")}
              </button>
            </form>
            <p className="mt-3 text-xs leading-relaxed text-[#8b98a9]">{t("askNote")}</p>
          </div>
        </div>
      )}
      {ready && (
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setReady(false); pending.current = null; }} />
          <div role="dialog" aria-modal="true" aria-labelledby="contact-ready-title" className="app-centered-modal relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <BrandIconBadge icon={Check} size={56} className="mx-auto mb-4" />
            <h3 id="contact-ready-title" className="mb-1.5 text-lg font-bold text-[#162543]">{t("readyTitle")}</h3>
            <p className="mb-5 text-sm leading-relaxed text-[#6b7280]">{t("readyBody", { name: professionalName })}</p>
            <button
              type="button"
              onClick={resume}
              className="w-full rounded-xl bg-[#009FD9] py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]"
            >
              {intent === "whatsapp" ? t("openWhatsapp") : intent === "phone" ? t("call") : t("sendEmail")}
            </button>
            <button type="button" onClick={() => { setReady(false); pending.current = null; }} className="mt-2 w-full py-2 text-sm font-semibold text-[#6b7280]">
              {t("later")}
            </button>
          </div>
        </div>
      )}
    </>
  );

  const modals: ReactNode = destino ? createPortal(ventanas, destino) : null;

  return { requireAccount, modals, signedIn: !!user };
}
