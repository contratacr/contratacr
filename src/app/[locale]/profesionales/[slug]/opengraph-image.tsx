import { ImageResponse } from "next/og";
import { Buffer } from "node:buffer";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

function LogoMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#009FD9"
        d="m 628.67574,1011.925 c -19.02832,-1.0755 -43.17303,-4.17 -62.17574,-7.9688 C 426.87918,976.04469 304.5222,875.40106 253.49895,746.5 239.92852,712.21676 231.96825,680.40899 227.34657,642 c -2.4737,-20.55804 -2.4681,-66.12528 0.0105,-85.5 C 238.36065,470.48805 275.87377,394.57921 337.5,333.62279 402.72629,269.10543 489.50257,230.68265 581.75723,225.47061 l 12.25722,-0.69248 -0.25722,65.83854 -0.25723,65.83855 -11.61971,1.14969 c -54.72914,5.41505 -112.97027,33.98665 -153.88998,75.49445 -66.82401,67.78438 -90.73973,167.20005 -61.92106,257.40064 13.36192,41.82195 34.98014,76.70501 66.68678,107.60548 18.9439,18.46224 38.07186,32.47549 60.91845,44.62919 24.18138,12.86377 53.6732,22.64345 80.82552,26.80228 6.05,0.92665 11.9,1.84414 13,2.03885 1.54611,0.27367 9.89856,16.19151 36.80358,70.13911 19.14196,38.3818 34.77946,70.03059 34.75,70.33059 -0.0839,0.8537 -14.12772,0.798 -30.37784,-0.1205 z M 838.98402,1000.25 C 833.78377,993.2375 790.03499,934.72159 741.76451,870.21465 693.49403,805.70771 654,752.72021 654,752.46465 654,752.20909 674.4186,752 699.37467,752 c 41.5108,0 46.4285,-0.17894 57.75,-2.10129 70.09992,-11.90272 122.37797,-67.98508 133.3249,-143.02705 2.01885,-13.83939 2.01715,-40.45664 -0.004,-54.94417 C 877.26502,457.42344 798.09301,379.26135 696.58164,360.53601 689.38674,359.2088 679.9,357.84793 675.5,357.51187 c -4.4,-0.33607 -9.4625,-0.83411 -11.25,-1.10677 L 661,355.90937 v -65.60709 -65.60709 l 12.75,0.67685 C 782.85529,231.16402 884.68266,284.43786 952.10264,371 c 55.51146,71.27252 82.78226,162.12554 74.44716,248.02198 -5.142,52.99078 -22.388,101.568 -51.22706,144.29262 -21.56372,31.94631 -52.24264,61.56872 -84.0983,81.20213 -6.35354,3.91585 -8.99208,6.07376 -8.37572,6.85001 0.49491,0.62329 9.58653,12.83326 20.2036,27.13326 10.61707,14.3 27.0146,36.35 36.43896,49 28.20847,37.86329 62.50872,84.5194 62.50872,85.0261 0,0.2606 -34.55122,0.4739 -76.78049,0.4739 h -76.78049 z"
      />
      <path
        fill="#162543"
        d="M 833.38951,992.90029 C 825.59683,982.49441 781.70838,924.70395 736.58206,863.8526 l -82.79137,-111.64144 46.53856,-0.29828 c 47.44357,-0.30408 52.51937,-0.5839 70.2163,-4.99944 35.71306,-8.91072 69.9309,-32.81534 91.33232,-64.86388 21.44529,-32.11423 30.48361,-67.14632 29.49948,-106.72554 C 890.03665,521.40428 868.32944,469.76596 828.3125,429.58207 786.06423,387.15754 731.01595,366.45509 668.70581,356.94155 L 660.96875,355.89002 661,290.24658 v -65.51845 l 12.10355,0.24083 c 109.53551,2.17946 206.51917,57.45049 277.92714,139.90972 10.61886,12.26226 27.26961,40.61546 34.47264,54.154 20.76837,39.03532 34.68817,84.42552 40.36837,129.43607 2.3159,18.35191 4.3344,61.20707 1.315,78.74731 -9.1346,53.06436 -25.7549,99.01214 -54.9926,140.63311 -20.34001,28.95473 -50.10796,59.11737 -79.09896,76.83325 -4.76737,2.91326 -10.07775,5.92024 -10.29676,6.2746 -0.219,0.35435 12.09732,16.28025 27.21317,36.5836 44.66912,59.99893 92.10425,124.44398 92.10425,124.98388 0,0.2762 -35.52245,0.6911 -77.73495,0.6521 l -75.94062,-0.1785 z"
      />
    </svg>
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
  const avatarDataUrl = await imageDataUrl(pro?.avatarUrl);

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
              padding: "44px 56px 20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <LogoMark size={46} />
              <div style={{ display: "flex", fontSize: 38, fontWeight: 900, letterSpacing: 0 }}>
                <span style={{ color: "#1a2744" }}>Contrata</span>
                <span style={{ color: "#009FD9" }}>CR</span>
              </div>
            </div>
            <div style={{ display: "flex", color: "#009FD9", fontSize: 24, fontWeight: 800 }}>
              contratacr.com
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
                  width: "fit-content",
                  borderRadius: 999,
                  background: "#e8f6fc",
                  color: "#0089bb",
                  padding: "10px 18px",
                  fontSize: 21,
                  fontWeight: 850,
                  marginBottom: 30,
                }}
              >
                {isEn ? "Hire services in Costa Rica" : "Contrata servicios en Costa Rica"}
              </div>

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
                  width: 228,
                  height: 228,
                  borderRadius: 999,
                  background: "#e8f6fc",
                  border: "8px solid #ffffff",
                  boxShadow: "0 22px 55px rgba(22, 37, 67, 0.18)",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                }}
              >
                {avatarDataUrl ? (
                  <div
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      borderRadius: 999,
                      backgroundImage: `url(${avatarDataUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
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
                      fontWeight: 900,
                    }}
                  >
                    {initials(displayName)}
                  </div>
                )}
              </div>

              <div
                style={{
                  display: "flex",
                  marginTop: 28,
                  width: 248,
                  borderRadius: 999,
                  background: "#009FD9",
                  color: "#ffffff",
                  padding: "16px 24px",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 23,
                  fontWeight: 900,
                }}
              >
                {isEn ? "View profile" : "Ver perfil"}
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
