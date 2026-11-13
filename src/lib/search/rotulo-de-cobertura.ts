/**
 * CÓMO SE DICE EN LA TARJETA QUE ALGUIEN CUBRE UNA PROVINCIA O EL PAÍS.
 *
 * Una sola fórmula, «de dónde viene + cómo llega» (decisión de Isaac,
 * 13-nov-2026). Antes la tarjeta decía «Atiende en Talamanca · toda la
 * provincia» en 18 de 19 resultados: repetía lo que se buscó y escondía lo que
 * el cliente necesita saber, desde dónde viene el profesional.
 *
 *  - Su base ES el cantón buscado      → «Atenas, Alajuela» (el lugar buscado)
 *  - Cubre el país y trabaja en línea  → «En línea · todo el país»
 *  - Cubre el país, presencial         → «Desde Heredia · todo el país»
 *  - Cubre la provincia                → «Desde San Ramón · a domicilio»
 *  - Sin base conocida                 → «Cubre todo el país» / «Cubre toda Alajuela»
 */
export type ClaveDeCobertura = "enLineaTodoElPais" | "desdeTodoElPais" | "cubreTodoElPais" | "desdeADomicilio" | "cubreTodaLaProvincia";
type Traducir = (clave: ClaveDeCobertura, valores?: Record<string, string>) => string;

const comparable = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

type LugarDeTrabajo = { receivesClients?: boolean; level?: string; cantonId?: string };

/** La base: su local (un lugar de UN cantón donde recibe clientes) o, si no
 *  tiene, el cantón de su perfil. Vacío si no se sabe: no se inventa. */
export function baseDelProfesional(lugares: readonly LugarDeTrabajo[] | undefined, cantonDelPerfil: string | null | undefined, nombreDelCanton: (id: string) => string | undefined) {
  const local = (lugares ?? []).find((w) => w.receivesClients !== false && !!w.cantonId && (!w.level || w.level === "canton"));
  return (local?.cantonId ? nombreDelCanton(local.cantonId) ?? "" : "") || cantonDelPerfil?.trim() || "";
}

export function rotuloDeCobertura(t: Traducir, opciones: {
  pais: boolean;
  base: string;
  enLinea: boolean;
  provincia: string;
  cantonBuscado?: string;
  lugarBuscado: string;
}) {
  const { pais, base, enLinea, provincia, cantonBuscado, lugarBuscado } = opciones;
  if (base && cantonBuscado && comparable(base) === comparable(cantonBuscado)) return lugarBuscado;
  if (pais) return enLinea ? t("enLineaTodoElPais") : base ? t("desdeTodoElPais", { base }) : t("cubreTodoElPais");
  return base ? t("desdeADomicilio", { base }) : t("cubreTodaLaProvincia", { provincia });
}
