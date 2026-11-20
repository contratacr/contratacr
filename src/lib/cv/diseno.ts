import type { SeccionId } from "./documento";

/**
 * EL DISEÑO DEL CV Y DE LA CARTA (19-nov-2026), como el panel de FlowCV:
 * columnas, página, márgenes, letra, color, títulos, encabezado, fechas y
 * habilidades. Va dentro del documento (`cv.diseno`); un documento sin diseño
 * se ve exactamente como antes (la plantilla «Clásica»).
 *
 * La vista previa y el PDF salen de la misma maqueta (lib/cv/maquetar), así
 * que lo que se ve es lo que se descarga, con los mismos saltos de página.
 * El texto para pegar en un formulario (lo que lee un filtro automático) no
 * cambia con el diseño.
 */

export type Columnas = "una" | "izquierda" | "derecha";
export type Formato = "carta" | "a4";
export type Fuente = "helvetica" | "times" | "courier";
export type EstiloTitulo = "linea" | "simple" | "caja" | "fina" | "barra";
export type Paso3 = 1 | 2 | 3;
export type Paso5 = 1 | 2 | 3 | 4 | 5;
export type PlantillaId = "clasica" | "ejecutiva" | "moderna" | "compacta" | "lateral" | "contraste";

export type Diseno = {
  plantilla: PlantillaId;
  columnas: Columnas;
  /** Lo que va en la columna angosta cuando hay dos columnas. */
  lateral: SeccionId[];
  formato: Formato;
  margen: Paso3;
  interlineado: Paso3;
  espacio: Paso3;
  fuente: Fuente;
  tamano: Paso5;
  /** Color de acento: nombre, títulos, líneas y enlaces. */
  color: string;
  titulos: EstiloTitulo;
  encabezado: "apilado" | "en-linea";
  alineacion: "izquierda" | "centro";
  fechas: "abajo" | "derecha";
  habilidades: "comas" | "etiquetas" | "niveles";
  formatoFecha: "numero" | "mes" | "anio";
};

export const TINTA = "#162543";
export const COLORES = ["#162543", "#1f3a5f", "#009fd9", "#0f766e", "#15803d", "#b45309", "#b42318", "#6d28d9"] as const;

/** Lo que va en la columna angosta por defecto: lo corto, que se lee de un vistazo. */
export const LATERAL_BASE: SeccionId[] = ["habilidades", "idiomas", "certificaciones", "cursos", "intereses", "referencias"];

export const DISENO_BASE: Diseno = {
  plantilla: "clasica",
  columnas: "una",
  lateral: LATERAL_BASE,
  formato: "carta",
  margen: 2,
  interlineado: 2,
  espacio: 2,
  fuente: "helvetica",
  tamano: 3,
  color: TINTA,
  titulos: "linea",
  encabezado: "apilado",
  alineacion: "izquierda",
  fechas: "abajo",
  habilidades: "comas",
  formatoFecha: "numero",
};

type Preset = { id: PlantillaId; nombre: { es: string; en: string }; diseno: Omit<Diseno, "plantilla"> };

/** Las plantillas son combinaciones listas de lo mismo que se puede cambiar a mano. */
export const PLANTILLAS: Preset[] = [
  { id: "clasica", nombre: { es: "Clásica", en: "Classic" }, diseno: { ...DISENO_BASE } },
  { id: "ejecutiva", nombre: { es: "Ejecutiva", en: "Executive" }, diseno: { ...DISENO_BASE, fuente: "times", tamano: 4, color: "#1f3a5f", titulos: "simple", alineacion: "centro", fechas: "derecha", formatoFecha: "mes" } },
  { id: "moderna", nombre: { es: "Moderna", en: "Modern" }, diseno: { ...DISENO_BASE, color: "#009fd9", titulos: "barra", fechas: "derecha", habilidades: "etiquetas", formatoFecha: "mes" } },
  { id: "compacta", nombre: { es: "Compacta", en: "Compact" }, diseno: { ...DISENO_BASE, tamano: 2, margen: 1, interlineado: 1, espacio: 1, color: "#0f766e", titulos: "fina", fechas: "derecha", encabezado: "en-linea" } },
  { id: "lateral", nombre: { es: "Con columna", en: "Sidebar" }, diseno: { ...DISENO_BASE, columnas: "izquierda", color: "#1f3a5f", titulos: "caja", habilidades: "niveles", formatoFecha: "mes" } },
  { id: "contraste", nombre: { es: "Contraste", en: "Contrast" }, diseno: { ...DISENO_BASE, columnas: "derecha", color: "#6d28d9", titulos: "linea", fechas: "derecha", habilidades: "etiquetas", encabezado: "en-linea" } },
];

