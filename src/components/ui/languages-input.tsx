"use client";

import { useLocale } from "next-intl";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { cn } from "@/lib/utils";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";

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
  const selected = new Set(value.map(normalizeLanguageId));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      if (next.size === 1) return;
      next.delete(id);
    }
    else next.add(id);
    onChange(Array.from(next));
  }

  // DOS COLUMNAS QUE MIDEN LO QUE MIDE EL IDIOMA MÁS LARGO. En una sola
  // columna, siete idiomas dejaban un desierto a la derecha y obligaban a
  // recorrer la lista entera hacia abajo. La rejilla es `inline-grid` y
  // `w-fit`: las columnas se ajustan al contenido en vez de repartirse el
  // ancho del formulario, así que el interruptor no se aleja de su palabra, y
  // dentro de cada columna todos caen en la misma vertical.
  return (
    <div className="inline-grid w-fit max-w-full grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
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
  );
}
