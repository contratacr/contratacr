"use client";

import { useState } from "react";

/* TODO: Confirm real partner/media logos with the business team before going live */

interface LogoEntry {
  type: "img";
  url: string;
  name: string;
}
interface TextEntry {
  type: "text";
  name: string;
}
type Entry = LogoEntry | TextEntry;

const CLEARBIT: LogoEntry[] = [
  { type: "img", url: "https://logo.clearbit.com/nacion.com",        name: "La Nacion" },
  { type: "img", url: "https://logo.clearbit.com/crhoy.com",         name: "CRHoy" },
  { type: "img", url: "https://logo.clearbit.com/ticotimes.net",     name: "Tico Times" },
  { type: "img", url: "https://logo.clearbit.com/elfinancierocr.com",name: "El Financiero" },
  { type: "img", url: "https://logo.clearbit.com/teletica.com",      name: "Teletica" },
  { type: "img", url: "https://logo.clearbit.com/repretel.com",      name: "Repretel" },
  { type: "img", url: "https://logo.clearbit.com/larepublica.net",   name: "La Republica" },
  { type: "img", url: "https://logo.clearbit.com/ameliarueda.com",   name: "Amelia Rueda" },
  { type: "img", url: "https://logo.clearbit.com/monumental.cr",     name: "Monumental" },
  { type: "img", url: "https://logo.clearbit.com/cinde.org",         name: "CINDE" },
  { type: "img", url: "https://logo.clearbit.com/procomer.com",      name: "PROCOMER" },
  { type: "img", url: "https://logo.clearbit.com/cfia.or.cr",        name: "CFIA" },
  { type: "img", url: "https://logo.clearbit.com/camara.cr",         name: "Camara CR" },
  { type: "img", url: "https://logo.clearbit.com/encuentra24.com",   name: "Encuentra24" },
  { type: "img", url: "https://logo.clearbit.com/olx.co.cr",         name: "OLX" },
];

const TEXT_ONLY: TextEntry[] = [
  { type: "text", name: "Delfino CR" },
  { type: "text", name: "Semanario Universidad" },
  { type: "text", name: "El Pais CR" },
  { type: "text", name: "Canal 6" },
  { type: "text", name: "Multimedios" },
  { type: "text", name: "Radio Columbia" },
  { type: "text", name: "Prensa Libre CR" },
  { type: "text", name: "Encuentra.com" },
  { type: "text", name: "CCSS" },
  { type: "text", name: "Hacienda CR" },
];

/* Interleave clearbit + text for visual variety */
const BASE: Entry[] = [];
for (let i = 0; i < Math.max(CLEARBIT.length, TEXT_ONLY.length); i++) {
  if (i < CLEARBIT.length)  BASE.push(CLEARBIT[i]);
  if (i < TEXT_ONLY.length) BASE.push(TEXT_ONLY[i]);
}

/* Triple for seamless infinite scroll */
const ITEMS = [...BASE, ...BASE, ...BASE];

/* ─── Single logo item — handles img→text fallback ─── */
function LogoItem({ entry, idx }: { entry: Entry; idx: number }) {
  const [failed, setFailed] = useState(false);

  const sharedStyle: React.CSSProperties = {
    filter: "grayscale(100%)",
    opacity: 0.5,
    transition: "filter 0.3s ease, opacity 0.3s ease",
    cursor: "default",
    userSelect: "none",
    flexShrink: 0,
  };

  function onMouseEnter(e: React.MouseEvent<HTMLElement>) {
    (e.currentTarget as HTMLElement).style.filter = "grayscale(0%)";
    (e.currentTarget as HTMLElement).style.opacity = "1";
  }
  function onMouseLeave(e: React.MouseEvent<HTMLElement>) {
    (e.currentTarget as HTMLElement).style.filter = "grayscale(100%)";
    (e.currentTarget as HTMLElement).style.opacity = "0.5";
  }

  if (entry.type === "img" && !failed) {
    return (
      <img
        key={idx}
        src={entry.url}
        alt={entry.name}
        onError={() => setFailed(true)}
        style={{ ...sharedStyle, height: 32, width: "auto", objectFit: "contain" }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    );
  }

  /* Text fallback */
  return (
    <span
      key={idx}
      style={{
        ...sharedStyle,
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
        color: "#9ca3af",
        lineHeight: "32px",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {entry.name}
    </span>
  );
}

export function MarqueeStrip() {
  return (
    <section
      style={{
        background: "#ffffff",
        padding: "40px 0",
        overflow: "hidden",
      }}
    >
      {/* Keyframe injected inline so no globals.css edit needed */}
      <style>{`
        @keyframes marquee-brand {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.3333%); }
        }
      `}</style>

      {/* Title */}
      <p className="text-center mb-8 font-extrabold text-[#1a2744] text-xl sm:text-2xl tracking-tight px-4">
        Impulsando proyectos en toda Costa Rica.
      </p>

      {/* Masked scroll track */}
      <div
        style={{
          WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          maskImage:        "linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "max-content",
            animation: "marquee-brand 40s linear infinite",
            alignItems: "center",
            gap: 0,
          }}
        >
          {ITEMS.map((entry, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0 40px",
                height: 32,
                flexShrink: 0,
              }}
            >
              <LogoItem entry={entry} idx={i} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
