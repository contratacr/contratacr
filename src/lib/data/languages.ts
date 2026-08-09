// Languages a professional can declare they speak. IDs are stable (English),
// `label` is Spanish-first UI copy, `labelEn` the English rendering. Used by the
// profile language picker, filters and the public profile. Resolve with
// languageLabel(id, locale) so the value follows the active locale.
export const LANGUAGES = [
  { id: "es", label: "Español", labelEn: "Spanish" },
  { id: "en", label: "Inglés", labelEn: "English" },
  { id: "fr", label: "Francés", labelEn: "French" },
  { id: "pt", label: "Portugués", labelEn: "Portuguese" },
  { id: "zh", label: "Mandarín", labelEn: "Mandarin" },
  { id: "ja", label: "Japonés", labelEn: "Japanese" },
  { id: "lsr", label: "LESCO", labelEn: "LESCO" },
] as const;

export function languageLabel(id: string, locale?: string): string {
  const needle = id.trim().toLowerCase();
  const l = LANGUAGES.find((x) => x.id === id || x.label.toLowerCase() === needle || x.labelEn.toLowerCase() === needle);
  if (!l && ["english", "english program", "inglés", "ingles"].includes(needle)) {
    return locale === "en" ? "English" : "Inglés";
  }
  if (!l && ["spanish", "español", "espanol"].includes(needle)) {
    return locale === "en" ? "Spanish" : "Español";
  }
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
  const legacyMatch =
    ["english", "english program", "inglés", "ingles"].includes(needle) ? LANGUAGES.find((x) => x.id === "en") :
    ["spanish", "español", "espanol"].includes(needle) ? LANGUAGES.find((x) => x.id === "es") :
    null;
  const resolved = match ?? legacyMatch;
  return Array.from(new Set([raw, resolved?.id, resolved?.label, resolved?.labelEn].filter(Boolean) as string[]));
}
