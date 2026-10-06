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

// Inter en negrita y seminegrita: sin fuente propia `next/og` dibuja todo con
// una sola fuente regular y el título salía fino aunque pidiera 800. Se trae
// una vez por proceso desde Google Fonts (en formato TTF, el que acepta Satori).
let fuentes: Promise<{ name: string; data: ArrayBuffer; weight: 600 | 800; style: "normal" }[]> | null = null;
async function cargarFuentes() {
  const una = async (peso: 600 | 800) => {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Inter:wght@${peso}&display=swap`, { headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1)" } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) throw new Error("sin fuente");
    return { name: "Inter", data: await (await fetch(url)).arrayBuffer(), weight: peso, style: "normal" as const };
  };
  return Promise.all([una(600), una(800)]);
}
function fuentesDeLaTarjeta() {
  fuentes ??= cargarFuentes().catch(() => { fuentes = null; return []; });
  return fuentes;
}

/**
 * Promociones llevan su FOTO a la derecha y el precio; empleos, el salario si
 * se publica. Lo importante va lejos de los bordes: WhatsApp recorta la
 * tarjeta en miniatura cuadrada y lo de las orillas se pierde.
 */
export async function tarjetaDeFicha({ etiqueta, titulo, detalle, pie, imagen: imagenPedida, precio, precioAntes }: { etiqueta: string; titulo: string; detalle?: string; pie: string; imagen?: string | null; precio?: string | null; precioAntes?: string | null }) {
  // La foto se baja aquí, con límite de peso y de tiempo, en vez de dejar que
  // el dibujante la pida entera: una foto pesada agotaba la memoria del Worker.
  const imagen = imagenPedida ? await fotoLiviana(imagenPedida, 900 * 1024) : null;
  const conFoto = !!imagen;
  const cuerpo = recortar(titulo || "ContrataCR", conFoto ? 70 : 90);
  const tamanoTitulo = conFoto
    ? (cuerpo.length > 44 ? 44 : cuerpo.length > 26 ? 52 : 60)
    : (cuerpo.length > 60 ? 50 : cuerpo.length > 36 ? 60 : 72);
  const fonts = await fuentesDeLaTarjeta();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef5fa", color: "#162543", fontFamily: "Inter, Arial, sans-serif", padding: 42 }}>
        <div style={{ width: "100%", height: "100%", display: "flex", borderRadius: 42, background: "#ffffff", border: "1px solid #dfe7ef", boxShadow: "0 26px 70px rgba(22, 37, 67, 0.13)", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "34px 48px 40px 56px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_PALABRA} width={300} height={66} alt="ContrataCR" style={{ display: "block", width: 300, height: 66, objectFit: "contain" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", gap: 16 }}>
              <div style={{ display: "flex", alignSelf: "flex-start", background: "#e6f6fc", color: "#008fc4", borderRadius: 999, padding: "8px 18px", fontSize: 22, fontWeight: 800, letterSpacing: 1 }}>{etiqueta.toUpperCase()}</div>
              <div style={{ display: "flex", fontSize: tamanoTitulo, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.2 }}>{cuerpo}</div>
              {precio ? (
                <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
                  <div style={{ display: "flex", fontSize: 40, fontWeight: 800, color: "#009FD9" }}>{precio}</div>
                  {precioAntes ? <div style={{ display: "flex", fontSize: 28, fontWeight: 600, color: "#94a3b8", textDecoration: "line-through" }}>{precioAntes}</div> : null}
                </div>
              ) : null}
              {detalle ? <div style={{ display: "flex", fontSize: 28, color: "#526277", fontWeight: 600 }}>{recortar(detalle, conFoto ? 46 : 80)}</div> : null}
            </div>
            <div style={{ display: "flex", fontSize: 22, color: "#68778d", fontWeight: 600 }}>{pie}</div>
          </div>
          {conFoto ? (
            <div style={{ display: "flex", width: 430, height: "100%", padding: 22 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagen!} width={386} height={502} alt="" style={{ width: 386, height: 502, objectFit: "cover", borderRadius: 28 }} />
            </div>
          ) : null}
        </div>
      </div>
    ),
    { ...OG_TAMANO, ...(fonts.length ? { fonts } : {}) },
  );
}

/** La foto en JPG y del tamaño de la tarjeta: Satori no lee WebP/AVIF. */
/**
 * Baja una foto para dibujarla en una tarjeta de compartir, como data URL, o
 * null si es más pesada que `maxBytes`, no es JPEG/PNG o tarda más de 4 s.
 * Bajarlas enteras sin límite agotaba la memoria del Worker (128 MB) y una
 * descarga lenta lo dejaba colgado (registros de Cloudflare, 5 y 6-oct-2026).
 */
export async function fotoLiviana(url: string, maxBytes: number): Promise<string | null> {
  try {
    const respuesta = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!respuesta.ok) return null;
    if (Number(respuesta.headers.get("content-length") || 0) > maxBytes) return null;
    const tipo = respuesta.headers.get("content-type") || "image/jpeg";
    if (!/^image\/(jpeg|png)/.test(tipo)) return null;
    const datos = await respuesta.arrayBuffer();
    if (datos.byteLength > maxBytes) return null;
    return `data:${tipo};base64,${Buffer.from(datos).toString("base64")}`;
  } catch {
    return null;
  }
}

export function fotoParaTarjeta(url?: string | null): string | null {
  if (!url) return null;
  if (/res\.cloudinary\.com\/.+\/upload\//.test(url)) return url.replace("/upload/", "/upload/f_jpg,q_80,w_772,h_1004,c_fill,g_auto/");
  return url;
}
