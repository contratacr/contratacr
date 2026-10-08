import { getAllCategories, normalizeText, resolveStrongCategoryIntent } from "@/lib/data/categories";

/**
 * EL SERVICIO QUE SE LE SUGIERE A QUIEN PUBLICA (7-oct-2026).
 *
 * Solo calces seguros, porque la sugerencia decide a quién le llega el aviso:
 *  1. El texto nombra el servicio o uno de sus sinónimos de varias palabras
 *     (`resolveStrongCategoryIntent`, el mismo del buscador de la portada).
 *  2. El texto trae un NOMBRE DE OFICIO de una palabra («electricista»,
 *     «plomero», «pintor») que pertenece a UN SOLO servicio. Con dos candidatos
 *     no se sugiere nada.
 * El calce aproximado del buscador NO sirve aquí: con títulos reales mandaba
 * «Ventas puerta a puerta» a Ventanas y puertas y «Oficiales de seguridad» a
 * Ciberseguridad. Este archivo no cambia el buscador.
 */

// Terminaciones de oficio en español: electricista, plomero, pintor, psicólogo…
const PARECE_OFICIO = /(ista|ero|era|dor|dora|tor|tora|sor|sora|logo|loga|iatra|ico|ica)$/;

// Palabras con forma de oficio que no dicen cuál: le calzarían a medio catálogo.
const GENERICAS = new Set([
  "tecnico", "tecnica", "operador", "operadora", "ayudante", "auxiliar", "asistente", "ejecutivo", "ejecutiva",
  "encargado", "encargada", "supervisor", "supervisora", "administrador", "administradora", "coordinador",
  "coordinadora", "director", "directora", "gerente", "trabajador", "trabajadora", "colaborador", "colaboradora",
  "vendedor", "vendedora", "asesor", "asesora", "profesional", "practica", "publico", "publica", "electrico", "electrica",
  "mecanica", "medico", "medica", "clinica", "tablero", "primero", "tercero", "dinero", "domestica", "basica",
]);

function palabras(texto: string): string[] {
  return normalizeText(texto).replace(/[^a-z0-9ñ\s]/g, " ").split(/\s+/).filter(Boolean);
}

export function servicioSugerido(texto: string, locale?: string): string | null {
  const limpio = texto.trim();
  if (limpio.length < 3) return null;

  // Si lo escrito es exactamente una palabra clave de VARIOS servicios («chef»
  // es de Chef y de Clases de cocina), el buscador se queda con el primero de la
  // lista; para avisar a alguien eso no alcanza: mejor no sugerir.
  const exacto = palabras(limpio).join(" ");
  // Igual si la palabra está en el NOMBRE de otro servicio: «chef» es clave de
  // Clases de cocina pero también nombra a «Chef privado y cocina».
  const duenos = getAllCategories().filter((item) =>
    item.keywords.some((k) => palabras(k).join(" ") === exacto)
    || (!exacto.includes(" ") && palabras(item.label).includes(exacto)));
  if (duenos.length > 1) return null;

  const fuerte = resolveStrongCategoryIntent(limpio, locale);
  if (fuerte) return fuerte.id;

  const enTexto = new Set(palabras(limpio));
  const candidatos = new Set<string>();
  for (const item of getAllCategories()) {
    for (const clave of item.keywords) {
      const k = normalizeText(clave).trim();
      if (k.includes(" ") || k.length < 5 || GENERICAS.has(k) || !PARECE_OFICIO.test(k)) continue;
      if (enTexto.has(k) || enTexto.has(`${k}s`) || enTexto.has(`${k}es`)) candidatos.add(item.id);
    }
  }
  return candidatos.size === 1 ? [...candidatos][0] : null;
}
