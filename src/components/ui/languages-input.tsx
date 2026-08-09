"use client";

import { useLocale } from "next-intl";
import { Check } from "lucide-react";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { cn } from "@/lib/utils";

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
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {LANGUAGES.map((language) => {
        const checked = selected.has(language.id);
        return (
          <label
            key={language.id}
            className={cn(
              "flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#12233f] transition-colors hover:bg-[#f4f8fb]",
              checked && "bg-[#eef8fc]"
            )}
          >
            <span>{languageLabel(language.id, locale)}</span>
            <span className={cn(
              "grid h-5 w-5 shrink-0 place-items-center rounded-[4px] border border-[#b8c5d3] bg-white text-white",
              checked && "border-[#009FD9] bg-[#009FD9]"
            )}>
              {checked ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
            </span>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(language.id)}
              className="sr-only"
            />
          </label>
        );
      })}
    </div>
  );
}
