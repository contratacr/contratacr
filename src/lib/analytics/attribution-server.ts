// Server-side counterpart of ./attribution: bounds whatever the browser sent
// before it reaches `profiles`. Values are free text chosen by whoever builds
// the ad link, so they are lowercased, trimmed and length-capped, nothing more.

export type AttributionColumns = {
  acquisition_source: string;
  acquisition_medium: string | null;
  acquisition_campaign: string | null;
  acquisition_content: string | null;
  acquisition_landing_path: string | null;
  acquisition_referrer_host: string | null;
  acquisition_captured_at: string | null;
};

export const ATTRIBUTION_COLUMN_NAMES = [
  "acquisition_source",
  "acquisition_medium",
  "acquisition_campaign",
  "acquisition_content",
  "acquisition_landing_path",
  "acquisition_referrer_host",
  "acquisition_captured_at",
] as const;

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max);
  return v || null;
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

// Returns null when the body carries nothing usable, so a missing record never
// overwrites a value already stored (e.g. a client later becoming a professional).
export function attributionColumnsFromBody(raw: unknown): AttributionColumns | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const source = text(body.source, 80);
  if (!source) return null;
  return {
    acquisition_source: source,
    acquisition_medium: text(body.medium, 80),
    acquisition_campaign: text(body.campaign, 120),
    acquisition_content: text(body.content, 120),
    acquisition_landing_path: text(body.landingPath, 200),
    acquisition_referrer_host: text(body.referrerHost, 120),
    acquisition_captured_at: isoDate(body.capturedAt),
  };
}

// The register endpoints retry without optional columns when the schema behind
// them is older than the code (see write-guard's created_* pattern).
export function withoutAttributionColumns<T extends Record<string, unknown>>(row: T): Omit<T, (typeof ATTRIBUTION_COLUMN_NAMES)[number]> {
  const copy: Record<string, unknown> = { ...row };
  for (const name of ATTRIBUTION_COLUMN_NAMES) delete copy[name];
  return copy as Omit<T, (typeof ATTRIBUTION_COLUMN_NAMES)[number]>;
}
