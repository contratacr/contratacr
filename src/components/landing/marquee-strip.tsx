/* Thumbtack-style partner / media logo marquee */

const LOGOS = [
  { name: "La Nación",   style: { fontSize: 15, fontWeight: 800, letterSpacing: "-0.01em" } },
  { name: "CRHoy",        style: { fontSize: 16, fontWeight: 900, letterSpacing: "0.02em" } },
  { name: "Tico Times",   style: { fontSize: 14, fontWeight: 700, letterSpacing: "0.04em" } },
  { name: "El Financiero",style: { fontSize: 13, fontWeight: 800, letterSpacing: "-0.01em" } },
  { name: "CINDE",        style: { fontSize: 18, fontWeight: 900, letterSpacing: "0.06em" } },
  { name: "PROCOMER",     style: { fontSize: 14, fontWeight: 900, letterSpacing: "0.05em" } },
  { name: "CámaCR",       style: { fontSize: 15, fontWeight: 800, letterSpacing: "0.02em" } },
  { name: "Hacienda CR",  style: { fontSize: 13, fontWeight: 700, letterSpacing: "0.01em" } },
];

const DOUBLED = [...LOGOS, ...LOGOS];

export function MarqueeStrip() {
  return (
    <section
      className="overflow-hidden"
      style={{
        background: "#ffffff",
        borderTop: "1px solid #f0f1f3",
        borderBottom: "1px solid #f0f1f3",
        padding: "32px 0",
      }}
    >
      {/* Label */}
      <p
        className="text-center mb-6 font-extrabold text-[#1a2744] text-xl sm:text-2xl tracking-tight"
      >
        Impulsando proyectos en toda Costa Rica.
      </p>

      {/* Scrolling logo strip */}
      <div
        className="flex animate-logo-scroll"
        style={{ width: "max-content", gap: 0 }}
      >
        {DOUBLED.map((logo, i) => (
          <div
            key={i}
            className="flex items-center shrink-0"
            style={{ padding: "0 40px" }}
          >
            <span
              style={{
                ...logo.style,
                color: "#c0c7d0",
                whiteSpace: "nowrap",
                userSelect: "none",
                transition: "color 0.2s",
              }}
              className="hover:!text-[#9ca3af] cursor-default"
            >
              {logo.name}
            </span>
            <span style={{ color: "#e5e7eb", margin: "0 0 0 40px", fontSize: 20, lineHeight: 1 }}>·</span>
          </div>
        ))}
      </div>
    </section>
  );
}
