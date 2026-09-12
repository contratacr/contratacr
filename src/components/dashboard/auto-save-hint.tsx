"use client";

import { Check, Loader2 } from "lucide-react";
import { useLocale } from "next-intl";

/**
 * El acuse de las secciones que guardan solas.
 *
 * En el panel, la respuesta de "ya quedó" la da el botón Guardar cambios, que
 * gira mientras escribe. Servicios y Casos NO tienen ese botón —agregar,
 * quitar o encender algo de una lista se guarda en el momento—, así que sin
 * esta línea el cambio se escribía sin que nada lo confirmara.
 */
export function AutoSaveHint({ saving, saved }: { saving: boolean; saved: boolean }) {
  const locale = useLocale();
  if (!saving && !saved) return null;
  const enIngles = locale === "en";
  return (
    <p
      role="status"
      aria-live="polite"
      className="mt-4 flex items-center justify-end gap-1.5 text-[13px] font-semibold text-[#64748b]"
    >
      {saving
        ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
        : <Check className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" strokeWidth={3} aria-hidden />}
      {saving ? (enIngles ? "Saving…" : "Guardando…") : enIngles ? "Saved" : "Guardado"}
    </p>
  );
}