export const esAptaAts = (d: Pick<Diseno, "columnas">) => d.columnas === "una";

const uno = <T,>(valor: unknown, opciones: readonly T[], base: T): T => (opciones.includes(valor as T) ? (valor as T) : base);
const HEX = /^#[0-9a-f]{6}$/i;

/** El diseño guardado, completo y válido. Lo que falte o no se entienda queda como «Clásica». */
export function disenoDe(cv: { diseno?: Partial<Diseno> | null }): Diseno {
  const d = (cv.diseno && typeof cv.diseno === "object" ? cv.diseno : {}) as Partial<Diseno>;
  const b = DISENO_BASE;
  return {
    plantilla: uno(d.plantilla, PLANTILLAS.map((p) => p.id), b.plantilla),
    columnas: uno(d.columnas, ["una", "izquierda", "derecha"] as const, b.columnas),
    lateral: Array.isArray(d.lateral) ? [...new Set(d.lateral.filter((x): x is SeccionId => typeof x === "string"))] : b.lateral,
    formato: uno(d.formato, ["carta", "a4"] as const, b.formato),
    margen: uno(d.margen, [1, 2, 3] as const, b.margen),
    interlineado: uno(d.interlineado, [1, 2, 3] as const, b.interlineado),
    espacio: uno(d.espacio, [1, 2, 3] as const, b.espacio),
    fuente: uno(d.fuente, ["helvetica", "times", "courier"] as const, b.fuente),
    tamano: uno(d.tamano, [1, 2, 3, 4, 5] as const, b.tamano),
    color: typeof d.color === "string" && HEX.test(d.color) ? d.color.toLowerCase() : b.color,
    titulos: uno(d.titulos, ["linea", "simple", "caja", "fina", "barra"] as const, b.titulos),
    encabezado: uno(d.encabezado, ["apilado", "en-linea"] as const, b.encabezado),
    alineacion: uno(d.alineacion, ["izquierda", "centro"] as const, b.alineacion),
    fechas: uno(d.fechas, ["abajo", "derecha"] as const, b.fechas),
    habilidades: uno(d.habilidades, ["comas", "etiquetas", "niveles"] as const, b.habilidades),
    formatoFecha: uno(d.formatoFecha, ["numero", "mes", "anio"] as const, b.formatoFecha),
  };
}

/** Cambiar de plantilla cambia el aspecto; el contenido no se toca. */
export function aplicarPlantilla(id: PlantillaId): Diseno {
  const p = PLANTILLAS.find((x) => x.id === id) ?? PLANTILLAS[0];
  return { ...p.diseno, plantilla: p.id, lateral: [...p.diseno.lateral] };
}

// ── MEDIDAS EN PUNTOS (1/72 de pulgada), las mismas en la vista previa y el PDF ──
export const PAGINA: Record<Formato, { ancho: number; alto: number }> = {
  carta: { ancho: 612, alto: 792 },
  a4: { ancho: 595.28, alto: 841.89 },
};
export const MARGENES: Record<Paso3, number> = { 1: 40, 2: 54, 3: 72 };
export const INTERLINEADOS: Record<Paso3, number> = { 1: 1.22, 2: 1.35, 3: 1.5 };
export const ESPACIOS: Record<Paso3, number> = { 1: 5, 2: 10, 3: 16 };
export const TAMANOS: Record<Paso5, number> = { 1: 9, 2: 9.75, 3: 10.5, 4: 11.25, 5: 12 };

export type Rgb = [number, number, number];
export function rgb(hex: string): Rgb {
  const h = HEX.test(hex) ? hex.slice(1) : TINTA.slice(1);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
/** El color mezclado con blanco: `cuanto` 0 = el color, 1 = blanco. */
export const aclarar = (c: Rgb, cuanto: number): Rgb => c.map((v) => Math.round(v + (255 - v) * cuanto)) as Rgb;
