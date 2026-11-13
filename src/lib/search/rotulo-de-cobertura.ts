/**
 * CÓMO SE LEE EN LA TARJETA QUIEN CUBRE UNA PROVINCIA O TODO EL PAÍS.
 *
 * Una regla, tres rótulos, un solo renglón (decisión de Isaac, 13-nov-2026).
 * Con una zona buscada, la tarjeta dice lo más puntual que calza con ella:
 *  - Está en la zona (un lugar suyo o su perfil) → su lugar: «Belén, Heredia».
 *  - Cubre toda la provincia buscada              → «Provincia de Heredia».
 *  - Cubre todo el país                           → «Todo Costa Rica».
 * El primer caso lo resuelve professional-schedule.tsx con sus lugares; aquí
 * van los dos rótulos de cobertura. Sin zona buscada nadie se re-rotula.
 * El orden de la lista no depende de esto: primero las reseñas, y la zona
 * solo desempata (query-core.ts, ordenFinal).
 */
export type ClaveDeCobertura = "provinciaEntera" | "countryCoverage";
type Traducir = (clave: ClaveDeCobertura, valores?: Record<string, string>) => string;

export function rotuloDeCobertura(t: Traducir, opciones: { pais: boolean; provincia: string }) {
  return opciones.pais || !opciones.provincia.trim()
    ? t("countryCoverage")
    : t("provinciaEntera", { provincia: opciones.provincia.trim() });
}
