/**
 * Nombre y primer apellido de quien reseña («Isaac Alberto Sanchez Monge» →
 * «Isaac Sanchez»): cabe en una línea y cuida su privacidad, como en Google.
 * Con cuatro palabras o más, el primer apellido es la penúltima; con tres, se
 * dejan las dos primeras.
 */
export function nombreCorto(nombre: string): string {
  const partes = (nombre ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 4) return `${partes[0]} ${partes[partes.length - 2]}`;
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`;
  return partes.join(" ");
}
