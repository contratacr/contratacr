export type RuntimeErrorKind = "offline" | "unavailable" | "generic";

const UNAVAILABLE_PATTERNS = [
  "failed to fetch",
  "fetch failed",
  "networkerror",
  "network error",
  "service unavailable",
  "temporarily unavailable",
  "timeout",
  "timed out",
  "aborterror",
  "500",
  "502",
  "503",
  "504",
  "supabase",
  "postgrest",
  "pgrst",
  "econnreset",
  "econnrefused",
  "etimedout",
  "oom command not allowed",
  "maxmemory",
];

function errorText(error: unknown) {
  if (!error) return "";
  if (error instanceof Error) {
    return `${error.name} ${error.message} ${"digest" in error ? String(error.digest ?? "") : ""}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function getRuntimeErrorKind(error: unknown, isOffline: boolean): RuntimeErrorKind {
  if (isOffline) return "offline";
  const text = errorText(error).toLowerCase();
  if (UNAVAILABLE_PATTERNS.some((pattern) => text.includes(pattern))) return "unavailable";
  return "generic";
}
