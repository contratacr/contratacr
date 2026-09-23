/**
 * Una ruta INTERNA que vino en la dirección (`?redirect=`, `?next=`) y que se
 * puede seguir sin riesgo: empieza por «/», no es «//host» (que el navegador
 * lee como otro sitio) y no trae barras invertidas. Devuelve `null` si no
 * cumple, para que quien la use caiga en su destino por defecto.
 */
export function rutaInternaSegura(valor: string | null | undefined): string | null {
  if (!valor) return null;
  let ruta = valor;
  try { ruta = decodeURIComponent(valor); } catch { ruta = valor; }
  if (!ruta.startsWith("/") || ruta.startsWith("//") || ruta.includes("\\") || /^\/[^/]*:/.test(ruta)) return null;
  return ruta;
}
