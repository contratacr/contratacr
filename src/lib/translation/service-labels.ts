import { autoEnglishCategoryLabel, normalizeText } from "@/lib/data/categories";
import { createSign } from "crypto";

const DEFAULT_LOCATION = "global";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TRANSLATION_SCOPE = "https://www.googleapis.com/auth/cloud-translation";
const BASIC_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function cleanTranslation(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function base64Url(input: string) {
  return Buffer.from(input).toString("base64url");
}

function readServiceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_TRANSLATE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const account = readServiceAccount();
  const email = account?.client_email;
  const privateKey = account?.private_key?.replace(/\\n/g, "\n");
  if (!email || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: email,
    scope: TRANSLATION_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }));
  const unsigned = `${header}.${claim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    cache: "no-store",
  });
  if (!res.ok) return null;

  const data = await res.json();
  const token = typeof data.access_token === "string" ? data.access_token : "";
  const expiresIn = typeof data.expires_in === "number" ? data.expires_in : 3600;
  if (!token) return null;

  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  return token;
}

type TranslateTarget = "en" | "es";

function localFallback(label: string, target: TranslateTarget) {
  if (target === "en") return autoEnglishCategoryLabel(label);
  return label.trim();
}

async function translateWithApiKey(label: string, target: TranslateTarget, source?: TranslateTarget) {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY?.trim();
  if (!key) return "";

  const url = new URL(BASIC_TRANSLATE_URL);
  url.searchParams.set("key", key);

  const body: Record<string, string> = {
    q: label,
    target,
    format: "text",
  };
  if (source) body.source = source;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return "";

  const data = await res.json();
  return cleanTranslation(data?.data?.translations?.[0]?.translatedText);
}

async function translateWithServiceAccount(label: string, projectId: string, target: TranslateTarget, source?: TranslateTarget) {
  const token = await getAccessToken();
  if (!token) return "";

  const location = process.env.GOOGLE_TRANSLATE_LOCATION?.trim() || DEFAULT_LOCATION;
  const url = `https://translation.googleapis.com/v3/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}:translateText`;

  const body: Record<string, unknown> = {
    contents: [label],
    mimeType: "text/plain",
    targetLanguageCode: target,
  };
  if (source) body.sourceLanguageCode = source;

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return "";

  const data = await res.json();
  return cleanTranslation(data?.translations?.[0]?.translatedText);
}

export async function translateServiceLabel(label: string, target: TranslateTarget, source?: TranslateTarget): Promise<string> {
  const cleanLabel = label.trim();
  const fallback = localFallback(cleanLabel, target);
  if (!cleanLabel) return fallback;

  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim();
    const translated = projectId
      ? await translateWithServiceAccount(cleanLabel, projectId, target, source)
      : await translateWithApiKey(cleanLabel, target, source);
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

export async function suggestEnglishServiceLabel(label: string): Promise<string> {
  return translateServiceLabel(label, "en");
}

export async function suggestSpanishServiceLabel(label: string): Promise<string> {
  return translateServiceLabel(label, "es");
}
