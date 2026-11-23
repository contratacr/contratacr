import { ImageResponse } from "next/og";
import { LOGO_PALABRA } from "../og-logos";
import { OG_TAMANO, fuentesDeLaTarjeta, recortar } from "./tarjeta-de-ficha";

/**
 * LA TARJETA DE MARCA PARA COMPARTIR UN ENLACE (21-nov-2026, simplificada el mismo día).
 *
 * Una misma imagen de 1200×630 se ve de dos maneras según dónde se comparta:
 *  - ANCHA, completa (WhatsApp, X, LinkedIn, Messenger): se ve toda.
 *  - CUADRADA, recortada al centro (los comentarios de Facebook, algunas vistas
 *    previas de Telegram o iMessage): solo se ve el cuadrado central de 630×630,
 *    y ahí cabe en unos 110 px de lado.
 * Por eso lleva UNA sola cosa que reconocer y UNA línea que leer: el nombre de
 * la marca, lo más grande que permite el cuadrado, y un título corto. Nada de
 * párrafos ni etiquetas, que a ese tamaño no se leen. Los costados llevan solo
 * adorno de color: si se recortan, no se pierde nada; si se ven, no parece vacía.
 *
 * El nombre es el logo oficial de `og-logos.ts` (generado por
 * scripts/generate-primary-brand.mjs, ya incluye el símbolo): nunca como texto
 * ni con el símbolo repetido encima.
 */
export async function tarjetaDeMarca({ titulo }: { titulo: string }) {
  const fonts = await fuentesDeLaTarjeta();
  const cuerpo = recortar(titulo, 44);
  // El nombre ocupa casi todo el ancho del cuadrado central (630): 560 de 630 = 89 %.
  // Sin tarjeta blanca encima: a 110 px de lado, cada píxel de margen es nombre que no se lee.
  const anchoNombre = 560;
  const altoNombre = Math.round((anchoNombre * 128) / 548);
  const tamanoTitulo = cuerpo.length > 30 ? 56 : 62;
  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #f6fbfe 0%, #dff0f9 100%)", fontFamily: "Inter, Arial, sans-serif", overflow: "hidden" }}>
        {/* Adorno de los costados: queda fuera del cuadrado central (x 285 a 915). */}
        <div style={{ position: "absolute", left: -150, top: 300, width: 430, height: 430, borderRadius: 999, background: "#c9e6f5", display: "flex" }} />
        <div style={{ position: "absolute", left: 70, top: -90, width: 170, height: 170, borderRadius: 999, background: "#b6dff2", display: "flex" }} />
        <div style={{ position: "absolute", right: -130, top: -120, width: 400, height: 400, borderRadius: 999, background: "#c1e3f4", display: "flex" }} />
        <div style={{ position: "absolute", right: 60, bottom: 40, width: 130, height: 130, borderRadius: 999, background: "#c9e6f5", display: "flex" }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_PALABRA} width={anchoNombre} height={altoNombre} alt="ContrataCR" style={{ display: "block", width: anchoNombre, height: altoNombre, objectFit: "contain" }} />
          <div style={{ display: "flex", width: 560, justifyContent: "center", textAlign: "center", fontSize: tamanoTitulo, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1, color: "#162543" }}>{cuerpo}</div>
        </div>
      </div>
    ),
    { ...OG_TAMANO, ...(fonts.length ? { fonts } : {}) },
  );
}
