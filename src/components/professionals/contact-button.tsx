"use client";

import { useState } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { useContactGate } from "@/components/professionals/contact-gate";
import { cn } from "@/lib/utils";

// «Llamar» para un profesional. El número no está en la página: se pide a
// /api/contact/reveal al tocar.
//
// Qué pasa después depende del aparato, como en Yelp, Idealista o Mercado Libre:
//
//  · En un teléfono se marca de una vez (`tel:`), que es lo que se espera.
//  · En una computadora NO se marca: se muestra el número. Un `tel:` en
//    escritorio, en el mejor caso, abre una ventana preguntando con qué
//    aplicación llamar —FaceTime en una Mac con iPhone— y en el peor no hace
//    nada; y encima sacaba a la persona de la página. Con el número a la vista
//    lo marca desde su teléfono, que es lo que iba a hacer igual. El número
//    sigue siendo un enlace, así que quien tenga cómo llamar desde la
//    computadora puede hacerlo.
//
// El modo "email" sigue aquí pero ya no lo usa ninguna pantalla: en dos meses
// hubo 86 toques a WhatsApp, 4 a «Llamar» y CERO al correo, con 92
// profesionales que tenían uno puesto. Se conserva el camino por si algún día
// vuelve, no como botón visible.
export function ContactButton({
  method,
  professionalId,
  professionalName,
  contextTitle,
  categoryId,
  source,
  isOwn = false,
  onSelfAction,
  className = "",
  iconOnly = false,
  showIcon = true,
  label,
}: {
  method: "phone" | "email";
  professionalId: string;
  professionalName: string;
  contextTitle?: string;
  categoryId?: string | null;
  source: "profile" | "search";
  isOwn?: boolean;
  onSelfAction?: () => void;
  className?: string;
  iconOnly?: boolean;
  showIcon?: boolean;
  label?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("contactGate");
  const [loading, setLoading] = useState(false);
  const [numero, setNumero] = useState<string | null>(null);
  const { requireAccount, modals } = useContactGate({ professionalName, intent: method, professionalId, source, categoryId });

  async function go() {
    setLoading(true);
    try {
      const res = await fetch(`/api/contact/reveal?professionalId=${encodeURIComponent(professionalId)}`);
      const data = (await res.json().catch(() => ({}))) as { tel?: string | null; email?: string | null };
      const href = method === "phone"
        ? data.tel ?? null
        : data.email
          ? `mailto:${data.email}?subject=${encodeURIComponent("Consulta desde ContrataCR")}&body=${encodeURIComponent(`Hola ${professionalName.split(" ")[0]}, vi tu perfil en ContrataCR y me gustaria coordinar un servicio.`)}`
          : null;
      if (!res.ok || !href) { window.alert(t("noContact")); return; }
      trackMetaEvent("Contact", { content_type: "professional_service", method, source });
      trackInteraction({
        type: method === "phone" ? "phone_click" : "external_link_click",
        professionalId,
        source,
        locale,
        categoryId: categoryId ?? null,
        metadata: method === "email" ? { channel: "email" } : undefined,
      });
      void fetch("/api/contact/follow-up/record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ professionalId, method, contextTitle }),
      }).then(() => window.dispatchEvent(new CustomEvent("contratacr:whatsapp-contacted"))).catch(() => {});
      // En el teléfono se marca; en la computadora se muestra el número.
      if (window.matchMedia("(pointer: coarse)").matches || method === "email") {
        window.location.href = href;
        return;
      }
      setNumero(data.tel?.replace(/^tel:/, "") ?? null);
    } finally {
      setLoading(false);
    }
  }

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOwn) { onSelfAction?.(); return; }
    // Nadie se queda afuera: el aviso al profesional sale por detrás.
    requireAccount();
    void go();
  }

  const Icon = method === "phone" ? Phone : Mail;
  // «+50670000002» no se lee: el número va como lo escribe la gente en Costa
  // Rica, «+506 7000-0002».
  const numeroLegible = (() => {
    if (!numero) return "";
    const crudo = numero.replace(/[^\d+]/g, "");
    const cr = crudo.match(/^\+506(\d{8})$/);
    if (cr) return `+506 ${cr[1].slice(0, 4)}-${cr[1].slice(4)}`;
    return numero;
  })();
  if (numero) {
    return (
      <>
        <a
          href={`tel:${numero}`}
          onClick={(e) => e.stopPropagation()}
          className={cn("inline-flex items-center justify-center gap-2 tabular-nums", className)}
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="min-w-0 truncate">{numeroLegible}</span>
        </a>
        {modals}
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        aria-label={iconOnly ? (label ?? (method === "phone" ? t("call") : t("sendEmail"))) : undefined}
        // El acomodo va aquí y no en cada llamada: sin esto, un className sin
        // `flex` dejaba el icono pegado a la izquierda y el rótulo suelto al
        // centro, como pasó en Promociones.
        className={cn("inline-flex items-center justify-center gap-2", className)}
      >
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : (showIcon || iconOnly) && <Icon className="h-4 w-4 shrink-0" />}
        {!iconOnly && <span className="min-w-0 truncate">{label ?? (method === "phone" ? t("call") : t("sendEmail"))}</span>}
      </button>
      {modals}
    </>
  );
}
