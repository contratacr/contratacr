"use client";

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useCachedResource } from "@/hooks/use-cached-resource";

export type AvisoSinLeer = {
  id: string;
  type: string;
  data: Record<string, unknown> | null;
};

/**
 * Los avisos sin leer de esta persona, UNA sola vez.
 *
 * El panel los pedía para repartir el globo entre modo cliente y profesional,
 * Soporte los volvía a pedir filtrados por `support_reply` y la campana pedía
 * aparte el total: tres lecturas de la misma tabla en cada carga y en cada
 * aviso nuevo. Ahora todos leen esta lista, que se guarda por persona y se
 * refresca sola con `notificationsChanged`.
 */
export function useAvisosSinLeer(userId: string | null | undefined) {
  const vacio = useMemo<AvisoSinLeer[]>(() => [], []);
  const { data } = useCachedResource<AvisoSinLeer[]>(
    userId ? `avisos-sin-leer:${userId}` : null,
    async () => {
      const supabase = createClient();
      const { data: filas } = await supabase
        .from("notifications")
        .select("id, type, data")
        .eq("user_id", userId!)
        .eq("read", false);
      return (filas ?? []) as AvisoSinLeer[];
    },
    vacio,
    { refreshOn: true },
  );
  return data;
}
