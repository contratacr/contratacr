// Languages a professional can declare they speak. IDs are stable (English),
// labels are Spanish-first UI copy. Used by the profile languages chip input.
export const LANGUAGES = [
  { id: "es", label: "Español" },
  { id: "en", label: "Inglés" },
  { id: "fr", label: "Francés" },
  { id: "pt", label: "Portugués" },
  { id: "it", label: "Italiano" },
  { id: "de", label: "Alemán" },
  { id: "zh", label: "Mandarín" },
  { id: "ja", label: "Japonés" },
  { id: "ko", label: "Coreano" },
  { id: "ru", label: "Ruso" },
  { id: "ar", label: "Árabe" },
  { id: "hi", label: "Hindi" },
  { id: "nl", label: "Neerlandés" },
  { id: "sv", label: "Sueco" },
  { id: "no", label: "Noruego" },
  { id: "da", label: "Danés" },
  { id: "fi", label: "Finés" },
  { id: "pl", label: "Polaco" },
  { id: "tr", label: "Turco" },
  { id: "el", label: "Griego" },
  { id: "he", label: "Hebreo" },
  { id: "th", label: "Tailandés" },
  { id: "vi", label: "Vietnamita" },
  { id: "id", label: "Indonesio" },
  { id: "tl", label: "Tagalo" },
  { id: "uk", label: "Ucraniano" },
  { id: "cs", label: "Checo" },
  { id: "ro", label: "Rumano" },
  { id: "hu", label: "Húngaro" },
  { id: "ca", label: "Catalán" },
  { id: "lsr", label: "LESCO (Lengua de Señas Costarricense)" },
] as const;

export function languageLabel(id: string): string {
  return LANGUAGES.find((l) => l.id === id)?.label ?? id;
}
