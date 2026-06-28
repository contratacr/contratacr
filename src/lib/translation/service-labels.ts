import { autoEnglishCategoryLabel, normalizeText } from "@/lib/data/categories";

const DEFAULT_LOCATION = "global";

function cleanTranslation(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export async function suggestEnglishServiceLabel(label: string): Promise<string> {
  const cleanLabel = label.trim();
  const fallback = autoEnglishCategoryLabel(cleanLabel);
  if (!cleanLabel) return fallback;

  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
  if (!key || !projectId) return fallback;

  try {
    const location = process.env.GOOGLE_TRANSLATE_LOCATION?.trim() || DEFAULT_LOCATION;
    const url = new URL(`https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}:translateText`);
    url.searchParams.set("key", key);

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [cleanLabel],
        mimeType: "text/plain",
        sourceLanguageCode: "es",
        targetLanguageCode: "en",
      }),
      cache: "no-store",
    });
    if (!res.ok) return fallback;

    const data = await res.json();
    const translated = cleanTranslation(data?.translations?.[0]?.translatedText);
    if (!translated) return fallback;

    // Avoid replacing a good local phrase with a no-op translation.
    if (normalizeText(translated) === normalizeText(cleanLabel) && normalizeText(fallback) !== normalizeText(cleanLabel)) {
      return fallback;
    }
    return translated;
  } catch {
    return fallback;
  }
}
