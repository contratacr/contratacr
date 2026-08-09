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
export const dynamic = "force-dynamic";
export const revalidate = 0;

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

function serviceTypography(services: string[]) {
  const totalLength = services.reduce((sum, service) => sum + service.length, 0);
  if (services.length >= 8 || totalLength > 150) return 19;
  if (services.length >= 5 || totalLength > 95) return 22;
  return 26;
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
  const serviceIds = pro?.professions?.length ? pro.professions : pro?.categoryId ? [pro.categoryId] : [];
  const serviceNames = (pro?.services ?? [])
    .filter((service) => service.active !== false && service.name?.trim())
    .map((service) => service.name!.trim());
  const categoryNames = serviceIds.map((id) => getCategoryLabel(id, locale)).filter(Boolean);
  const services = Array.from(
    new Map((serviceNames.length > 0 ? serviceNames : categoryNames).map((name) => [name.toLocaleLowerCase(locale), name])).values()
  );
  const visibleServices = services.length > 0
    ? services
    : [isEn ? "Service professional" : "Profesional de servicios"];
  const serviceFontSize = serviceTypography(visibleServices);
  const serviceText = visibleServices.join("  ·  ");
  const location = [pro?.cantonName, pro?.provinceName].filter(Boolean).join(", ");
  const logoSrc = await logoWordmarkDataUrl();
  const avatarDataUrl = await imageDataUrl(pro?.avatarUrl);
  const brandLine = isEn
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
          background: "#eef5fa",
          color: "#162543",
          fontFamily: "Inter, Arial, sans-serif",
          padding: 42,
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
              justifyContent: "flex-start",
              padding: "28px 48px 6px",
            }}
          >
            <LogoWordmark src={logoSrc} width={352} height={78} />
          </div>

          <div
            style={{
              display: "flex",
              flex: 1,
              padding: "8px 48px 22px",
              minWidth: 0,
              gap: 34,
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
                  fontSize: displayName.length > 34 ? 48 : 58,
                  lineHeight: 1.02,
                  fontWeight: 900,
                  color: "#162543",
                  maxWidth: 700,
                }}
              >
                {clampText(displayName, 52)}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 20,
                  marginBottom: 10,
                  fontSize: 18,
                  lineHeight: 1,
                  color: "#607089",
                  fontWeight: 800,
                }}
              >
                {isEn ? "Services" : "Servicios"}
              </div>

              <div
                style={{
                  display: "flex",
                  width: "100%",
                  maxWidth: 720,
                  color: "#162543",
                  fontSize: serviceFontSize,
                  lineHeight: 1.35,
                  fontWeight: 700,
                }}
              >
                {serviceText}
              </div>

              {location && (
                <div style={{ display: "flex", marginTop: 16, fontSize: 23, color: "#607089", fontWeight: 700 }}>
                  {clampText(location, 52)}
                </div>
              )}
            </div>

            <div
              style={{
                display: "flex",
                width: 292,
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  width: 250,
                  height: 250,
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
                    width="250"
                    height="250"
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
                      fontSize: 84,
                      fontWeight: 700,
                    }}
                  >
                    {initials(displayName)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              minHeight: 82,
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              borderTop: "1px solid #dcecf5",
              background: "#f3f9fd",
              padding: "16px 36px 18px",
              color: "#162543",
              fontSize: 34,
              lineHeight: 1.15,
              fontWeight: 800,
              textAlign: "center",
            }}
          >
            <span style={{ color: "#009FD9", fontWeight: 900 }}>{brandLine.lead}</span>
            <span>{brandLine.middle}</span>
            <span style={{ color: "#009FD9", fontWeight: 900 }}>{brandLine.place}</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
