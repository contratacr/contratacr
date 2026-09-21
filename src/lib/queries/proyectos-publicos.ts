import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCategoryLabel } from "@/lib/data/categories";
import { getCantonById, getProvinceById } from "@/lib/data/cr-geography";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { primerNombre, type ProyectoPublico } from "@/lib/proyectos";
import { getLocale } from "next-intl/server";

/**
 * Desde cuándo hay tablero público de proyectos. Lo publicado antes salió con
 * otra promesa y se queda fuera; ver la nota dentro de la consulta.
 */
export const TABLERO_PUBLICO_DESDE = "2026-09-15T00:00:00Z";

/**
 * Los proyectos abiertos, tal como salen al tablero público.
 *
 * Se lee con el cliente de servicio porque la tabla `projects` solo deja leer al
 * dueño (o a un profesional que calce con la profesión), y aquí la lista es
 * pública. Lo que se devuelve está recortado a mano: título, qué necesita, zona,
 * fecha, el nombre de quien publica y su foto de cuenta. El teléfono, el
 * correo, la cédula y la identidad del beneficiario no salen nunca de aquí.
 */
export async function cargarProyectosPublicos(limite = 100): Promise<ProyectoPublico[]> {
  const locale = await getLocale();
  const db = createAdminClient();
  const columnas = "id, title, description, category_id, provincia_id, canton_id, created_at, client_name_snapshot, client_id, status";
  const consulta = (extra: string) => db
    .from("projects")
    .select(`${columnas}${extra}`)
    .eq("status", "open")
    // Lo que separa a los de antes de los de ahora es la FECHA, no una columna:
    // un proyecto publicado antes del tablero se publicó bajo otra regla —solo
    // lo veían los profesionales de su oficio— y nadie aceptó que saliera al
    // internet entero. Con la fecha, el tablero funciona aunque la migración 207
    // todavía no haya corrido, y cuando corra la columna solo agrega el permiso
    // por cliente (quien lo quita, se sale).
    .gte("created_at", TABLERO_PUBLICO_DESDE)
    .order("created_at", { ascending: false })
    .limit(limite);

  let { data, error } = await consulta(", allow_direct_contact");
  if (error?.code === "42703") ({ data, error } = await consulta(""));
  if (error) {
    console.error("Could not load public projects", error.message);
    return [];
  }

  const filas = (data ?? []) as unknown as Array<Record<string, unknown>>;

  // La foto y el nombre de la cuenta, en una sola consulta aparte. Se lee así
  // —y no con un join— para no depender del nombre de la llave foránea, que
  // cambia entre entornos. Si falla, el tablero sigue saliendo con el nombre
  // que se guardó al publicar.
  const idsDeClientes = [...new Set(filas.map((fila) => String(fila.client_id ?? "")).filter(Boolean))];
  const cuentas = new Map<string, { nombre: string | null; foto: string | null }>();
  if (idsDeClientes.length > 0) {
    const { data: perfiles } = await db.from("profiles").select("id, full_name, avatar_url").in("id", idsDeClientes);
    for (const perfil of (perfiles ?? []) as Array<Record<string, unknown>>) {
      cuentas.set(String(perfil.id), {
        nombre: perfil.full_name ? repairVisibleText(String(perfil.full_name)) : null,
        foto: perfil.avatar_url ? String(perfil.avatar_url) : null,
      });
    }
  }

  return filas.map((fila) => aProyectoPublico(fila, cuentas.get(String(fila.client_id ?? "")), locale));
}

/**
 * Una fila de `projects` como la ve el tablero. Estaba dentro del `.map` de la
 * consulta pública; se saca aquí para que la ficha de UN proyecto —la del
 * dueño, que puede estar finalizado o cancelado— salga exactamente igual y no
 * haya dos versiones del mismo recorte.
 */
