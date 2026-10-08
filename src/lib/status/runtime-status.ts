type RuntimeStatusLevel = "info" | "warning" | "critical";

export type OperationalStatusBanner = {
  id: string;
  level: RuntimeStatusLevel;
  message: string;
  href?: string;
};
const LEVELS = new Set<RuntimeStatusLevel>(["info", "warning", "critical"]);

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function statusId(message: string, level: RuntimeStatusLevel) {
  const compact = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `operational-${level}-${compact || "notice"}`;
}

export function getOperationalStatusBanner(locale: string): OperationalStatusBanner | null {
  const normalizedLocale = locale === "en" ? "EN" : "ES";
  const message =
    readEnv(`NEXT_PUBLIC_STATUS_BANNER_${normalizedLocale}`) ??
    readEnv(`STATUS_BANNER_${normalizedLocale}`) ??
    readEnv("NEXT_PUBLIC_STATUS_BANNER") ??
    readEnv("STATUS_BANNER");

  if (!message) return null;

  const rawLevel = (
    readEnv("NEXT_PUBLIC_STATUS_BANNER_LEVEL") ??
    readEnv("STATUS_BANNER_LEVEL") ??
    "warning"
  ).toLowerCase();
  const level = LEVELS.has(rawLevel as RuntimeStatusLevel)
    ? (rawLevel as RuntimeStatusLevel)
    : "warning";

  const href =
    readEnv(`NEXT_PUBLIC_STATUS_BANNER_HREF_${normalizedLocale}`) ??
    readEnv(`STATUS_BANNER_HREF_${normalizedLocale}`) ??
    readEnv("NEXT_PUBLIC_STATUS_BANNER_HREF") ??
    readEnv("STATUS_BANNER_HREF");

  return {
    id: statusId(message, level),
    level,
    message,
    href,
  };
}
