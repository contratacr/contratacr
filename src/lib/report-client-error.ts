"use client";

/**
 * Manda un error a /api/client-error. Nunca lanza ni bloquea: si falla, se
 * pierde el reporte y ya. `keepalive` para que salga aunque la pantalla se esté
 * cayendo.
 */
export function reportClientError(origen: "boundary" | "window" | "rejection", error: unknown, extra?: { pathname?: string }) {
  try {
    const e = error as { message?: string; stack?: string; digest?: string } | undefined;
    const message = (e?.message ? String(e.message) : String(error)).slice(0, 500);
    if (!message || message === "undefined") return;
    const native = typeof document !== "undefined" && document.documentElement.classList.contains("ccr-native-app");
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        origen,
        message,
        stack: [e?.digest ? `digest:${e.digest}` : "", e?.stack ?? ""].filter(Boolean).join("\n").slice(0, 4000),
        pathname: extra?.pathname ?? (typeof window !== "undefined" ? window.location.pathname : ""),
        native,
      }),
    }).catch(() => {});
  } catch { /* nunca estorbar */ }
}
