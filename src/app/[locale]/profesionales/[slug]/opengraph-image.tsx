import { ImageResponse } from "next/og";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "CR";
}

function clampText(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trim()}...` : text;
}

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const isEn = locale === "en";
  const pro = await getProfessionalBySlug(slug);
  const displayName = pro ? pro.businessName?.trim() || proDisplayName(pro.fullName) : "ContrataCR";
  const personName = pro?.businessName?.trim() ? proDisplayName(pro.fullName) : "";
  const serviceIds = pro?.professions?.length ? pro.professions : pro?.categoryId ? [pro.categoryId] : [];
  const services = serviceIds.slice(0, 3).map((id) => getCategoryLabel(id, locale)).filter(Boolean);
  const serviceText = services.length > 0
    ? services.join(" - ")
    : isEn
      ? "Service professional"
      : "Profesional de servicios";
  const location = [pro?.cantonName, pro?.provinceName].filter(Boolean).join(", ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f7fa",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
          padding: 54,
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            borderRadius: 42,
            background: "#ffffff",
            border: "1px solid #dfe7ef",
            boxShadow: "0 26px 70px rgba(22, 37, 67, 0.13)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: 132,
              height: "100%",
              background: "#162543",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 82,
                height: 82,
                borderRadius: 22,
                background: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 14px 34px rgba(0, 0, 0, 0.18)",
              }}
            >
              <div style={{ display: "flex", fontSize: 27, fontWeight: 950, letterSpacing: -1 }}>
                <span style={{ color: "#009FD9" }}>C</span>
                <span style={{ color: "#162543" }}>R</span>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              padding: "54px 48px 50px",
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 38 }}>
              <div style={{ display: "flex", fontSize: 36, fontWeight: 900, letterSpacing: 0 }}>
                <span>Contrata</span>
                <span style={{ color: "#009FD9" }}>CR</span>
              </div>
              <div
                style={{
                  display: "flex",
                  borderRadius: 999,
                  background: "#e8f6fc",
                  color: "#0089bb",
                  padding: "9px 18px",
                  fontSize: 20,
                  fontWeight: 800,
                  whiteSpace: "nowrap",
                }}
              >
                {isEn ? "Hire services in Costa Rica" : "Contrata servicios en Costa Rica"}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                fontSize: displayName.length > 34 ? 54 : 62,
                lineHeight: 1.02,
                fontWeight: 900,
                color: "#162543",
                maxWidth: 690,
              }}
            >
              {clampText(displayName, 52)}
            </div>

            {personName && (
              <div style={{ display: "flex", marginTop: 12, fontSize: 27, color: "#607089", fontWeight: 700 }}>
                {clampText(personName, 42)}
              </div>
            )}

            <div
              style={{
                display: "flex",
                marginTop: 28,
                fontSize: 30,
                lineHeight: 1.2,
                color: "#243654",
                fontWeight: 850,
                maxWidth: 730,
              }}
            >
              {clampText(serviceText, 72)}
            </div>

            {location && (
              <div style={{ display: "flex", marginTop: 18, fontSize: 25, color: "#607089", fontWeight: 700 }}>
                {clampText(location, 52)}
              </div>
            )}
          </div>

          <div
            style={{
              width: 310,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingRight: 48,
              gap: 22,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                width: 190,
                height: 190,
                borderRadius: 999,
                background: "#e8f6fc",
                border: "8px solid #ffffff",
                boxShadow: "0 20px 45px rgba(22, 37, 67, 0.16)",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#009FD9",
                  fontSize: 66,
                  fontWeight: 900,
                }}
              >
                {initials(displayName)}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                width: 246,
                borderRadius: 24,
                background: "#f4f7fa",
                border: "1px solid #e5ebf1",
                padding: "16px 20px",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", fontSize: 22, fontWeight: 900, color: "#162543" }}>
                {isEn ? "View profile" : "Ver perfil"}
              </div>
              <div style={{ display: "flex", marginTop: 4, fontSize: 17, fontWeight: 700, color: "#607089" }}>
                contratacr.com
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
