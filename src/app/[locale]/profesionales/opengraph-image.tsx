import { ImageResponse } from "next/og";
import { LOGO_PALABRA } from "@/lib/og-logos";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ContrataCR";
export const revalidate = 86400;

export default function Image() {
  // Social apps may show a square crop of this horizontal image. Keeping the
  // complete logo inside the central 630px prevents the clipped preview.
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <img src={LOGO_PALABRA} width={540} height={129} alt="ContrataCR" style={{ display: "block", width: 540, height: 129, objectFit: "contain" }} />
    </div>,
    size,
  );
}
