"use client";
import { useState } from "react";
import { Bookmark, X } from "lucide-react";
import { useRouter, usePathname } from "@/i18n/navigation";
import { SaveToList } from "./save-to-list";

/**
 * «Guardar» on a place card (owner 2026-11-26, like the professionals' bookmark): opens the lists sheet (He estado, Quiero
 * ir and the person's own lists). Logged out, it goes to login and comes back to the same page.
 */
export function PlaceSaveBookmark({ slug, name, locale, className = "" }: { slug: string; name: string; locale: string; className?: string }) {
  const en = locale === "en";
  const t = (es: string, e: string) => (en ? e : es);
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/listas?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (r.status === 401) { router.push(`/login?redirect=${encodeURIComponent(pathname + (typeof location !== "undefined" ? location.search : ""))}`); return; }
      setOpen(true);
    } catch { setOpen(true); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={start} disabled={busy} aria-label={t(`Guardar ${name}`, `Save ${name}`)} data-place-save={slug}
        className={`relative z-10 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#009FD9] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9] ${className}`}>
        <Bookmark className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-0 z-[10070] flex items-end bg-black/40" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={t("Guardar en una lista", "Save to a list")}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-[calc(2rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-[16px] font-extrabold">{name}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Cerrar", "Close")} className="inline-flex h-9 w-9 items-center justify-center rounded-full"><X className="h-5 w-5" aria-hidden /></button></div>
            <SaveToList slug={slug} locale={locale} signedIn loginHref={null} />
          </div>
        </div>
      )}
    </>
  );
}
