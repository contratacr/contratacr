"use client";

import { useEffect, useState } from "react";
import { getRuntimeErrorKind } from "@/lib/errors/runtime-error-kind";

// Root-level boundary (catches errors in the root layout itself). Must render
// its own <html>/<body> and can't rely on the app stylesheet having loaded —
// so it's on-brand via inline styles (navy #1a2744 + blue #009FD9 + logo).
export default function GlobalError({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const [offline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);
  const retry = unstable_retry ?? reset ?? (() => window.location.reload());
  const kind = getRuntimeErrorKind(error, offline);
  const title =
    kind === "offline"
      ? "Sin conexión a internet"
      : kind === "unavailable"
        ? "Servicio temporalmente no disponible"
        : "Servicio temporalmente fuera de línea";
  const message =
    kind === "offline"
      ? "Revisa tu conexión y vuelve a intentarlo; tus datos están a salvo."
      : kind === "unavailable"
        ? "Hay un problema temporal de conexión o proveedor. Intenta de nuevo en unos minutos; si estabas guardando algo, espera antes de enviarlo otra vez."
        : "Estamos trabajando para restablecerlo. Intenta de nuevo en unos minutos; tus datos están a salvo.";

  useEffect(() => {
    console.error("[global error boundary]", error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif", background: "#ffffff" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 16px", textAlign: "center", boxSizing: "border-box" }}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" aria-label="ContrataCR inicio" style={{ display: "inline-flex", alignItems: "center", gap: 2, marginBottom: 36, textDecoration: "none" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark-transparent.png" alt="ContrataCR" width={28} height={28} style={{ height: 28, width: 28 }} />
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
              <span style={{ color: "#1a2744" }}>Contrata</span><span style={{ color: "#009FD9" }}>CR</span>
            </span>
          </a>

          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#1a2744", margin: 0, lineHeight: 1.2 }}>
            {title}
          </h1>
          <p style={{ color: "#6b7280", marginTop: 12, maxWidth: 420, fontSize: 15, lineHeight: 1.6 }}>
            {message}
          </p>

          <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <button
              onClick={retry}
              style={{ background: "#009FD9", color: "white", border: "none", borderRadius: 12, padding: "12px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              Reintentar
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{ border: "1px solid #e5e7eb", color: "#374151", background: "white", borderRadius: 12, padding: "12px 22px", fontWeight: 700, fontSize: 14, textDecoration: "none" }}
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
