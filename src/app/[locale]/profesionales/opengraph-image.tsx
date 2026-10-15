import { ImageResponse } from "next/og";
import { LOGO_SIMBOLO } from "@/lib/og-logos";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "ContrataCR";
export const revalidate = 86400;

export default function Image() {
  // Keep the symbol inside the central square for compact social previews.
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: "#ffffff" }}>
      <img src={LOGO_SIMBOLO} width={480} height={480} alt="ContrataCR" style={{ display: "block", width: 480, height: 480, objectFit: "contain" }} />
    </div>,
    size,
  );
}
