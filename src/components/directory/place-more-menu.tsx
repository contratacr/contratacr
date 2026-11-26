"use client";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * The «…» of the place page bar (owner 2026-11-26, like the professional profile): Guardar, Compartir and Agregar fotos
 * live in a sheet opened from the bar instead of the chip row. Listens to the bar's `ccr:section-menu` event.
 * On computers the same actions stay inline (`desktop`).
 */
export function PlaceMoreMenu({ title, closeLabel, children, desktop }: { title: string; closeLabel: string; children: ReactNode; desktop: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("ccr:section-menu", on);
    return () => window.removeEventListener("ccr:section-menu", on);
  }, []);
  return (
    <>
      <div className="hidden lg:contents">{desktop}</div>
      {open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[10070] lg:hidden" role="dialog" aria-modal="true" aria-label={title} data-place-more-menu>
          <button type="button" aria-label={closeLabel} className="absolute inset-0 bg-black/35" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[16px] font-extrabold text-[#162543]">{title}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={closeLabel} className="grid h-9 w-9 place-items-center rounded-full"><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <div className="flex flex-col gap-2 [&>*]:!w-full [&_a]:!flex [&_a]:!h-12 [&_a]:!w-full [&_a]:!justify-start [&_a]:!rounded-xl [&_a]:!px-4 [&_a]:!text-[15px] [&_button]:!flex [&_button]:!h-12 [&_button]:!w-full [&_button]:!justify-start [&_button]:!rounded-xl [&_button]:!px-4 [&_button]:!text-[15px]" onClick={(e) => { if ((e.target as Element).closest("a")) setOpen(false); }}>{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
