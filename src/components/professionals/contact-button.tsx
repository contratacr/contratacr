"use client";

import { useState } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { trackMetaEvent } from "@/lib/analytics/meta-pixel";
import { trackInteraction } from "@/lib/analytics/interaction-events";
import { useContactGate } from "@/components/professionals/contact-gate";

// "Llamar" / "Correo" for a professional. The number and the address are not in
// the page for guests; after the account gate they come from /api/contact/reveal
// and the tel:/mailto: navigation happens from the tap that asked for it.
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
  label?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("contactGate");
  const [loading, setLoading] = useState(false);
  const { requireAccount, modals } = useContactGate({ professionalName, intent: method, professionalId, source });

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
      window.location.href = href;
    } finally {
      setLoading(false);
    }
  }

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (isOwn) { onSelfAction?.(); return; }
    if (!requireAccount(() => void go())) return;
    void go();
  }

  const Icon = method === "phone" ? Phone : Mail;
  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
        aria-label={iconOnly ? (label ?? (method === "phone" ? t("call") : t("sendEmail"))) : undefined}
        className={className}
      >
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
        {!iconOnly && <span className="min-w-0 truncate">{label ?? (method === "phone" ? t("call") : t("sendEmail"))}</span>}
      </button>
      {modals}
    </>
  );
}
