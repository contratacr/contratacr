import { ImageResponse } from "next/og";
import { LOGO_PALABRA } from "@/lib/og-logos";

/**
 * LA TARJETA QUE SE VE EN WHATSAPP AL COMPARTIR UNA FICHA.
 *
 * El perfil del profesional ya tenía la suya; proyectos, promociones y
 * empleos heredaban la imagen genérica del sitio. La tarjeta es lo primero
 * que decide si un enlace parece de verdad o parece un fraude: marca visible,
 * qué es (proyecto, promoción, empleo), el título y el lugar. Misma paleta y
 * mismo encuadre que la del perfil para que todo el app comparta igual.
 */
export const OG_TAMANO = { width: 1200, height: 630 };
export const OG_TIPO = "image/png";

function recortar(texto: string, max: number) {
  const limpio = texto.replace(/\s+/gu, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1).trim()}…` : limpio;
}

export function tarjetaDeFicha({ etiqueta, titulo, detalle, pie }: { etiqueta: string; titulo: string; detalle?: string; pie: string }) {
  const cuerpo = recortar(titulo || "ContrataCR", 90);
  const tamanoTitulo = cuerpo.length > 60 ? 50 : cuerpo.length > 36 ? 60 : 72;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef5fa", color: "#162543", fontFamily: "Inter, Arial, sans-serif", padding: 42 }}>
        <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderRadius: 42, background: "#ffffff", border: "1px solid #dfe7ef", boxShadow: "0 26px 70px rgba(22, 37, 67, 0.13)", overflow: "hidden", padding: "34px 56px 40px" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={LOGO_PALABRA} width={352} height={78} alt="ContrataCR" style={{ display: "block", width: 352, height: 78, objectFit: "contain" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 18 }}>
            <div style={{ display: "flex", alignSelf: "flex-start", background: "#e6f6fc", color: "#008fc4", borderRadius: 999, padding: "8px 18px", fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>{etiqueta.toUpperCase()}</div>
            <div style={{ display: "flex", fontSize: tamanoTitulo, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>{cuerpo}</div>
            {detalle ? <div style={{ display: "flex", fontSize: 30, color: "#526277", fontWeight: 600 }}>{recortar(detalle, 80)}</div> : null}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#68778d" }}>{pie}</div>
        </div>
      </div>
    ),
    OG_TAMANO,
  );
}
