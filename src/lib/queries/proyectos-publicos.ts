import { claveDeTramo, rangoDePrefijo } from "@/lib/marketplace-url";
import { perfilesBloqueadosPor } from "@/lib/queries/bloqueos";
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
  try { return (await cargarProyectosPublicosConAutor(limite, await getLocale())).map(({ client_id: _author, ...item }) => { void _author; return item; }); }
  catch (error) { console.error("Could not load public projects", error); return []; }
}

/** Server-only ownership metadata; callers must strip client_id before serialization. */
export async function cargarProyectosPublicosConAutor(limite: number, locale: string, offset = 0, tramo?: string): Promise<Array<ProyectoPublico & {client_id:string}>> {
  const db = createAdminClient();
  const clave=tramo?claveDeTramo(tramo):null;
  if(tramo&&!clave?.id&&!clave?.prefijo)return [];
  const columnas = "id, title, description, category_id, provincia_id, canton_id, created_at, client_name_snapshot, client_id, status";
  const consulta = (extra: string, porPermiso: boolean) => {
    const selection: string=columnas+extra;
    let base=db.from("projects").select(selection).eq("status","open");
    base=porPermiso?base.eq("allow_direct_contact",true):base.gte("created_at",TABLERO_PUBLICO_DESDE);
    if(clave?.id)base=base.eq("id",clave.id);
    else if(clave?.prefijo){const rango=rangoDePrefijo(clave.prefijo);base=base.gte("id",rango.desde).lte("id",rango.hasta);}
    return base.order("created_at",{ascending:false}).order("id",{ascending:false}).range(offset,offset+limite-1);
  };
  // Older schemas lack the explicit permission column; retain the launch-date
  // privacy boundary rather than exposing projects created under older rules.
  const consultaVieja = (extra:string)=>consulta(extra,false);

  let { data, error } = await consulta(", allow_direct_contact, allow_phone_contact", true);
  if (error?.code === "42703") ({ data, error } = await consultaVieja(""));
  if (error) {
    throw new Error(`public-projects-unavailable: ${error.code}`);
  }

  const filas = (data ?? []) as unknown as Array<Record<string, unknown>>;

  // La foto y el nombre de la cuenta, en una sola consulta aparte. Se lee así
  // —y no con un join— para no depender del nombre de la llave foránea, que
  // cambia entre entornos. Si falla, el tablero sigue saliendo con el nombre
  // que se guardó al publicar.
  const idsDeClientes = [...new Set(filas.map((fila) => String(fila.client_id ?? "")).filter(Boolean))];
  const cuentas = new Map<string, { nombre: string | null; foto: string | null; verificada?: boolean }>();
  if (idsDeClientes.length > 0) {
    const { data: perfiles } = await db.from("profiles").select("id, full_name, avatar_url, client_identity_status").in("id", idsDeClientes);
    for (const perfil of (perfiles ?? []) as Array<Record<string, unknown>>) {
      cuentas.set(String(perfil.id), {
        nombre: perfil.full_name ? repairVisibleText(String(perfil.full_name)) : null,
        foto: perfil.avatar_url ? String(perfil.avatar_url) : null,
        verificada: perfil.client_identity_status === "verified",
      });
    }
  }

  return filas.map((fila) => ({...aProyectoPublico(fila, cuentas.get(String(fila.client_id ?? "")), locale),client_id:String(fila.client_id??"")}));
}

/** A public shared link is resolved directly, never through the first list page. */
export async function cargarProyectoPublico(tramo:string,userId?:string):Promise<ProyectoPublico|null>{
  const [rows,blocked]=await Promise.all([cargarProyectosPublicosConAutor(1,await getLocale(),0,tramo),perfilesBloqueadosPor(userId)]);
  const row=rows[0];if(!row||blocked.has(row.client_id))return null;
  const {client_id:_author,...item}=row;void _author;return item;
}

/**
 * Una fila de `projects` como la ve el tablero. Estaba dentro del `.map` de la
 * consulta pública; se saca aquí para que la ficha de UN proyecto —la del
 * dueño, que puede estar finalizado o cancelado— salga exactamente igual y no
 * haya dos versiones del mismo recorte.
 */
function aProyectoPublico(
  fila: Record<string, unknown>,
  cuenta: { nombre: string | null; foto: string | null; verificada?: boolean } | undefined,
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
      client_verified: cuenta?.verificada === true,
      allow_direct_contact: fila.allow_direct_contact !== false,
      // Apagado por omisión, y también cuando la columna todavía no existe:
      // que a alguien le llamen se concede, no se asume.
      allow_phone_contact: fila.allow_phone_contact === true,
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
  const { data: perfil } = await db.from("profiles").select("full_name, avatar_url, client_identity_status").eq("id", userId).maybeSingle();
  const p = perfil as { full_name?: string | null; avatar_url?: string | null; client_identity_status?: string | null } | null;
  return aProyectoPublico(fila, {
    nombre: p?.full_name ? repairVisibleText(String(p.full_name)) : null,
    foto: p?.avatar_url ? String(p.avatar_url) : null,
    verificada: p?.client_identity_status === "verified",
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
