"use client";

import { createClient } from "@/lib/supabase/client";

export type Aviso = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: Record<string, unknown> | null;
};

/**
 * Un solo canal de avisos por persona, y una sola consulta a la vez.
 *
 * La campana se dibuja dos veces —la del escritorio y la del teléfono viven en
 * la misma barra— y cada copia abría su propio canal de tiempo real y repetía
 * la consulta en cada evento: dos canales y cuatro lecturas por cada aviso.
 * Aquí viven ambas cosas una sola vez y las campanas se cuelgan; la última en
 * irse cierra el canal.
 */

type Cambio =
  | { tipo: "insert"; aviso: Aviso }
  | { tipo: "update"; aviso: Aviso }
  | { tipo: "delete"; id: string };

type Suscripcion = {
  oyentes: Set<(cambio: Cambio) => void>;
  cerrar: () => void;
};

const suscripciones = new Map<string, Suscripcion>();
const enVuelo = new Map<string, Promise<Aviso[]>>();

export function suscribirseAAvisos(userId: string, alCambiar: (cambio: Cambio) => void) {
  let suscripcion = suscripciones.get(userId);
  if (!suscripcion) {
    const oyentes = new Set<(cambio: Cambio) => void>();
    const supabase = createClient();
    const avisar = (cambio: Cambio) => { for (const oyente of oyentes) oyente(cambio); };
    const canal = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => avisar({ tipo: "insert", aviso: payload.new as Aviso }))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => avisar({ tipo: "update", aviso: payload.new as Aviso }))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => avisar({ tipo: "delete", id: (payload.old as { id: string }).id }))
      .subscribe();
    suscripcion = { oyentes, cerrar: () => { void supabase.removeChannel(canal); } };
    suscripciones.set(userId, suscripcion);
  }
  suscripcion.oyentes.add(alCambiar);
  return () => {
    const actual = suscripciones.get(userId);
    if (!actual) return;
    actual.oyentes.delete(alCambiar);
    if (actual.oyentes.size === 0) {
      actual.cerrar();
      suscripciones.delete(userId);
    }
  };
}

/** Los últimos 20 avisos. Dos campanas pidiendo a la vez comparten la lectura. */
export function pedirAvisos(userId: string): Promise<Aviso[]> {
  const pendiente = enVuelo.get(userId);
  if (pendiente) return pendiente;
  const promesa = Promise.resolve(createClient()
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20)
    .then(
      ({ data }) => { enVuelo.delete(userId); return (data ?? []) as Aviso[]; },
      () => { enVuelo.delete(userId); return [] as Aviso[]; },
    ));
  enVuelo.set(userId, promesa);
  return promesa;
}

/** Cuántos hay sin leer cuando la página de 20 vino llena. */
export function pedirTotalSinLeer(userId: string): Promise<number | null> {
  return Promise.resolve(createClient()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("read", false)
    .then(({ count, error }) => (!error && typeof count === "number" ? count : null), () => null));
}
