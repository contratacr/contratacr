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

function LogoWordmark({ src }: { src: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width="318"
        height="72"
        alt="ContrataCR"
        style={{ display: "block", width: 318, height: 72, objectFit: "contain" }}
      />
    </div>
  );
}

function SearchIcon() {
  return (
    <div style={{ display: "flex", width: 30, height: 30, position: "relative" }}>
      <div
        style={{
          position: "absolute",
          left: 3,
          top: 3,
          width: 17,
          height: 17,
          borderRadius: 999,
          border: "4px solid #009FD9",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          width: 12,
          height: 4,
          borderRadius: 999,
          background: "#009FD9",
          transform: "rotate(45deg)",
        }}
      />
    </div>
  );
}

function PinIcon() {
  return (
    <div
      style={{
        display: "flex",
        width: 21,
        height: 21,
        borderRadius: 999,
        border: "3px solid #009FD9",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ display: "flex", width: 6, height: 6, borderRadius: 999, background: "#009FD9" }} />
    </div>
  );
}

function CategoryPill({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        background: "#ffffff",
        color: "#162543",
        border: "1px solid #d8e8f2",
        padding: "10px 16px",
        fontSize: 20,
        fontWeight: 850,
        boxShadow: "0 14px 28px rgba(22, 37, 67, 0.06)",
      }}
    >
      {label}
    </div>
  );
}

function VerifiedBadge({ label }: { label: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-start",
        borderRadius: 999,
        background: "#009FD9",
        color: "#ffffff",
        padding: "5px 10px",
        fontSize: 14,
        fontWeight: 900,
      }}
    >
      {label}
    </div>
  );
}

function MiniProfessionalCard({
  initials,
  name,
  service,
  location,
  verified,
}: {
  initials: string;
  name: string;
  service: string;
  location: string;
  verified: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        borderRadius: 24,
        background: "#ffffff",
        border: "1px solid #dfe7ef",
        padding: "20px",
        boxShadow: "0 18px 40px rgba(22, 37, 67, 0.10)",
      }}
    >
      <div
        style={{
          display: "flex",
          width: 66,
          height: 66,
          borderRadius: 999,
          background: "#EBF5FB",
          color: "#009FD9",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 25,
          fontWeight: 900,
        }}
      >
        {initials}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, marginLeft: 16, gap: 7 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0, gap: 5 }}>
            <div style={{ display: "flex", color: "#162543", fontSize: 24, fontWeight: 900, lineHeight: 1.02 }}>
              {name}
            </div>
            <VerifiedBadge label={verified} />
          </div>
        </div>
        <div style={{ display: "flex", color: "#607089", fontSize: 19, fontWeight: 750 }}>{service}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#009FD9", fontSize: 18, fontWeight: 850 }}>
          <PinIcon />
          {location}
        </div>
      </div>
    </div>
  );
}

