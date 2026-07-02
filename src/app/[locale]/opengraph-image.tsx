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

function Ring({ left, top, size: ringSize }: { left: number; top: number; size: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width: ringSize,
        height: ringSize,
        borderRadius: 999,
        border: "2px solid rgba(0, 159, 217, 0.12)",
      }}
    />
  );
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isEn = locale === "en";
  const logoSrc = await logoWordmarkDataUrl();
  const subtitle = isEn
    ? "Find and hire professionals in Costa Rica"
    : "Encuentra y contrata profesionales en Costa Rica";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          background: "#ffffff",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <Ring left={-84} top={-130} size={420} />
        <Ring left={20} top={-26} size={210} />
        <Ring left={900} top={-96} size={360} />
        <Ring left={972} top={-24} size={182} />
        <Ring left={466} top={432} size={210} />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 28%, rgba(235, 245, 251, 0.9) 0%, rgba(255,255,255,0) 46%)",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            width: "100%",
            height: "100%",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "64px 72px 72px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoSrc}
            width="720"
            height="157"
            alt="ContrataCR"
            style={{
              display: "block",
              width: 720,
              height: 157,
              objectFit: "contain",
            }}
          />

          <div
            style={{
              display: "flex",
              width: 62,
              height: 6,
              borderRadius: 999,
              background: "#009FD9",
              marginTop: 26,
              marginBottom: 28,
            }}
          />

          <div
            style={{
              display: "flex",
              maxWidth: 920,
              textAlign: "center",
              color: "#607089",
              fontSize: 34,
              lineHeight: 1.25,
              fontWeight: 650,
            }}
          >
            {subtitle}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
