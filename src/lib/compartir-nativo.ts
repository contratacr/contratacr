// Una sola puerta a la hoja de compartir del sistema.
//
// El motivo: cancelar la hoja y que la hoja no exista son cosas distintas, y
// `navigator.share` las devuelve a las dos como un error. Al tratarlas igual,
// cerrar la hoja sin elegir nada disparaba el plan B —descargar el PDF, copiar
// el enlace—, que es justo lo que el usuario acababa de rechazar.
//
// Cancelar llega como AbortError. Eso es una decisión, no una falla: no debe
// pasar nada después.
export type ResultadoCompartir = "compartido" | "cancelado" | "no-disponible";

export async function compartirConHojaNativa(datos: ShareData): Promise<ResultadoCompartir> {
  if (typeof navigator === "undefined") return "no-disponible";
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function") return "no-disponible";
  // Compartir archivos no está en todas partes aunque `share` sí exista.
  if (datos.files?.length && nav.canShare && !nav.canShare(datos)) return "no-disponible";
  try {
    await nav.share(datos);
    return "compartido";
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return "cancelado";
    return "no-disponible";
  }
}
