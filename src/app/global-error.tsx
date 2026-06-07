"use client";

// Root-level boundary (catches errors in the root layout itself). Must render
// its own <html>/<body>. Kept intentionally minimal — the localized error.tsx
// handles the common case with full branding.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "Arial, sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", margin: 0, background: "#f4f7fa" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 24, color: "#111827" }}>Servicio temporalmente fuera de línea</h1>
          <p style={{ color: "#6b7280", marginTop: 8 }}>Estamos trabajando para restablecerlo. Intentá de nuevo en unos minutos.</p>
          <button
            onClick={reset}
            style={{ marginTop: 20, background: "#009FD9", color: "white", border: "none", borderRadius: 12, padding: "12px 20px", fontWeight: 700, cursor: "pointer" }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
