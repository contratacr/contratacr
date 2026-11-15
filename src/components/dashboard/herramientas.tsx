"use client";
import { ChevronRight, FileText, Mail, ReceiptText } from "lucide-react";
import { useLocale } from "next-intl";

type Destino = "quotes" | "cv" | "carta";

const HERRAMIENTAS: { id: Destino; icono: React.ReactNode; titulo: { es: string; en: string }; texto: { es: string; en: string }; soloProfesional?: boolean }[] = [
  { id: "quotes", soloProfesional: true, icono: <ReceiptText className="h-5 w-5" />, titulo: { es: "Cotizaciones", en: "Quotes" }, texto: { es: "Armá un presupuesto y envialo a tu cliente.", en: "Build a quote and send it to your client." } },
  { id: "cv", icono: <FileText className="h-5 w-5" />, titulo: { es: "Crear currículum", en: "Create a resume" }, texto: { es: "Llená tus datos y descargá un PDF ordenado.", en: "Fill in your details and download a tidy PDF." } },
  { id: "carta", icono: <Mail className="h-5 w-5" />, titulo: { es: "Crear carta de presentación", en: "Create a cover letter" }, texto: { es: "Respondé unas preguntas y la carta queda lista.", en: "Answer a few questions and your letter is ready." } },
];

/** «Herramientas»: la sección que reúne lo que uno arma y descarga. */
export function Herramientas({ esProfesional, alAbrir }: { esProfesional: boolean; alAbrir: (destino: Destino) => void }) {
  const en = useLocale() === "en";
  const idioma = en ? "en" : "es";
  return (
    <div className="grid gap-3" data-testid="herramientas">
      {HERRAMIENTAS.filter((h) => !h.soloProfesional || esProfesional).map((h) => (
        <button
          key={h.id}
          type="button"
          data-testid={`herramienta-${h.id}`}
          onClick={() => alAbrir(h.id)}
          className="flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border border-[#e5e7eb] bg-white px-4 py-3.5 text-left transition-colors hover:bg-[#f8fbfd]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#EBF5FB] text-[#009FD9]">{h.icono}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-black text-[#162543]">{h.titulo[idioma]}</span>
            <span className="mt-0.5 block text-[13px] leading-5 text-[#667085]">{h.texto[idioma]}</span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" />
        </button>
      ))}
    </div>
  );
}
