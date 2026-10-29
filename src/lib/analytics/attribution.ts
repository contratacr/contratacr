import { analyticsMeasurementEnabled } from "@/lib/privacy/optional-consent";
// Preserve the first available marketing touch separately from the most recent
// explicit campaign. Existing callers keep reading the recent record; actions
// also carry the original touch, so returning users can be attributed without
// rewriting their account's acquisition source. Both expire after thirty days.

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
const FIRST_KEY = "contratacr:attribution-first";
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
  if (typeof window === "undefined" || !analyticsMeasurementEnabled()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.source || !parsed.capturedAt) return null;
    const age = Date.now() - new Date(parsed.capturedAt).getTime();
    if (!Number.isFinite(age) || age < -60000 || age > TTL_MS) {
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
  if (typeof window === "undefined" || !analyticsMeasurementEnabled()) return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const utmSource = clean(params.get("utm_source"));
    const hasClickId = !!(params.get("ttclid") || params.get("gclid"));
    const existing = readAttribution();
    if (existing && !window.localStorage.getItem(FIRST_KEY)) window.localStorage.setItem(FIRST_KEY,JSON.stringify(existing));
    if (existing && !utmSource && !hasClickId) { mirrorActionAttribution(existing); return existing; }

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
    mirrorActionAttribution(record);
    return record;
  } catch {
    return null;
  }
}

function mirrorActionAttribution(recent: Attribution) {
  try {
    const raw = window.localStorage.getItem(FIRST_KEY);
    let first = raw ? JSON.parse(raw) as Attribution : null;
    if (!first || !Number.isFinite(Date.parse(first.capturedAt)) || Date.now()-Date.parse(first.capturedAt)>TTL_MS) {
      first = recent;
      window.localStorage.setItem(FIRST_KEY,JSON.stringify(first));
    }
    const snapshot = { source: recent.source,medium: recent.medium,campaign: recent.campaign,content: recent.content,
      capturedAt: recent.capturedAt,firstSource: first.source,firstCampaign: first.campaign };
    document.cookie = `ccr_action_attribution=${encodeURIComponent(JSON.stringify(snapshot))}; Path=/; SameSite=Lax; Max-Age=2592000${location.protocol === "https:" ? "; Secure" : ""}`;
  } catch { /* no storage: no attribution */ }
}
