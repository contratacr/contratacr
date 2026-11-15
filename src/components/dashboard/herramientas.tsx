"use client";
import { ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";

type Destino = "quotes" | "cv" | "carta";

const HERRAMIENTAS: { id: Destino; titulo: { es: string; en: string }; texto: { es: string; en: string }; soloProfesional?: boolean }[] = [
  { id: "quotes", soloProfesional: true, titulo: { es: "Cotizaciones", en: "Quotes" }, texto: { es: "Armá un presupuesto y envialo a tu cliente.", en: "Build a quote and send it to your client." } },
  { id: "cv", titulo: { es: "Crear currículum", en: "Create a resume" }, texto: { es: "Llená tus datos y descargá un PDF ordenado.", en: "Fill in your details and download a tidy PDF." } },
  { id: "carta", titulo: { es: "Crear carta de presentación", en: "Create a cover letter" }, texto: { es: "Respondé unas preguntas y la carta queda lista.", en: "Answer a few questions and your letter is ready." } },
];

/**
 * «Herramientas»: lo que uno arma y descarga. Las filas son las mismas de «Mi
 * perfil»: en computadora, una tarjeta con líneas entre filas y la descripción
 * debajo del título; en el teléfono, una tarjeta por fila (60 px, flecha).
 */
export function Herramientas({ esProfesional, alAbrir }: { esProfesional: boolean; alAbrir: (destino: Destino) => void }) {
  const idioma = useLocale() === "en" ? "en" : "es";
  return (
    <div
      data-testid="herramientas"
      className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_10px_28px_-24px_rgba(15,23,42,0.65)] max-sm:flex max-sm:flex-col max-sm:gap-2.5 max-sm:overflow-visible max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:shadow-none"
    >
      <div className="divide-y divide-[#eef2f6] max-sm:contents">
        {HERRAMIENTAS.filter((h) => !h.soloProfesional || esProfesional).map((h) => (
          <button
            key={h.id}
            type="button"
            data-testid={`herramienta-${h.id}`}
            onClick={() => alAbrir(h.id)}
            className="flex w-full items-center justify-between gap-3 border-[#eef2f6] px-4 py-4 text-left transition-colors hover:bg-[#fafafa] sm:px-5 max-sm:min-h-[60px] max-sm:rounded-2xl max-sm:border max-sm:border-[#e5e7eb] max-sm:bg-white max-sm:py-3.5"
          >
            <div className="min-w-0">
              <p className="text-[15px] font-semibold leading-tight text-[#162543]">{h.titulo[idioma]}</p>
              <p className="mt-1 text-xs text-[#6b7280] max-sm:hidden">{h.texto[idioma]}</p>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#162543] transition-colors hover:bg-[#EBF5FB] hover:text-[#009FD9]" aria-hidden="true">
              <ChevronRight className="h-5 w-5 text-[#94a3b8]" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
