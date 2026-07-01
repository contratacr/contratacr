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

export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const isEn = locale === "en";
  const pro = await getProfessionalBySlug(slug);
  const displayName = pro ? pro.businessName?.trim() || proDisplayName(pro.fullName) : "ContrataCR";
  const personName = pro?.businessName?.trim() ? proDisplayName(pro.fullName) : "";
  const serviceIds = pro?.professions?.length ? pro.professions : pro?.categoryId ? [pro.categoryId] : [];
  const services = serviceIds.slice(0, 3).map((id) => getCategoryLabel(id, locale)).filter(Boolean);
  const serviceText = services.join(" · ");
  const location = [pro?.cantonName, pro?.provinceName].filter(Boolean).join(", ");
  const avatarUrl = pro?.avatarUrl || "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#f4f7fa",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, #ffffff 0%, #f4fbff 48%, #e7f5fb 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -140,
            top: -170,
            width: 520,
            height: 520,
            borderRadius: 999,
            background: "#d9f1fb",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -180,
            bottom: -210,
            width: 560,
            height: 560,
            borderRadius: 999,
            background: "#eef7fc",
          }}
        />
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            padding: 72,
            position: "relative",
            gap: 52,
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 52 }}>
              <img src={`${APP_URL}/logo-mark-dark.png`} width="64" height="64" alt="ContrataCR" />
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 34, fontWeight: 900, letterSpacing: 0 }}>
                  <span>Contrata</span>
                  <span style={{ color: "#009FD9" }}>CR</span>
                </div>
                <div style={{ fontSize: 18, color: "#607089", fontWeight: 600 }}>
                  {isEn ? "Professionals in Costa Rica" : "Profesionales en Costa Rica"}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  borderRadius: 999,
                  background: "#009FD9",
                  color: "white",
                  padding: "8px 16px",
                  fontSize: 22,
                  fontWeight: 800,
                }}
              >
                {isEn ? "Professional profile" : "Perfil profesional"}
              </div>
              {pro?.verificationStatus === "verified" && (
                <div
                  style={{
                    display: "flex",
                    borderRadius: 999,
                    background: "#e8f6fc",
                    color: "#0089bb",
                    padding: "8px 16px",
                    fontSize: 22,
                    fontWeight: 800,
                  }}
                >
                  {isEn ? "Verified" : "Verificado"}
                </div>
              )}
            </div>

            <div style={{ display: "flex", fontSize: 62, lineHeight: 1.05, fontWeight: 900, maxWidth: 760 }}>
              {displayName}
            </div>
            {personName && (
              <div style={{ display: "flex", marginTop: 12, fontSize: 28, color: "#607089", fontWeight: 700 }}>
                {personName}
              </div>
            )}
            {serviceText && (
              <div style={{ display: "flex", marginTop: 26, fontSize: 30, color: "#243654", fontWeight: 800 }}>
                {serviceText}
              </div>
            )}
            {location && (
              <div style={{ display: "flex", marginTop: 18, fontSize: 26, color: "#607089", fontWeight: 700 }}>
                {location}
              </div>
            )}
          </div>

          <div
            style={{
              display: "flex",
              width: 258,
              height: 258,
              borderRadius: 48,
              background: "#ffffff",
              boxShadow: "0 22px 55px rgba(22, 37, 67, 0.14)",
              border: "1px solid #dce8f0",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} width="258" height="258" alt={displayName} style={{ objectFit: "cover" }} />
            ) : (
              <div
                style={{
                  display: "flex",
                  width: "100%",
                  height: "100%",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#e8f6fc",
                  color: "#009FD9",
                  fontSize: 86,
                  fontWeight: 900,
                }}
              >
                {initials(displayName)}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
