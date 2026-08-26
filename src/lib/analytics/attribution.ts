// First-touch marketing attribution, kept in the browser until the person
// registers. A visitor who lands from an ad carries utm_* parameters (or a
// platform click id) only on that first URL; by the time they sign up — often
// days later, from the home page — that information is gone unless we keep it.
//
// "First touch" wins: the stored record is never overwritten by a later visit,
// because the question the owner asks is "what brought this person here",
// not "what page were they on when they finally signed up".

export type Attribution = {
  source: string;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  landingPath: string;
  referrerHost: string | null;
  capturedAt: string;
};

const STORAGE_KEY = "contratacr:attribution";
const TTL_MS = 30 * 86400000;

function clean(value: string | null | undefined, max = 80): string | null {
  const v = (value ?? "").trim().toLowerCase().slice(0, max);
  return v ? v : null;
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

// Without utm_source we still know quite a lot: the click ids TikTok/Google
// append to ad links, and the referrer for organic social/search traffic.
// `fbclid` is deliberately NOT treated as paid: Facebook appends it to every
// outbound click, groups and posts included, and our ads always carry utm_*.
function deriveSource(params: URLSearchParams, referrerHost: string | null): { source: string; medium: string | null } {
  if (params.get("ttclid")) return { source: "tiktok", medium: "paid" };
  if (params.get("gclid")) return { source: "google", medium: "paid" };
  if (params.get("fbclid")) {
    return referrerHost && /instagram\.com$/.test(referrerHost) ? { source: "instagram", medium: "organic" } : { source: "facebook", medium: "organic" };
  }
  if (!referrerHost) return { source: "direct", medium: null };
  if (/(^|\.)instagram\.com$/.test(referrerHost)) return { source: "instagram", medium: "organic" };
  if (/(^|\.)(facebook\.com|fb\.com|messenger\.com)$/.test(referrerHost)) return { source: "facebook", medium: "organic" };
  if (/(^|\.)tiktok\.com$/.test(referrerHost)) return { source: "tiktok", medium: "organic" };
  if (/(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com)$/.test(referrerHost)) return { source: "google", medium: "organic" };
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(referrerHost)) return { source: "whatsapp", medium: "referral" };
  if (/(^|\.)contratacr\.com$/.test(referrerHost)) return { source: "direct", medium: null };
  return { source: "other", medium: "referral" };
}

export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.source || !parsed.capturedAt) return null;
    if (Date.now() - new Date(parsed.capturedAt).getTime() > TTL_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// Called once per page load. Keeps the existing record unless it expired, or
// unless THIS visit carries explicit campaign parameters — a paid click must
// not be credited to an older organic visit.
export function captureAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = clean(params.get("utm_source"));
    const hasClickId = !!(params.get("ttclid") || params.get("gclid"));
    const existing = readAttribution();
    if (existing && !utmSource && !hasClickId) return existing;

    const referrerHost = hostOf(document.referrer);
    const derived = deriveSource(params, referrerHost);
    const record: Attribution = {
      source: utmSource ?? derived.source,
      medium: clean(params.get("utm_medium")) ?? derived.medium,
      campaign: clean(params.get("utm_campaign"), 120),
      content: clean(params.get("utm_content"), 120),
      landingPath: window.location.pathname.slice(0, 200),
      referrerHost,
      capturedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    return record;
  } catch {
    return null;
  }
}

export function clearAttribution() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
