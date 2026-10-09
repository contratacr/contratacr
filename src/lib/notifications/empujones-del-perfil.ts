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

/** Un «desde ₡» de verdad: «a convenir» no cuenta (misma regla que el panel). */
export function tienePrecioReal(servicios: unknown): boolean {
  if (!Array.isArray(servicios)) return false;
  return servicios.some((s: Servicio) =>
    s && typeof s === "object" && s.active !== false && s.priceType !== "a_convenir" && (
      (typeof s.priceAmount === "number" && s.priceAmount > 0) ||
      (typeof s.price === "string" && s.price.trim().length > 0)
    ));
}

type Pro = { profile_id: string | null; created_at: string | null; review_count: number | null; services: unknown };

export async function empujarResenasYPrecio(admin: Admin, { simular = false, ahora = Date.now() } = {}) {
  const pros: Pro[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin
      .from("professionals")
      .select("profile_id, created_at, review_count, services")
      .not("profile_id", "is", null)
      .eq("is_banned", false)
      .range(desde, desde + 999);
    if (error) throw error;
    const filas = (data ?? []) as Pro[];
    pros.push(...filas);
    if (filas.length < 1000) break;
  }

  // Lo que cada cuenta ya recibió de estos dos avisos (y cuándo).
  const ids = pros.map((p) => p.profile_id as string);
  const recibido = new Map<string, { resenas?: number; precio?: number }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await admin
      .from("notifications")
      .select("user_id, type, created_at")
      .in("type", ["pide_resenas", "agrega_precio"])
      .in("user_id", ids.slice(i, i + 300));
    for (const f of (data ?? []) as { user_id: string; type: string; created_at: string }[]) {
      const r = recibido.get(f.user_id) ?? {};
      if (f.type === "pide_resenas") r.resenas = Date.parse(f.created_at);
      else r.precio = Date.parse(f.created_at);
      recibido.set(f.user_id, r);
    }
  }

  const resenas: string[] = [];
  const precio: string[] = [];
  for (const pro of pros) {
    const id = pro.profile_id as string;
    const antiguedad = ahora - Date.parse(pro.created_at ?? new Date(ahora).toISOString());
    const ya = recibido.get(id) ?? {};
    const faltaResena = Number(pro.review_count ?? 0) <= 0;
    const faltaPrecio = !tienePrecioReal(pro.services);
    if (faltaResena && ya.resenas === undefined && antiguedad >= 3 * DIA) {
      resenas.push(id);
      continue; // el de precio, otro día
    }
    if (faltaPrecio && ya.precio === undefined && antiguedad >= 7 * DIA) {
      // Si le tocó (o le toca) el de reseñas, el de precio espera 4 días.
      if (faltaResena && (ya.resenas === undefined || ahora - ya.resenas < 4 * DIA)) continue;
      precio.push(id);
    }
  }

  if (simular) return { resenas: resenas.length, precio: precio.length };

  const insertar = async (userIds: string[], type: "pide_resenas" | "agrega_precio") => {
    let enviadas = 0;
    for (let i = 0; i < userIds.length; i += 200) {
      const tanda = userIds.slice(i, i + 200).map((userId) => ({
        user_id: userId,
        type,
        title: type === "pide_resenas" ? "Pide tus primeras reseñas" : "Agrega un precio de referencia",
        message: type === "pide_resenas"
          ? "Los perfiles con al menos una reseña reciben muchos más mensajes. Pídesela a 3 clientes con los que ya trabajaste: el mensaje ya está listo."
          : "El cliente se anima más a escribir cuando ve un «desde ₡». Pon el mínimo con el que arrancas; el final lo acuerdas con cada cliente.",
        data: { link: "/dashboard/profesional?mode=offer&tab=completion" },
        read: false,
      }));
      const { error } = await admin.from("notifications").insert(tanda);
      // Un rechazo de la base no puede pasar callado (lección del 4-oct: el
      // tipo no existía en la regla y no llegó ninguno).
      if (error) console.error(`[${type}] insert`, error.code, error.message);
      else enviadas += tanda.length;
    }
    return enviadas;
  };

  return { resenas: await insertar(resenas, "pide_resenas"), precio: await insertar(precio, "agrega_precio") };
}