function aProyectoPublico(
  fila: Record<string, unknown>,
  cuenta: { nombre: string | null; foto: string | null } | undefined,
  locale: string,
): ProyectoPublico {
    const provinciaId = (fila.provincia_id as string | null) ?? null;
    const cantonId = (fila.canton_id as string | null) ?? null;
    const provincia = provinciaId ? getProvinceById(provinciaId)?.name ?? null : null;
    const canton = cantonId ? getCantonById(cantonId)?.name ?? null : null;
    const categoryId = (fila.category_id as string | null) ?? null;
    // El nombre de la cuenta manda sobre el que se guardó al publicar: si
    // alguien lo corrigió después, el tablero muestra el corregido.
    const nombreDeLaCuenta = cuenta?.nombre || repairVisibleText(String(fila.client_name_snapshot ?? ""));
    return {
      id: String(fila.id),
      title: repairVisibleText(String(fila.title ?? "")),
      description: repairVisibleText(String(fila.description ?? "")),
      category_id: categoryId,
      category_name: categoryId ? getCategoryLabel(categoryId, locale) : null,
      provincia_id: provinciaId,
      canton_id: cantonId,
      location_label: canton && provincia ? `${canton}, ${provincia}` : provincia,
      created_at: String(fila.created_at),
      client_first_name: primerNombre(nombreDeLaCuenta),
      client_name: nombreDeLaCuenta || primerNombre(nombreDeLaCuenta),
      client_avatar_url: cuenta?.foto ?? null,
      allow_direct_contact: fila.allow_direct_contact !== false,
    } satisfies ProyectoPublico;
}

/**
 * UN proyecto, el de su dueño, en cualquier estado.
 *
 * El tablero público solo sirve los abiertos, así que abrir desde el panel un
 * proyecto ya finalizado o cancelado daba «página no encontrada». Quien lo
 * publicó tiene que poder mirarlo siempre: es suyo. Se lee con el cliente de
 * servicio —la tabla solo deja leer al dueño o a un profesional que calce— y se
 * comprueba a mano que `client_id` sea quien pregunta; sin eso, no devuelve
 * nada. Sale con el MISMO recorte que el tablero: ni teléfono, ni correo, ni
 * cédula.
 */
export async function cargarProyectoDelDueno(id: string, userId: string | null | undefined): Promise<ProyectoPublico | null> {
  if (!id || !userId) return null;
  const locale = await getLocale();
  const db = createAdminClient();
  const columnas = "id, title, description, category_id, provincia_id, canton_id, created_at, client_name_snapshot, client_id, status";
  const consulta = (extra: string) => db.from("projects").select(`${columnas}${extra}`).eq("id", id).maybeSingle();
  let { data, error } = await consulta(", allow_direct_contact");
  if (error?.code === "42703") ({ data, error } = await consulta(""));
  if (error || !data) return null;
  const fila = data as unknown as Record<string, unknown>;
  if (String(fila.client_id ?? "") !== userId) return null;
  const { data: perfil } = await db.from("profiles").select("full_name, avatar_url").eq("id", userId).maybeSingle();
  const p = perfil as { full_name?: string | null; avatar_url?: string | null } | null;
  return aProyectoPublico(fila, {
    nombre: p?.full_name ? repairVisibleText(String(p.full_name)) : null,
    foto: p?.avatar_url ? String(p.avatar_url) : null,
  }, locale);
}

/**
 * Los proyectos que publicó quien está mirando, para que su propia ficha no le
 * ofrezca escribirse por WhatsApp ni guardarse a sí mismo. Se lee con SU sesión:
 * la tabla solo le deja ver los suyos, así que no hace falta más filtro que ese.
 */
export async function idsDeMisProyectos(
  supabase: SupabaseClient,
  userId: string | null | undefined,
): Promise<string[]> {
  if (!userId) return [];
  const { data, error } = await supabase.from("projects").select("id").eq("client_id", userId).eq("status", "open");
  if (error) return [];
  return ((data ?? []) as Array<{ id: string }>).map((fila) => String(fila.id));
}
