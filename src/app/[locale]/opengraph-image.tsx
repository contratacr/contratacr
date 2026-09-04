import { ImageResponse } from "next/og";
import { LOGO_PALABRA, LOGO_SIMBOLO } from "@/lib/og-logos";

export const alt = "ContrataCR";
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";


export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const isEn = locale === "en";
  const wordmarkSrc = LOGO_PALABRA;
  const markSrc = LOGO_SIMBOLO;
  const subtitle = isEn
    ? { lead: "Offer", middle: " and find services in ", place: "Costa Rica." }
    : { lead: "Ofrece", middle: " y encuentra servicios en ", place: "Costa Rica." };

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
            padding: "46px 64px 54px",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={markSrc}
            width="168"
            height="168"
            alt="ContrataCR"
            style={{
              display: "block",
              width: 168,
              height: 168,
              objectFit: "contain",
              marginBottom: 18,
            }}
          />

          <div
            style={{
              display: "flex",
              width: 610,
              height: 122,
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
                width: 772,
                height: 152,
                objectFit: "contain",
                marginLeft: -190,
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              width: 70,
              height: 5,
              borderRadius: 999,
              background: "#009FD9",
              marginTop: 12,
              marginBottom: 24,
            }}
          />

          <div
            style={{
              display: "flex",
              maxWidth: 1040,
              textAlign: "center",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              color: "#162543",
              fontSize: 46,
              lineHeight: 1.16,
              fontWeight: 800,
            }}
          >
            <span style={{ color: "#009FD9", fontWeight: 900 }}>{subtitle.lead}</span>
            <span>{subtitle.middle}</span>
            <span style={{ color: "#009FD9", fontWeight: 900 }}>{subtitle.place}</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
