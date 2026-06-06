// Languages a professional can declare they speak. IDs are stable (English),
// labels are Spanish-first UI copy.
export const LANGUAGES = [
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "fr", label: "Francés" },
  { id: "pt", label: "Portugués" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Alemán" },
  { id: "zh", label: "Mandarín" },
  { id: "ja", label: "Japonés" },
  { id: "other", label: "Otro" },
] as const;

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
