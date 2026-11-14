/**
 * LEER EL TEXTO DE UNA FOTO DE LA VACANTE, en el propio dispositivo.
 *
 * Muchas vacantes en Costa Rica circulan como imagen (Facebook, WhatsApp). El
 * texto se lee aquí mismo con Tesseract: la imagen NUNCA sale del teléfono ni
 * de la computadora. Lo único que se descarga, la primera vez, es el lector y
 * el modelo de español e inglés (unos 3–4 MB, públicos), y el navegador los
 * guarda para la próxima. Lo leído se muestra para corregirlo antes de usarlo.
 */

export const IMAGEN_MAX = 10 * 1024 * 1024;
export const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"];

export function imagenValida(archivo: File): "ok" | "tipo" | "tamano" {
  if (!archivo.type.startsWith("image/")) return "tipo";
  if (archivo.size > IMAGEN_MAX) return "tamano";
  return "ok";
}

/** Une líneas cortadas por el ancho de la foto y quita el ruido típico del OCR. */
export function limpiarTextoLeido(texto: string): string {
  return texto
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/[|_~^`]+/g, " ").replace(/\s+/g, " ").trim())
    .filter((l) => l === "" || l.length > 1 || /\w/.test(l))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** El puesto suele ser la primera línea con letras y de largo razonable. */
export function puestoProbable(texto: string): string {
  const linea = texto.split("\n").map((l) => l.trim()).find((l) => /\p{L}{3,}/u.test(l) && l.length <= 80 && !/^(se busca|buscamos|we are hiring|hiring|vacante|empleo|oferta)[:!]?$/i.test(l));
  return (linea ?? "").replace(/^(se busca|buscamos|vacante|puesto|we are hiring|hiring)[:\s-]+/i, "").trim().slice(0, 120);
}

/** «Empresa: Hotel Atenas» / «Company: …», si la vacante lo dice. */
export function empresaProbable(texto: string): string {
  return (texto.match(/^(?:empresa|compa[nñ][ií]a|company|employer)\s*:\s*(.+)$/im)?.[1] ?? "").trim().slice(0, 120);
}

export async function leerTextoDeImagen(archivo: File, alProgreso?: (avance: number) => void): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(["spa", "eng"], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === "recognizing text") alProgreso?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(archivo);
    return limpiarTextoLeido(data.text ?? "");
  } finally {
    await worker.terminate();
  }
}
