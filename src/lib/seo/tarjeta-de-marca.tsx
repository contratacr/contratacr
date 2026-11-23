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
 * Por eso lleva UNA sola cosa que reconocer y UN texto corto que leer: el nombre
 * de la marca, lo más grande que permite el cuadrado, y la promesa o el nombre de
 * la sección (hasta 3 líneas). Nada de párrafos ni etiquetas, que a ese tamaño no
 * se leen, y nada de adornos: fondo liso, de blanco a un azul casi imperceptible
 * (22-nov-2026), así si se recorta no se pierde nada.
 *
 * El nombre es el logo oficial de `og-logos.ts` (generado por
 * scripts/generate-primary-brand.mjs, ya incluye el símbolo): nunca como texto
 * ni con el símbolo repetido encima.
 */
/**
 * Reparte el texto en las líneas que ocupa y las EQUILIBRA: sin esto el dibujante
 * llena cada línea hasta el borde y deja una palabra sola abajo ("Costa" / "Rica").
 * Mide en letras (Inter en negrita ocupa ~0,55 del tamaño de la letra por carácter).
 */
export function lineasEquilibradas(texto: string, tamano: number, ancho = 560): string[] {
  const palabras = texto.split(/\s+/).filter(Boolean);
  const maxLetras = Math.max(8, Math.floor(ancho / (0.55 * tamano)));
  let lineas = 1, actual = 0;
  for (const p of palabras) {
    if (actual && actual + 1 + p.length > maxLetras) { lineas += 1; actual = p.length; } else actual += (actual ? 1 : 0) + p.length;
  }
  if (lineas === 1) return [palabras.join(" ")];
  // Entre los cortes posibles con ese número de líneas, el de la línea más larga más corta.
  let mejor: string[] = [], peor = Infinity;
  const probar = (desde: number, restantes: number, acumulado: string[]) => {
    if (restantes === 1) {
      const ultima = palabras.slice(desde).join(" ");
      const todas = [...acumulado, ultima], largo = Math.max(...todas.map((l) => l.length));
      if (ultima && largo < peor) { peor = largo; mejor = todas; }
      return;
    }
    for (let corte = desde + 1; corte <= palabras.length - (restantes - 1); corte++) probar(corte, restantes - 1, [...acumulado, palabras.slice(desde, corte).join(" ")]);
  };
  probar(0, lineas, []);
  return mejor.length ? mejor : [palabras.join(" ")];
}

export async function tarjetaDeMarca({ titulo }: { titulo: string }) {
  const fonts = await fuentesDeLaTarjeta();
  const cuerpo = recortar(titulo, 60);
  // El nombre ocupa casi todo el ancho del cuadrado central (630): 560 de 630 = 89 %.
  // Sin tarjeta blanca encima: a 110 px de lado, cada píxel de margen es nombre que no se lee.
  const anchoNombre = 560;
  const altoNombre = Math.round((anchoNombre * 128) / 548);
  // Hasta 3 líneas de 560 px: la promesa de marca (43 letras) a 52 px; los títulos cortos, más grandes.
  const tamanoTitulo = cuerpo.length > 34 ? 52 : cuerpo.length > 30 ? 56 : 62;
  return new ImageResponse(
    (
      <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(180deg, #ffffff 0%, #edf6fb 100%)", fontFamily: "Inter, Arial, sans-serif", overflow: "hidden" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 44 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_PALABRA} width={anchoNombre} height={altoNombre} alt="ContrataCR" style={{ display: "block", width: anchoNombre, height: altoNombre, objectFit: "contain" }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 560, textAlign: "center", fontSize: tamanoTitulo, fontWeight: 800, lineHeight: 1.12, letterSpacing: -1, color: "#162543" }}>
            {lineasEquilibradas(cuerpo, tamanoTitulo).map((linea) => <div key={linea} style={{ display: "flex", justifyContent: "center" }}>{linea}</div>)}
          </div>
        </div>
      </div>
    ),
    { ...OG_TAMANO, ...(fonts.length ? { fonts } : {}) },
  );
}
