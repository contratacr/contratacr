/**
 * Cómo se saluda a alguien en un mensaje.
 *
 * Los nombres de persona vienen del padrón en mayúsculas y con los cuatro
 * apellidos («SHARON VERITA VELASQUEZ CORTES»), así que un saludo armado con el
 * dato crudo salía gritando y sonando a carta de banco. A una persona se le dice
 * por el primer nombre; a un negocio, por su nombre entero, porque «OCR
 * Soluciones Eléctricas» no se saluda como «Ocr».
 */
export function nombreDeSaludo(nombre?: string | null, esNegocio = false): string {
  const limpio = (nombre ?? "").trim().replace(/\s+/gu, " ");
  if (!limpio) return "";
  const base = esNegocio ? limpio : limpio.split(" ")[0];
  return base
    .split(" ")
    .map((palabra) =>
      palabra.length > 2 && palabra === palabra.toLocaleUpperCase("es-CR")
        ? palabra.charAt(0) + palabra.slice(1).toLocaleLowerCase("es-CR")
        : palabra,
    )
    .join(" ");
}
