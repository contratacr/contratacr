export type RuntimeErrorKind = "offline" | "unavailable" | "generic";

// Un trozo de código que ya no existe en el servidor: pasa cuando se publica
// una versión nueva y la pantalla abierta pide el archivo viejo. No es un fallo
// del app; se arregla recargando.
const CHUNK_PATTERNS = [
  "failed to load chunk",
  "loading chunk",
  "chunkloaderror",
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "importing a module script failed",
];

export function isStaleChunkError(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  return CHUNK_PATTERNS.some((p) => text.includes(p));
}

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
