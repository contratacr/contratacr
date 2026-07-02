import { ImageResponse } from "next/og";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "ContrataCR";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

let logoWordmarkCache: string | null = null;

async function logoWordmarkDataUrl() {
  if (logoWordmarkCache) return logoWordmarkCache;
  const bytes = await readFile(join(process.cwd(), "public", "logo-wordmark-transparent.png"));
  logoWordmarkCache = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  return logoWordmarkCache;
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        background: "#eff8fc",
        color: "#162543",
        border: "1px solid #cfeaf6",
        padding: "10px 18px",
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      {children}
    </div>
  );
}

function ResultRow({ title, location }: { title: string; location: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        borderRadius: 24,
        background: "#ffffff",
        border: "1px solid #dfe7ef",
        padding: "22px 24px",
        boxShadow: "0 18px 38px rgba(22, 37, 67, 0.08)",
      }}
    >
      <div style={{ display: "flex", color: "#162543", fontSize: 27, fontWeight: 900 }}>{title}</div>
      <div style={{ display: "flex", color: "#009FD9", fontSize: 21, fontWeight: 800 }}>{location}</div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isEn = locale === "en";
  const logoSrc = await logoWordmarkDataUrl();
  const titleLines = isEn
    ? [["Hire", "services"], ["in", "Costa", "Rica"]]
    : [["Contrata", "servicios"], ["en", "Costa", "Rica"]];
  const subtitle = isEn
    ? "Find professionals by service and location, then coordinate directly."
    : "Encuentra profesionales por servicio y ubicación, y coordina directo.";
  const pills = isEn
    ? ["Home", "Health", "Technology", "Education"]
    : ["Hogar", "Salud", "Tecnología", "Educación"];
  const rows = isEn
    ? [
        ["Plumbing", "Atenas, Alajuela"],
        ["General medicine", "San José, San José"],
        ["Tech support", "Heredia, Heredia"],
      ]
    : [
        ["Plomería", "Atenas, Alajuela"],
        ["Medicina general", "San José, San José"],
        ["Soporte técnico", "Heredia, Heredia"],
      ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#eef5fa",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
          padding: 52,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            borderRadius: 44,
            background: "#ffffff",
            border: "1px solid #dfe7ef",
            boxShadow: "0 28px 76px rgba(22, 37, 67, 0.14)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              flex: 1,
              minWidth: 0,
              flexDirection: "column",
              justifyContent: "center",
              padding: "58px 46px 58px 66px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoSrc}
              width="360"
              height="86"
              alt="ContrataCR"
              style={{
                display: "block",
                width: 360,
                height: 86,
                objectFit: "contain",
              }}
            />

            <div
              style={{
                display: "flex",
                marginTop: 32,
                fontSize: 54,
                lineHeight: 1.05,
                letterSpacing: 0,
                fontWeight: 900,
                color: "#162543",
                maxWidth: 610,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column" }}>
                {titleLines.map((line) => (
                  <div key={line.join("-")} style={{ display: "flex", gap: 12 }}>
                    {line.map((word) => (
                      <div key={word} style={{ display: "flex" }}>
                        {word}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 24,
                lineHeight: 1.25,
                color: "#607089",
                fontWeight: 750,
                maxWidth: 700,
              }}
            >
              {subtitle}
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap", maxWidth: 760 }}>
              {pills.map((pill) => (
                <Pill key={pill}>{pill}</Pill>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 370,
              flexShrink: 0,
              flexDirection: "column",
              justifyContent: "center",
              gap: 18,
              background: "#f5fbfe",
              borderLeft: "1px solid #dfe7ef",
              padding: "48px 36px",
            }}
          >
            {rows.map(([rowTitle, location]) => (
              <ResultRow key={rowTitle} title={rowTitle} location={location} />
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
