import { ImageResponse } from "next/og";
import { LOGO_PALABRA, LOGO_SIMBOLO } from "../og-logos";
import { OG_TAMANO, fuentesDeLaTarjeta, recortar } from "./tarjeta-de-ficha";

/**
 * LA TARJETA DE MARCA PARA COMPARTIR UN ENLACE (21-nov-2026).
 *
 * Una misma imagen de 1200×630 se ve de dos maneras según dónde se comparta:
 *  - ANCHA, completa (WhatsApp, X, LinkedIn, Messenger): se ve toda.
 *  - CUADRADA, recortada al centro (los comentarios de Facebook, algunas vistas
 *    previas de Telegram o iMessage): solo se ve el cuadrado central de 630×630.
 * Por eso la marca (símbolo + nombre) y el mensaje viven DENTRO de ese cuadrado
 * central y los costados llevan solo adorno de color: si se recortan, no se
 * pierde nada, y si se ven, la tarjeta no parece vacía.
 *
 * El símbolo y el nombre salen de `og-logos.ts` (los generados por
 * scripts/generate-primary-brand.mjs), nunca como texto.
 */
export async function tarjetaDeMarca({ etiqueta, titulo, detalle }: { etiqueta?: string; titulo: string; detalle?: string }) {
  const fonts = await fuentesDeLaTarjeta();
  const cuerpo = recortar(titulo, 64);
  const tamanoTitulo = cuerpo.length > 44 ? 38 : cuerpo.length > 28 ? 42 : 48;
  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eaf5fb", fontFamily: "Inter, Arial, sans-serif", color: "#162543", overflow: "hidden" }}>
        {/* Adorno de los costados: queda fuera del cuadrado central (x 285 a 915). */}
        <div style={{ position: "absolute", left: -150, top: 300, width: 430, height: 430, borderRadius: 999, background: "#d3ecf8", display: "flex" }} />
        <div style={{ position: "absolute", left: 70, top: -90, width: 170, height: 170, borderRadius: 999, background: "#bfe3f4", display: "flex" }} />
        <div style={{ position: "absolute", right: -130, top: -120, width: 400, height: 400, borderRadius: 999, background: "#c9e8f6", display: "flex" }} />
        <div style={{ position: "absolute", right: 60, bottom: 40, width: 130, height: 130, borderRadius: 999, background: "#d3ecf8", display: "flex" }} />
        <div style={{ position: "relative", width: 570, height: 546, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "30px 38px", borderRadius: 42, background: "#ffffff", border: "1px solid #dfe7ef", boxShadow: "0 26px 70px rgba(22, 37, 67, 0.16)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_SIMBOLO} width={104} height={104} alt="" style={{ display: "block", width: 104, height: 104, objectFit: "contain" }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_PALABRA} width={300} height={70} alt="ContrataCR" style={{ display: "block", width: 300, height: 70, objectFit: "contain" }} />
          <div style={{ display: "flex", width: 120, height: 4, borderRadius: 999, background: "#009FD9", marginTop: 6, marginBottom: 6 }} />
          {etiqueta ? (
            <div style={{ display: "flex", background: "#e6f6fc", color: "#008fc4", borderRadius: 999, padding: "6px 18px", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{etiqueta.toUpperCase()}</div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "center", textAlign: "center", fontSize: tamanoTitulo, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1 }}>{cuerpo}</div>
          {detalle ? <div style={{ display: "flex", justifyContent: "center", textAlign: "center", fontSize: 24, lineHeight: 1.25, color: "#526277", fontWeight: 600 }}>{recortar(detalle, 90)}</div> : null}
        </div>
      </div>
    ),
    { ...OG_TAMANO, ...(fonts.length ? { fonts } : {}) },
  );
}