function PhonePreview({
  resultTitle,
  searchPlaceholder,
  verifiedLabel,
  cards,
}: {
  resultTitle: string;
  searchPlaceholder: string;
  verifiedLabel: string;
  cards: Array<{
    initials: string;
    name: string;
    service: string;
    location: string;
  }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        width: 405,
        height: 516,
        borderRadius: 42,
        background: "#ffffff",
        border: "1px solid #dbe6ee",
        boxShadow: "0 34px 90px rgba(22, 37, 67, 0.18)",
        padding: 24,
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderRadius: 999,
          background: "#f7fbfe",
          border: "1px solid #dbe6ee",
          padding: "12px 16px",
          color: "#8b98aa",
          fontSize: 21,
          fontWeight: 750,
        }}
      >
        <SearchIcon />
        {searchPlaceholder}
      </div>
      <div style={{ display: "flex", marginTop: 22, color: "#162543", fontSize: 24, fontWeight: 900 }}>
        {resultTitle}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 18 }}>
        {cards.map((card) => (
          <MiniProfessionalCard key={card.name} verified={verifiedLabel} {...card} />
        ))}
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isEn = locale === "en";
  const logoSrc = await logoWordmarkDataUrl();

  const copy = isEn
    ? {
        eyebrow: "Services marketplace in Costa Rica",
        titleLines: ["Find services", "in Costa Rica"],
        subtitle: "Search by service and coordinate directly.",
        search: "I need home cleaning",
        phoneSearch: "Search a service",
        resultTitle: "3 professionals near you",
        verified: "Verified",
        chips: ["Home", "Health", "Technology", "Education"],
        cards: [
          { initials: "SV", name: "Sharon Velasquez", service: "Digital marketing", location: "Atenas, Alajuela" },
          { initials: "CR", name: "Test Company", service: "Plumbing", location: "San José, San José" },
        ],
      }
    : {
        eyebrow: "Servicios en Costa Rica",
        titleLines: ["Contrata servicios", "en Costa Rica"],
        subtitle: "Busca por servicio y coordina directo.",
        search: "Necesito limpiar mi casa",
        phoneSearch: "Busca un servicio",
        resultTitle: "3 profesionales cerca de ti",
        verified: "Verificado",
        chips: ["Hogar", "Salud", "Tecnología", "Educación"],
        cards: [
          { initials: "SV", name: "Sharon Velasquez", service: "Marketing digital", location: "Atenas, Alajuela" },
          { initials: "CR", name: "Test Company", service: "Plomería", location: "San José, San José" },
        ],
      };

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#eef6fb",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -90,
            top: -130,
            width: 390,
            height: 390,
            borderRadius: 999,
            background: "#ccecf8",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -120,
            bottom: -150,
            width: 430,
            height: 430,
            borderRadius: 999,
            background: "#dff3fb",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 52,
            top: 52,
            right: 52,
            bottom: 52,
            display: "flex",
            borderRadius: 44,
            background: "#ffffff",
            border: "1px solid #dce8f0",
            boxShadow: "0 30px 90px rgba(22, 37, 67, 0.14)",
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
              padding: "52px 36px 52px 58px",
            }}
          >
            <LogoWordmark src={logoSrc} />

            <div
              style={{
                display: "flex",
                alignSelf: "flex-start",
                marginTop: 30,
                borderRadius: 999,
                background: "#EBF5FB",
                color: "#0089bb",
                padding: "9px 15px",
                fontSize: 20,
                fontWeight: 900,
              }}
            >
              {copy.eyebrow}
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 22,
                fontSize: 58,
                lineHeight: 1.02,
                letterSpacing: 0,
                fontWeight: 900,
                color: "#162543",
                maxWidth: 610,
              }}
            >
              {copy.titleLines.map((line) => (
                <div key={line} style={{ display: "flex" }}>
                  {line}
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 25,
                lineHeight: 1.25,
                color: "#607089",
                fontWeight: 750,
                maxWidth: 600,
              }}
            >
              {copy.subtitle}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: 570,
                marginTop: 30,
                borderRadius: 999,
                background: "#ffffff",
                border: "1px solid #d5e5ef",
                boxShadow: "0 20px 42px rgba(22, 37, 67, 0.09)",
                padding: "16px 20px",
                color: "#162543",
                fontSize: 25,
                fontWeight: 850,
              }}
            >
              <SearchIcon />
              {copy.search}
            </div>

            <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap", maxWidth: 620 }}>
              {copy.chips.map((chip) => (
                <CategoryPill key={chip} label={chip} />
              ))}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 466,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              background: "#f7fbfe",
              borderLeft: "1px solid #dce8f0",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                right: 38,
                top: 56,
                width: 72,
                height: 72,
                borderRadius: 999,
                background: "#009FD9",
                opacity: 0.12,
              }}
            />
            <PhonePreview
              resultTitle={copy.resultTitle}
              searchPlaceholder={copy.phoneSearch}
              verifiedLabel={copy.verified}
              cards={copy.cards}
            />
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
