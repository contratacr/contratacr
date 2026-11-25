import { OTRO_IDIOMA, esValorLibre, textoDeValorLibre } from "@/lib/data/otros-valores";

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
  if (esValorLibre(id, OTRO_IDIOMA)) return textoDeValorLibre(id, OTRO_IDIOMA);
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

/** Id de la lista oficial para un valor guardado ("es", "Español", "english"…); null si no es de la lista. */
export function languageOfficialId(value: string): string | null {
  const needle = value.trim().toLowerCase();
  const match = LANGUAGES.find((x) => x.id === needle || x.label.toLowerCase() === needle || x.labelEn.toLowerCase() === needle);
  if (match) return match.id;
  if (["english", "english program", "inglés", "ingles"].includes(needle)) return "en";
  if (["spanish", "español", "espanol"].includes(needle)) return "es";
  return null;
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
