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
let logoMarkCache: string | null = null;

async function logoWordmarkDataUrl() {
  if (logoWordmarkCache) return logoWordmarkCache;
  const bytes = await readFile(join(process.cwd(), "public", "logo-wordmark-transparent.png"));
  logoWordmarkCache = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  return logoWordmarkCache;
}

async function logoMarkDataUrl() {
  if (logoMarkCache) return logoMarkCache;
  const bytes = await readFile(join(process.cwd(), "public", "logo-mark-transparent.png"));
  logoMarkCache = `data:image/png;base64,${Buffer.from(bytes).toString("base64")}`;
  return logoMarkCache;
}

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isEn = locale === "en";
  const wordmarkSrc = await logoWordmarkDataUrl();
  const markSrc = await logoMarkDataUrl();
  const subtitle = isEn
    ? "Hire professional services in Costa Rica"
    : "Contrata servicios profesionales en Costa Rica";

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
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #ffffff 0%, #ffffff 66%, #f3f9fd 100%)",
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
            padding: "58px 72px 72px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={markSrc}
            width="224"
            height="224"
            alt="ContrataCR"
            style={{
              display: "block",
              width: 224,
              height: 224,
              objectFit: "contain",
              marginBottom: 26,
            }}
          />

          <div
            style={{
              display: "flex",
              width: 640,
              height: 136,
              overflow: "hidden",
              alignItems: "center",
              justifyContent: "flex-start",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={wordmarkSrc}
              width="810"
              height="169"
              alt="ContrataCR"
              style={{
                display: "block",
                width: 810,
                height: 169,
                objectFit: "contain",
                marginLeft: -200,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              width: 62,
              height: 6,
              borderRadius: 999,
              background: "#009FD9",
              marginTop: 14,
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
