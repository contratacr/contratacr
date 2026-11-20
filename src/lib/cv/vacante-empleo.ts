/**
 * LA VACANTE QUE VIAJA DEL EMPLEO AL GENERADOR (20-nov-2026).
 * Lo pone la tarjeta «Prepare su postulación» al pie de un empleo y lo lee el
 * editor de currículum o de carta una sola vez. Aquí solo hay lo que no depende
 * del navegador, para poder probarlo.
 */

/** Lo que viaja. Lo guardado antes (solo puesto y empresa) se sigue leyendo. */
export type VacanteParaCurriculum = {
  puesto?: string;
  empresa?: string;
  /** El anuncio en texto plano, hasta MAX_TEXTO_VACANTE. */
  texto?: string;
  destino?: "cv" | "carta";
};

/** Igual que MAX_OFERTA en lib/cv/ia: lo que cabe en «Adaptar a una oferta». */
export const MAX_TEXTO_VACANTE = 6000;

type Vacante = {
  title?: string;
  employer_name?: string;
  description?: string;
  responsibilities?: string[];
  requirements?: string[];
};

/** El anuncio como texto plano: puesto, empresa, descripción, responsabilidades y requisitos. */
export function textoDeLaVacante(job: Vacante, en: boolean): string {
  const lista = (titulo: string, items: string[] | undefined) => {
    const limpios = (items ?? []).map((x) => x.trim()).filter(Boolean);
    return limpios.length ? `${titulo}:\n${limpios.map((x) => `- ${x}`).join("\n")}` : "";
  };
  return [
    job.title?.trim(),
    job.employer_name?.trim(),
    job.description?.trim(),
    lista(en ? "Responsibilities" : "Responsabilidades", job.responsibilities),
    lista(en ? "Requirements" : "Requisitos", job.requirements),
  ].filter(Boolean).join("\n\n").slice(0, MAX_TEXTO_VACANTE);
}

/** Lee lo guardado sin confiar en su forma: solo texto, con tope, y un destino conocido. */
export function leerVacanteGuardada(crudo: unknown): VacanteParaCurriculum | null {
  if (!crudo || typeof crudo !== "object") return null;
  const v = crudo as Record<string, unknown>;
  const texto = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : undefined);
  return {
    puesto: texto(v.puesto, 200),
    empresa: texto(v.empresa, 200),
    texto: texto(v.texto, MAX_TEXTO_VACANTE),
    destino: v.destino === "cv" || v.destino === "carta" ? v.destino : undefined,
  };
}

/** Qué hacer al llegar a «Mis currículums» o «Mis cartas» desde un empleo. */
export type AlLlegar =
  | { accion: "carta-nueva" }
  | { accion: "cv-existente"; id: string }
  | { accion: "cv-nuevo" }
  | null;

/**
 * Cada botón del empleo lleva a lo suyo: la carta abre una carta NUEVA (nunca
 * pisa una) y el currículum abre el más reciente con «Adaptar a una oferta»
 * listo. Un aviso viejo (sin destino) solo sirve a la carta, como antes, y un
 * destino que no es de esta pantalla se ignora.
 */
export function alLlegarDesdeUnEmpleo(
  tipo: "cv" | "carta",
  v: VacanteParaCurriculum | null,
  cvs: { id: string; actualizado: number }[],
): AlLlegar {
  if (!v || !(v.puesto || v.empresa || v.texto)) return null;
  if (tipo === "carta") return v.destino === "cv" ? null : { accion: "carta-nueva" };
  if (v.destino !== "cv") return null;
  const ultimo = [...cvs].sort((x, y) => y.actualizado - x.actualizado)[0];
  return ultimo ? { accion: "cv-existente", id: ultimo.id } : { accion: "cv-nuevo" };
}
