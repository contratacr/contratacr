import { hasRecentOnceReceipt, insertOnceNotifications, ONCE_NOTIFICATION_TYPES, onceReceipts } from "@/lib/notifications/once";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EMPUJONES AL PROFESIONAL (9-oct-2026, Isaac). «Pide tus primeras reseñas» y
 * «Agrega un precio de referencia» viven en la lista de pasos del panel; el
 * empujón llega por la campanita (y push). Medido ese día: de 315 profesionales
 * activos, 300 sin reseñas y 299 sin un precio real.
 *
 * Reglas, para que no se sienta como spam:
 * - Cada aviso, UNA sola vez por cuenta (se comprueba antes de insertar).
 * - Reseñas a partir del 3.er día de registrado; precio a partir del 7.º.
 * - Nunca dos avisos de estos el mismo día a la misma cuenta, y el de precio
 *   espera 4 días después del de reseñas: a quien le faltan los dos le llega
 *   el de reseñas primero y el de precio después.
 * El recorrido diario (api/internal/resena-google) lo reparte.
 */

const DIA = 86_400_000;

type Servicio = { active?: unknown; priceAmount?: unknown; priceType?: unknown; price?: unknown };

/** Una tarifa de referencia real: «a convenir» no cuenta (misma regla que el panel). */
export function tienePrecioReal(servicios: unknown): boolean {
  if (!Array.isArray(servicios)) return false;
  return servicios.some((s: Servicio) => {
    if (!s || typeof s !== "object" || s.active === false || s.priceType === "a_convenir") return false;
    if (typeof s.priceAmount === "number" && Number.isFinite(s.priceAmount) && s.priceAmount > 0) return true;
    // Legacy free-text prices count only if they contain a positive amount.
    // "Consultar precio" and "A convenir" are not reference prices.
    return typeof s.price === "string" && Number(s.price.replace(/[^0-9]/g, "")) > 0;
  });
}

type Pro = { profile_id: string | null; created_at: string | null; review_count: number | null; services: unknown };

export async function empujarResenasYPrecio(admin: Admin, { simular = false, ahora = Date.now() } = {}) {
  const pros: Pro[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from("professionals")
      .select("profile_id, created_at, review_count, services, profiles!inner(is_disabled)")
      .not("profile_id", "is", null)
      .eq("is_banned", false)
      .eq("profiles.is_disabled", false)
      .order("id").range(desde, desde + 999);
    if (error) throw error;
    const filas = (data ?? []) as Pro[];
    pros.push(...filas);
    if (filas.length < 1000) break;
  }

  // Lo que cada cuenta ya recibió de estos dos avisos (y cuándo).
  const ids = pros.map((p) => p.profile_id as string);
  const recibido = new Map<string, { resenas?: number; precio?: number }>();
  const recibos = await onceReceipts(admin, ids, [...ONCE_NOTIFICATION_TYPES]);
  for (const f of recibos.filter((r) => r.type === "pide_resenas" || r.type === "agrega_precio")) {
    const r = recibido.get(f.user_id) ?? {};
    const fecha = f.sent_at ? Date.parse(f.sent_at) : ahora;
    if (f.type === "pide_resenas") r.resenas = fecha;
    else r.precio = fecha;
    recibido.set(f.user_id, r);
  }

  const resenas: string[] = [];
  const precio: string[] = [];
  for (const pro of pros) {
    const id = pro.profile_id as string;
    const antiguedad = ahora - Date.parse(pro.created_at ?? new Date(ahora).toISOString());
    const ya = recibido.get(id) ?? {};
    if (hasRecentOnceReceipt(recibos, id, ahora)) continue;
    const faltaResena = Number(pro.review_count ?? 0) <= 0;
    const faltaPrecio = !tienePrecioReal(pro.services);
    if (faltaResena && ya.resenas === undefined && antiguedad >= 3 * DIA) {
      resenas.push(id);
      continue; // el de precio, otro día
    }
    if (faltaPrecio && ya.precio === undefined && antiguedad >= 7 * DIA) {
      // Si le tocó (o le toca) el de reseñas, el de precio espera 4 días.
      if (ya.resenas !== undefined && ahora - ya.resenas < 4 * DIA) continue;
      if (faltaResena && ya.resenas === undefined) continue;
      precio.push(id);
    }
  }

  if (simular) return { resenas: resenas.length, precio: precio.length };

  const insertar = async (userIds: string[], type: "pide_resenas" | "agrega_precio") => {
    return insertOnceNotifications(admin, [...new Set(userIds)].map((userId) => ({
      user_id: userId,
      type,
      title: type === "pide_resenas" ? "Pide tus primeras reseñas" : "Agrega un precio de referencia",
      message: type === "pide_resenas"
        ? "Pide una reseña a clientes con los que ya trabajaste. En tu panel tienes un mensaje listo para compartir por WhatsApp."
        : "Se mostrará como «Desde ₡…» para orientar a los clientes. El precio final puede variar según el trabajo.",
      data: { link: "/dashboard/profesional?mode=offer&tab=completion" },
      read: false,
    })));

  };

  return { resenas: await insertar(resenas, "pide_resenas"), precio: await insertar(precio, "agrega_precio") };
}
