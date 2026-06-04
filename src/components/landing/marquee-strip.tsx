"use client";

import { useRef, useState } from "react";

/* ─── Costa Rican brands ─────────────────────────────────────────────
   Each entry can have an optional logoUrl (Clearbit or direct CDN).
   If the image fails or is absent → falls back to styled text.
   "featured" brands render slightly larger for premium placement.
──────────────────────────────────────────────────────────────────────*/
interface Brand {
  name: string;
  logoUrl?: string;
  featured?: boolean;
}

const BRANDS: Brand[] = [
  { name: "Dos Pinos",        logoUrl: "https://logo.clearbit.com/dospinos.com",       featured: true },
  { name: "Banco Nacional",   logoUrl: "https://logo.clearbit.com/bncr.fi.cr" },
  { name: "EPA",              logoUrl: "https://logo.clearbit.com/epa.cr",             featured: true },
  { name: "Gollo",            logoUrl: "https://logo.clearbit.com/gollo.com" },
  { name: "Auto Mercado",     logoUrl: "https://logo.clearbit.com/automercado.cr",     featured: true },
  { name: "PriceSmart",       logoUrl: "https://logo.clearbit.com/pricesmart.com" },
  { name: "Cemaco",           logoUrl: "https://logo.clearbit.com/cemaco.com" },
  { name: "Teletica",         logoUrl: "https://logo.clearbit.com/teletica.com" },
  { name: "Grupo Monge",      logoUrl: "https://logo.clearbit.com/grupomonge.com",     featured: true },
  { name: "El Colono",        logoUrl: "https://logo.clearbit.com/elcolono.com" },
  { name: "Claro CR",         logoUrl: "https://logo.clearbit.com/claro.cr" },
  { name: "Movistar CR",      logoUrl: "https://logo.clearbit.com/movistar.cr" },
  { name: "Farmacia Fischel", logoUrl: "https://logo.clearbit.com/fischel.com",        featured: true },
  { name: "BCR",              logoUrl: "https://logo.clearbit.com/bancobcr.com" },
  { name: "La Nacion",        logoUrl: "https://logo.clearbit.com/nacion.com" },
  { name: "Repretel",         logoUrl: "https://logo.clearbit.com/repretel.com" },
];

const DOUBLED = [...BRANDS, ...BRANDS];

function BrandItem({ brand }: { brand: Brand }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showLogo = brand.logoUrl && !imgFailed;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 40px",
        height: 72,
        flexShrink: 0,
        opacity: 0.45,
        transition: "opacity 0.25s ease",
        cursor: "default",
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={e => (e.currentTarget.style.opacity = "0.45")}
    >
      {showLogo ? (
        <img
          src={brand.logoUrl}
          alt={brand.name}
          onError={() => setImgFailed(true)}
          style={{
            height: brand.featured ? 36 : 28,
            width: "auto",
            maxWidth: 120,
            objectFit: "contain",
            filter: "grayscale(100%)",
            display: "block",
          }}
        />
      ) : (
        <span
          style={{
            fontFamily: "system-ui, -apple-system, sans-serif",
            fontWeight: 700,
            fontSize: brand.featured ? 16 : 14,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "#374151",
            whiteSpace: "nowrap",
          }}
        >
          {brand.name}
        </span>
      )}
    </div>
  );
}

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
      {/* Label */}
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
        Marcas que confian en ContrataCR
      </p>

      {/* Masked track */}
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
          {DOUBLED.map((brand, i) => (
            <BrandItem key={i} brand={brand} />
          ))}
        </div>
      </div>
    </section>
  );
}
