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

// Palabras que delatan un negocio: a «Servicios Eléctricos del Valle» no se le
// quita «la segunda palabra» como si fuera un segundo nombre.
const PALABRAS_DE_NEGOCIO = /^(s\.?a\.?|s\.?r\.?l\.?|ltda\.?|servicios?|soluciones|taller|estudio|grupo|constructora|consultor[ií]a|redes|cl[ií]nica|y|&|de|del|la|los|las|el)$/iu;

/**
 * Las formas de un nombre de persona, de la más completa a la más corta, para
 * cuando no cabe: entero → sin el segundo nombre → sin el segundo apellido.
 * «María Fernanda Vargas Rojas» → «María Vargas Rojas» → «María Vargas».
 * Un negocio, o un nombre que no se sabe partir, devuelve solo el entero.
 */
export function formasDeNombre(nombre?: string | null): string[] {
  const limpio = (nombre ?? "").trim().replace(/\s+/gu, " ");
  if (!limpio) return [];
  const partes = limpio.split(" ");
  const esPersona = partes.every((p) => /^[\p{L}'’.-]+$/u.test(p) && !PALABRAS_DE_NEGOCIO.test(p));
  if (!esPersona) return [limpio];
  if (partes.length === 4) return [limpio, `${partes[0]} ${partes[2]} ${partes[3]}`, `${partes[0]} ${partes[2]}`];
  if (partes.length === 3) return [limpio, `${partes[0]} ${partes[1]}`];
  return [limpio];
}

/** La forma más completa que cabe según `cabe`; si ninguna, la más corta. */
export function nombreQueCabe(nombre: string | null | undefined, cabe: (texto: string) => boolean): string {
  const formas = formasDeNombre(nombre);
  return formas.find(cabe) ?? formas[formas.length - 1] ?? "";
}
