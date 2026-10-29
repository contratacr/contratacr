"use client";

import Image from "next/image";
import { Smartphone, X } from "lucide-react";
import { useId, useRef } from "react";
import { useLocale } from "next-intl";

/** Desktop handoff: reuse the device-aware download QR, without guessing installation. */
export function DesktopAppMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const en = useLocale() === "en";
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const close = () => { onOpenChange(false); trigger.current?.focus(); };
  return <div data-testid="desktop-app-menu" className="ccr-solo-web relative hidden shrink-0 lg:block" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={trigger} type="button" aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={() => onOpenChange(!open)}
      className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#d6dde5] bg-white px-3 text-sm font-semibold text-[#162543] transition-colors hover:border-[#9cd4e4] hover:bg-[#eef9fc] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009fd9]">
      <Smartphone className="h-4 w-4" aria-hidden="true" />{en ? "Download app" : "Descargar app"}
    </button>
    {open && <div id={id} role="dialog" aria-labelledby={`${id}-title`} className="absolute right-0 top-full z-[80] mt-2 w-[280px] rounded-2xl border border-[#e3e8ec] bg-white p-6 text-center shadow-[0_10px_35px_rgba(22,37,67,0.12)]">
      <button type="button" onClick={close} aria-label={en ? "Close app code" : "Cerrar código de la app"} className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-full text-[#687386] hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-[#009fd9]"><X className="h-4 w-4" aria-hidden="true" /></button>
      <h2 id={`${id}-title`} className="mt-1 text-base font-bold text-[#162543]">{en ? "ContrataCR on your phone" : "ContrataCR en su teléfono"}</h2>
      <p className="mb-4 mt-2 text-sm leading-relaxed text-[#687386]">{en ? "Scan the QR code to download the app for free." : "Escanee el código QR para descargar la app gratis."}</p>
      <Image src="/stores/download-app-qr.svg?v=20261013-store-redirect" width={144} height={144} alt={en ? "Scan to download ContrataCR" : "Escanee para descargar ContrataCR"} className="mx-auto rounded-lg bg-white" />
      <p className="mt-3 text-xs text-[#687386]">iPhone · Android</p>
    </div>}
  </div>;
}
