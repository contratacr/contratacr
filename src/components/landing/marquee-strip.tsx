const ITEMS = [
  "Cedula verificada",
  "Contacto por WhatsApp",
  "Sin intermediarios",
  "Solo en Costa Rica",
  "Profesionales reales",
  "100% gratis buscar",
  "Disponibles en tu canton",
  "Perfiles con resenas",
  "Pago directo al profesional",
  "Proyectos en todo el pais",
];

const DOUBLED = [...ITEMS, ...ITEMS];

export function MarqueeStrip() {
  return (
    <div
      className="overflow-hidden"
      style={{
        background: "#f8f9fa",
        borderTop: "1px solid #f0f1f2",
        borderBottom: "1px solid #f0f1f2",
        padding: "16px 0",
      }}
    >
      <div
        className="flex animate-marquee-infinite"
        style={{ width: "max-content", gap: 0 }}
      >
        {DOUBLED.map((item, i) => (
          <div
            key={i}
            className="flex items-center shrink-0"
            style={{ padding: "0 28px" }}
          >
            <span
              style={{
                color: "#9ca3af",
                fontSize: 15,
                fontWeight: 600,
                letterSpacing: "0.02em",
                whiteSpace: "nowrap",
                fontFamily: "system-ui, -apple-system, sans-serif",
              }}
            >
              {item}
            </span>
            <span
              style={{
                color: "#d1d5db",
                margin: "0 0 0 28px",
                fontSize: 14,
                lineHeight: 1,
                fontWeight: 400,
              }}
            >
              |
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
