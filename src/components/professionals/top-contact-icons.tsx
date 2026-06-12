"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { SelfActionModal, SELF_MSG } from "./self-action-modal";

// The small WhatsApp + call icons in a /buscar card's top row. They render for
// EVERY card (including the pro's own, so their card looks identical to a
// client's view); on their OWN card the action is blocked with a friendly modal
// instead of opening WhatsApp / the dialer.
export function TopContactIcons({
  isOwn,
  waHref,
  telHref,
  showWhatsApp,
  showCall,
}: {
  isOwn: boolean;
  waHref: string;
  telHref: string;
  showWhatsApp: boolean;
  showCall: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  if (!showWhatsApp && !showCall) return null;

  return (
    <span className="flex shrink-0 items-center gap-0.5 -mt-0.5">
      {showWhatsApp && (
        <a
          href={isOwn ? undefined : waHref}
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setMsg(SELF_MSG.whatsapp); } : undefined}
          target={isOwn ? undefined : "_blank"}
          rel="noopener noreferrer"
          aria-label="Contactar por WhatsApp"
          className="grid h-7 w-7 place-items-center rounded-full text-[#1ebe5d] hover:bg-[#25D366]/10 transition-colors"
        >
          <WhatsAppIcon className="h-[18px] w-[18px]" />
        </a>
      )}
      {showCall && (
        <a
          href={isOwn ? undefined : telHref}
          onClick={isOwn ? (e) => { e.preventDefault(); e.stopPropagation(); setMsg(SELF_MSG.call); } : undefined}
          aria-label="Llamar"
          className="grid h-7 w-7 place-items-center rounded-full text-[#6b7280] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors"
        >
          <Phone className="h-[18px] w-[18px]" />
        </a>
      )}
      <SelfActionModal open={!!msg} onClose={() => setMsg(null)} message={msg ?? ""} />
    </span>
  );
}
