"use client";

import { useState } from "react";

// Famous Costa Rican brands — rendered as clean styled TEXT (no logos/images),
// which avoids broken-image "question marks" on mobile.
const BRANDS = [
  "Dos Pinos",
  "Florida Ice & Farm",
  "Grupo Britt",
  "Palí",
  "Walmart CR",
  "Automercado",
  "Claro CR",
  "Kolbi",
  "Movistar CR",
  "BAC Credomatic",
  "Banco Nacional",
  "BCR",
];

const DOUBLED = [...BRANDS, ...BRANDS];

export function MarqueeStrip() {
  const [paused, setPaused] = useState(false);

  return (
    <section
      style={{
        background: "#ffffff",
        borderTop: "1px solid #f3f4f6",
        borderBottom: "1px solid #f3f4f6",
        paddingTop: 32,
        paddingBottom: 32,
      }}
    >
      <p
        style={{
          textAlign: "center",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#9ca3af",
          marginBottom: 20,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Impulsando proyectos en toda Costa Rica.
      </p>

      <div
        style={{
          overflow: "hidden",
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
          maskImage:
            "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)",
        }}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className="animate-marquee-infinite"
          style={{
            display: "flex",
            width: "max-content",
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {DOUBLED.map((name, i) => (
            <span
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 36px",
                height: 40,
                flexShrink: 0,
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#1a2744",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
