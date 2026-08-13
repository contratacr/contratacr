"use client";

import { useLocale } from "next-intl";
import { LANGUAGES, languageLabel } from "@/lib/data/languages";
import { cn } from "@/lib/utils";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

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
    <div className="grid gap-2 sm:grid-cols-2">
      {LANGUAGES.map((language) => {
        const checked = selected.has(language.id);
        return (
          <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={languageLabel(language.id, locale)}
            key={language.id}
            onClick={() => toggle(language.id)}
            className={cn(
              "flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold text-[#12233f] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/30",
              checked
                ? "border-[#cce8f3] bg-[#f4fbfe]"
                : "border-[#e5e7eb] bg-white hover:bg-[#f8fafc]"
            )}
          >
            <span>{languageLabel(language.id, locale)}</span>
            <ToggleSwitch checked={checked} />
          </button>
        );
      })}
    </div>
  );
}
