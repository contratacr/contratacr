/**
 * CÓMO SE LEE EN LA TARJETA QUIEN CUBRE UNA PROVINCIA O TODO EL PAÍS.
 *
 * Dos datos, dos renglones (decisión de Isaac, 13-nov-2026):
 *  - Arriba, DÓNDE ESTÁ la persona: «San Ramón, Alajuela». Con eso el cliente
 *    juzga solo si le queda cerca.
 *  - Debajo, en gris, HASTA DÓNDE LLEGA: «Cubre toda la provincia de Limón».
 *
 * Antes las dos cosas iban en una frase («Atiende en Talamanca · toda la
 * provincia», luego «Desde San Ramón · a domicilio») que se repetía en casi
 * todas las tarjetas. El orden de la lista no depende de esto: primero van
 * las reseñas, y la zona solo desempata (query-core.ts, ordenFinal).
 *
 *  - Su base ES el cantón buscado → el lugar buscado, sin nota (es de ahí).
 *  - Base conocida                → la base + nota de cobertura.
 *  - Sin base conocida            → la cobertura misma como lugar, sin nota.
 */
export type ClaveDeCobertura = "coberturaPais" | "coberturaEnLinea" | "coberturaProvincia" | "provinciaEntera" | "countryCoverage";
type Traducir = (clave: ClaveDeCobertura, valores?: Record<string, string>) => string;

const comparable = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

type LugarDeTrabajo = { receivesClients?: boolean; level?: string; cantonId?: string };
export type Base = { canton: string; provincia: string };

/** La base: su local (un lugar de UN cantón donde recibe clientes) o, si no
 *  tiene, el cantón de su perfil. Null si no se sabe: no se inventa. */
export function baseDelProfesional(
  lugares: readonly LugarDeTrabajo[] | undefined,
  perfil: { canton?: string | null; provincia?: string | null },
  buscarCanton: (id: string) => Base | undefined,
): Base | null {
  const local = (lugares ?? []).find((w) => w.receivesClients !== false && !!w.cantonId && (!w.level || w.level === "canton"));
  const delLocal = local?.cantonId ? buscarCanton(local.cantonId) : undefined;
  if (delLocal?.canton) return delLocal;
  const canton = perfil.canton?.trim() ?? "";
  return canton ? { canton, provincia: perfil.provincia?.trim() ?? "" } : null;
}

/** «San Ramón, Alajuela»; «Heredia» a secas cuando cantón y provincia se llaman igual. */
export function nombreDeLaBase(base: Base) {
  return !base.provincia || comparable(base.provincia) === comparable(base.canton) ? base.canton : `${base.canton}, ${base.provincia}`;
}

export function rotuloDeCobertura(t: Traducir, opciones: {
  pais: boolean;
  base: Base | null;
  enLinea: boolean;
  provincia: string;
  cantonBuscado?: string;
  lugarBuscado: string;
}): { lugar: string; nota: string } {
  const { pais, base, enLinea, provincia, cantonBuscado, lugarBuscado } = opciones;
  if (base && cantonBuscado && comparable(base.canton) === comparable(cantonBuscado)) return { lugar: lugarBuscado, nota: "" };
  const nota = pais ? t(enLinea ? "coberturaEnLinea" : "coberturaPais") : t("coberturaProvincia", { provincia });
  if (base) return { lugar: nombreDeLaBase(base), nota };
  return pais
    ? { lugar: t("countryCoverage"), nota: "" }
    : { lugar: t("provinciaEntera", { provincia }), nota: "" };
}
