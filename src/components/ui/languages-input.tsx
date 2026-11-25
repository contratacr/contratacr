"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";
import { OTRO_IDIOMA, esValorLibre, textoDeValorLibre, valorLibre } from "@/lib/data/otros-valores";

interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

function normalizeLanguageId(id: string): string {
  const needle = id.trim().toLowerCase();
  const match = LANGUAGES.find((language) =>
    language.id === needle ||
    language.label.toLowerCase() === needle ||
    language.labelEn.toLowerCase() === needle
  );
  if (match) return match.id;
  if (["english", "english program", "inglés", "ingles"].includes(needle)) return "en";
  if (["spanish", "español", "espanol"].includes(needle)) return "es";
  return id;
}

export function LanguagesInput({ value, onChange }: Props) {
  const locale = useLocale();
  const t = useTranslations("inputs");
  const [otro, setOtro] = useState("");
  const selected = new Set(value.map(normalizeLanguageId));
  const escritos = Array.from(selected).filter((id) => esValorLibre(id, OTRO_IDIOMA));

  function agregarOtro() {
    const nuevo = valorLibre(OTRO_IDIOMA, otro);
    if (!nuevo) return;
    const yaEsta = Array.from(selected).some((id) => id.toLowerCase() === nuevo.toLowerCase());
    if (!yaEsta) onChange([...Array.from(selected), nuevo]);
    setOtro("");
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    }
    else next.add(id);
    onChange(Array.from(next));
  }

  // COLUMNAS QUE MIDEN LO QUE MIDE EL IDIOMA MÁS LARGO. En una sola columna,
  // siete idiomas ocupaban siete renglones en un campo que es OPCIONAL y donde
  // casi todos marcan uno o dos: demasiado peso para lo que pesa. En cuatro
  // columnas caben en dos renglones y se abarcan de un vistazo. Cuatro y no
  // tres: con tres, LESCO queda solo en el último renglón. La rejilla es `inline-grid` y
  // `w-fit`: las columnas se ajustan al contenido en vez de repartirse el
  // ancho del formulario, así que el interruptor no se aleja de su palabra, y
  // dentro de cada columna todos caen en la misma vertical.
  return (
    <div className="flex flex-col gap-3">
    <div className="inline-grid w-fit max-w-full grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
      {LANGUAGES.map((language) => {
        const checked = selected.has(language.id);
        return (
          <FilaInterruptor
            key={language.id}
            titulo={languageLabel(language.id, locale)}
            checked={checked}
            onChange={() => toggle(language.id)}
            estirar
          />
        );
      })}
    </div>
    {/* Idioma que no está en la lista: se escribe y sale en su perfil, no en el
        filtro de búsqueda (lo revisa el equipo para decidir si pasa a la lista). */}
    <div className="flex max-w-md flex-col gap-2" data-testid="otro-idioma">
      <label className="text-sm font-medium text-[#374151]" htmlFor="otro-idioma-input">{t("otherLanguage")}</label>
      <div className="flex gap-2">
        <input
          id="otro-idioma-input"
          value={otro}
          maxLength={40}
          onChange={(e) => setOtro(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregarOtro(); } }}
          placeholder={t("otherLanguagePlaceholder")}
          className="min-w-0 flex-1 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#162543] placeholder:text-[#68778d] focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
        />
        <button type="button" onClick={agregarOtro} disabled={!valorLibre(OTRO_IDIOMA, otro)} className="shrink-0 rounded-xl border border-[#009FD9] px-3 py-2 text-sm font-semibold text-[#0089bb] transition-colors hover:bg-[#EBF5FB] disabled:cursor-not-allowed disabled:opacity-50">{t("add")}</button>
      </div>
      {escritos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {escritos.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] py-1 pl-2.5 pr-1.5 text-sm font-medium text-[#0089bb]">
              {textoDeValorLibre(id, OTRO_IDIOMA)}
              <button type="button" onClick={() => onChange(Array.from(selected).filter((x) => x !== id))} className="rounded-md p-0.5 transition-colors hover:bg-[#009FD9]/20" aria-label={t("remove")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}
