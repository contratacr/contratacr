"use client";

import { useDeferredValue, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { servicioSugerido } from "@/lib/data/sugerir-servicio";
import { useCustomCategories } from "@/lib/data/use-custom-categories";

/**
 * SUGERIR EL SERVICIO POR LO QUE ESCRIBIERON (7-oct-2026).
 *
 * Una línea bajo el campo del servicio: «¿Es de Asistente administrativo? Usar».
 * Sugiere, no rellena: lo que aparece ya puesto se acepta sin mirarlo, y el
 * servicio decide a quién se le avisa. Solo con calce seguro (ver
 * lib/data/sugerir-servicio.ts); si no lo hay, no se dice nada.
 */
export function SugerenciaDeServicio({
  texto,
  servicioActual,
  onUsar,
  locale,
  fuente,
}: {
  texto: string;
  servicioActual: string;
  onUsar: (id: string) => void;
  locale: string;
  fuente: "puesto" | "descripcion";
}) {
  // Sin esto la sugerencia no ve los servicios creados desde el admin (como
  // «Asistente administrativo») hasta que algo más vuelva a pintar el formulario.
  useCustomCategories();
  const diferido = useDeferredValue(texto);
  const sugerido = useMemo(() => (diferido.trim().length >= 3 ? servicioSugerido(diferido, locale) : null), [diferido, locale]);
  if (!sugerido || sugerido === servicioActual) return null;

  const en = locale === "en";
  const nombre = getCategoryLabel(sugerido, locale);
  const frase = servicioActual
    ? en
      ? fuente === "puesto" ? `By the job title, it looks like ${nombre}.` : `By your description, it looks like ${nombre}.`
      : fuente === "puesto" ? `Por el puesto, parece de ${nombre}.` : `Por lo que describes, parece ${nombre}.`
    : en ? `Is it ${nombre}?` : `¿Es de ${nombre}?`;

  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-[#374151]" data-sugerencia-servicio={sugerido}>
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" aria-hidden />
      <span className="min-w-0 truncate">{frase}</span>
      <button
        type="button"
        onClick={() => onUsar(sugerido)}
        className="shrink-0 rounded-full border border-[#009FD9] px-2.5 py-0.5 font-semibold text-[#0089bb] hover:bg-[#EBF5FB]"
      >
        {servicioActual ? (en ? "Change" : "Cambiar") : en ? "Use" : "Usar"}
      </button>
    </p>
  );
}
