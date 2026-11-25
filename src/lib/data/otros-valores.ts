// Idiomas y aseguradoras que un profesional escribe a mano cuando no están en
// la lista. Se guardan en las MISMAS listas (languages / insurance_networks)
// con un prefijo, así no hace falta una columna nueva ni una migración:
//   "otro:Alemán"  → idioma escrito a mano
//   "otra:Bupa XY" → aseguradora escrita a mano
// Salen en el perfil público de esa persona, pero NUNCA en los filtros de
// búsqueda (los filtros solo ofrecen valores de la lista oficial). El panel de
// administración los lista para decidir si pasan a la lista oficial.
export const OTRO_IDIOMA = "otro:";
export const OTRA_ASEGURADORA = "otra:";

const MAX_LARGO = 40;

/** Limpia lo escrito: espacios, largo y solo caracteres de un nombre. Vacío si no sirve. */
export function limpiarTextoLibre(raw: string): string {
  const texto = raw
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .,&'’()+/-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return texto.length >= 2 ? texto.slice(0, MAX_LARGO).trim() : "";
}

export function esValorLibre(valor: string, prefijo: string): boolean {
  return valor.startsWith(prefijo) && valor.length > prefijo.length;
}

export function textoDeValorLibre(valor: string, prefijo: string): string {
  return valor.slice(prefijo.length).trim();
}

export function valorLibre(prefijo: string, raw: string): string {
  const texto = limpiarTextoLibre(raw);
  return texto ? `${prefijo}${texto}` : "";
}
