/**
 * Mide el padrón: cuántas filas cargaron y si la consulta responde.
 *
 * Existe porque un padrón cargado A MEDIAS es indistinguible de un padrón
 * completo desde el lado del app: las cédulas que sí están se verifican solas y
 * las que faltan devuelven «no encontrada», exactamente igual que un rechazo
 * legítimo. El único modo de notar la diferencia es contar las filas.
 *
 * El padrón electoral del TSE ronda los 3,6 millones de personas: un total muy
 * por debajo de eso significa que la carga se quedó a medio camino.
 */
const TSE_APROXIMADO = 3_600_000;

type PadronD1 = {
  prepare(query: string): {
    first<T = unknown>(): Promise<T | null>;
  };
};

export async function medirPadron(): Promise<{
  disponible: boolean;
  filas: number | null;
  esperadoAprox: number;
  completoAprox: boolean | null;
  detalle: string;
}> {
  let db: PadronD1 | null = null;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    db = (context.env as { PADRON_D1?: PadronD1 }).PADRON_D1 ?? null;
  } catch {
    db = null;
  }
  if (!db) {
    return {
      disponible: false,
      filas: null,
      esperadoAprox: TSE_APROXIMADO,
      completoAprox: null,
      detalle: "El binding PADRON_D1 no está disponible en este ambiente.",
    };
  }
  try {
    const fila = await db.prepare("select count(*) as total from padron").first<{ total: number }>();
    const filas = Number(fila?.total ?? 0);
    // Se da por completo a partir del 90 % del padrón del TSE: el número exacto
    // baja con cada depuración del registro electoral, así que un margen rígido
    // daría falsas alarmas.
    const completoAprox = filas >= TSE_APROXIMADO * 0.9;
    return {
      disponible: true,
      filas,
      esperadoAprox: TSE_APROXIMADO,
      completoAprox,
      detalle: completoAprox
        ? "El padrón está cargado."
        : `El padrón está INCOMPLETO: ${filas.toLocaleString("es-CR")} filas de ~${TSE_APROXIMADO.toLocaleString("es-CR")}. Las cédulas que falten salen «pendiente de revisión» aunque sean válidas.`,
    };
  } catch (error) {
    return {
      disponible: true,
      filas: null,
      esperadoAprox: TSE_APROXIMADO,
      completoAprox: null,
      detalle: `La consulta al padrón falló: ${error instanceof Error ? error.message : "desconocido"}`,
    };
  }
}
