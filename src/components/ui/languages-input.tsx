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

  return (
    <div className="flex flex-col gap-1">
      {LANGUAGES.map((language) => {
        const checked = selected.has(language.id);
        return (
          <FilaInterruptor
            key={language.id}
            titulo={languageLabel(language.id, locale)}
            checked={checked}
            onChange={() => toggle(language.id)}
          />
        );
      })}
    </div>
  );
}
