import { ImageResponse } from "next/og";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

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

function LogoWordmark({
  src,
  width = 292,
  height = 65,
}: {
  src: string;
  width?: number;
  height?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        width={width}
        height={height}
        alt="ContrataCR"
        style={{
          display: "block",
          width,
          height,
          objectFit: "contain",
        }}
      />
    </div>
  );
}

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

async function imageDataUrl(url?: string | null) {
  if (!url) return null;
  try {
    const resolved = url.startsWith("/")
      ? `${process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com"}${url}`
      : url;
    const response = await fetch(resolved);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const bytes = Buffer.from(await response.arrayBuffer());
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
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
  const logoSrc = await logoWordmarkDataUrl();
  const avatarDataUrl = await imageDataUrl(pro?.avatarUrl);
  const brandLine = isEn
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
          background: "#eef5fa",
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
            flexDirection: "column",
            borderRadius: 42,
            background: "#ffffff",
            border: "1px solid #dfe7ef",
            boxShadow: "0 26px 70px rgba(22, 37, 67, 0.13)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 32,
              padding: "44px 56px 20px",
            }}
          >
            <LogoWordmark src={logoSrc} />
            <div
              style={{
                display: "flex",
                color: "#607089",
                fontSize: 20,
                fontWeight: 750,
                lineHeight: 1.2,
                textAlign: "right",
                whiteSpace: "nowrap",
                maxWidth: 640,
              }}
            >
              {brandLine}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              padding: "14px 56px 52px",
              minWidth: 0,
              gap: 46,
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minWidth: 0,
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  display: "flex",
                  fontSize: displayName.length > 34 ? 54 : 64,
                  lineHeight: 1.02,
                  fontWeight: 900,
                  color: "#162543",
                  maxWidth: 660,
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
                  marginTop: 30,
                  fontSize: 30,
                  lineHeight: 1.2,
                  color: "#243654",
                  fontWeight: 850,
                  maxWidth: 690,
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
                display: "flex",
                width: 300,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 212,
                  height: 212,
                  borderRadius: 999,
                  background: "#EBF5FB",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarDataUrl}
                    width="212"
                    height="212"
                    alt={displayName}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 999,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#009FD9",
                      fontSize: 72,
                      fontWeight: 700,
                    }}
                  >
                    {initials(displayName)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
