/**
 * LOS OFICIOS QUE OFRECE EL BUSCADOR DEL TELÉFONO CUANDO NO HAY NADA ESCRITO NI
 * NADA RECIENTE. Es lo primero que ve quien no conoce el sitio.
 *
 * Dos reglas, y las dos importan:
 *
 * 1. UNO POR GRUPO. Tomados por popularidad salen siete de hogar seguidos, y
 *    entonces nadie se entera de que también hay abogados, contadores o
 *    desarrollo web —que es justo lo que más cuesta que la gente sepa—. La
 *    amplitud la decide la lista de abajo, a mano.
 *
 * 2. SOLO DONDE HAY GENTE. Cuál oficio de cada grupo lo deciden los datos:
 *    el primer candidato del grupo con al menos MIN_SUPPLY_FOR_LANDING
 *    profesionales registrados (la misma vara que decide qué páginas de oficio
 *    existen). Ofrecer «Psicología» y que al tocar no haya nadie es peor que
 *    no ofrecerla. Sin datos de oferta —la base no contestó— se cae al primer
 *    candidato de cada grupo, que es lo que había antes.
 *
 * Se calcula en el servidor (la cuenta de oferta se guarda una hora) y viaja a
 * la capa de cliente por el mismo instalador que el catálogo
 * (`components/util/catalogo-del-servidor.tsx`), para que el servidor y el
 * navegador pinten la misma lista y la hidratación no tenga nada que corregir.
 */

/** Candidatos por grupo, en orden de preferencia. El orden de los grupos es el
 *  orden en pantalla: hogar primero porque es lo que más se busca. */
const CANDIDATOS_POR_GRUPO: string[][] = [
  ["limpieza", "limpieza_oficinas", "desinfeccion"],       // limpieza
  ["electricidad", "plomeria", "pintura", "jardineria"],   // hogar
  ["mecanica", "aire_acondicionado_automotriz"],           // vehículos
  ["peluqueria", "maquillaje", "depilacion"],              // belleza
  ["desarrollo_web", "soporte_tecnico", "diseno_grafico"], // tecnología
  ["contabilidad", "asesoria_financiera"],                 // empresas
  ["legal", "asesoria_tributaria", "gestoria_tramites"],   // legal
  ["psicologia", "fisioterapia", "nutricion"],             // salud
];

export const OFICIOS_DE_ARRANQUE_FIJOS: string[] = CANDIDATOS_POR_GRUPO.map((grupo) => grupo[0]);

/** Elige los oficios con la cuenta de oferta en la mano. `minimo` es cuántos
 *  profesionales hacen que un oficio valga la pena ofrecerlo. */
export function elegirOficiosDeArranque(oferta: Record<string, number> | null, minimo: number): string[] {
  if (!oferta || Object.keys(oferta).length === 0) return OFICIOS_DE_ARRANQUE_FIJOS;
  const elegidos: string[] = [];
  for (const grupo of CANDIDATOS_POR_GRUPO) {
    const conGente = grupo.find((id) => (oferta[id] ?? 0) >= minimo);
    if (conGente) elegidos.push(conGente);
  }
  return elegidos;
}

/* ── Registro por capa de módulos ──────────────────────────────────────────
   Igual que el catálogo: existe una copia por capa (servidor / cliente) y el
   instalador la llena en las dos durante el render. */
let instalados: string[] | null = null;

export function instalarOficiosDeArranque(ids: string[] | null | undefined): void {
  if (!ids || ids.length === 0) return;
  instalados = ids;
}

/** La lista vigente, o la fija si nadie instaló nada. */
export function oficiosDeArranque(): string[] {
  return instalados ?? OFICIOS_DE_ARRANQUE_FIJOS;
}
