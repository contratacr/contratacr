// Languages a professional can declare they speak. IDs are stable (English),
// `label` is Spanish-first UI copy, `labelEn` the English rendering. Used by the
// profile languages chip input and the public profile. Resolve with
// languageLabel(id, locale) so the value follows the active locale.
export const LANGUAGES = [
  { id: "es", label: "Español", labelEn: "Spanish" },
  { id: "en", label: "Inglés", labelEn: "English" },
  { id: "fr", label: "Francés", labelEn: "French" },
  { id: "pt", label: "Portugués", labelEn: "Portuguese" },
  { id: "it", label: "Italiano", labelEn: "Italian" },
  { id: "de", label: "Alemán", labelEn: "German" },
  { id: "zh", label: "Mandarín", labelEn: "Mandarin" },
  { id: "ja", label: "Japonés", labelEn: "Japanese" },
  { id: "ko", label: "Coreano", labelEn: "Korean" },
  { id: "ru", label: "Ruso", labelEn: "Russian" },
  { id: "ar", label: "Árabe", labelEn: "Arabic" },
  { id: "hi", label: "Hindi", labelEn: "Hindi" },
  { id: "nl", label: "Neerlandés", labelEn: "Dutch" },
  { id: "sv", label: "Sueco", labelEn: "Swedish" },
  { id: "no", label: "Noruego", labelEn: "Norwegian" },
  { id: "da", label: "Danés", labelEn: "Danish" },
  { id: "fi", label: "Finés", labelEn: "Finnish" },
  { id: "pl", label: "Polaco", labelEn: "Polish" },
  { id: "tr", label: "Turco", labelEn: "Turkish" },
  { id: "el", label: "Griego", labelEn: "Greek" },
  { id: "he", label: "Hebreo", labelEn: "Hebrew" },
  { id: "th", label: "Tailandés", labelEn: "Thai" },
  { id: "vi", label: "Vietnamita", labelEn: "Vietnamese" },
  { id: "id", label: "Indonesio", labelEn: "Indonesian" },
  { id: "tl", label: "Tagalo", labelEn: "Tagalog" },
  { id: "uk", label: "Ucraniano", labelEn: "Ukrainian" },
  { id: "cs", label: "Checo", labelEn: "Czech" },
  { id: "ro", label: "Rumano", labelEn: "Romanian" },
  { id: "hu", label: "Húngaro", labelEn: "Hungarian" },
  { id: "ca", label: "Catalán", labelEn: "Catalan" },
  { id: "lsr", label: "LESCO (Lengua de Señas Costarricense)", labelEn: "LESCO (Costa Rican Sign Language)" },
] as const;

export function languageLabel(id: string, locale?: string): string {
  const l = LANGUAGES.find((x) => x.id === id);
  if (!l) return id;
  return locale === "en" ? l.labelEn : l.label;
}

export function languageSearchValues(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];
  const needle = raw.toLowerCase();
  const match = LANGUAGES.find((x) =>
    x.id.toLowerCase() === needle ||
    x.label.toLowerCase() === needle ||
    x.labelEn.toLowerCase() === needle
  );
  return Array.from(new Set([raw, match?.id, match?.label, match?.labelEn].filter(Boolean) as string[]));
}
