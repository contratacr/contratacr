import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPersonDisplayName } from "@/lib/display-name";
import { hasDurablePushOutbox, sendNotificationPush } from "@/lib/push/notify";
import { matchesProjectCoverage } from "@/lib/projects/project-recipients";

/**
 * UNA PROMOCIÓN NUEVA LE LLEGA A QUIEN LA ESTABA BUSCANDO (15-nov-2026).
 *
 * No a todo el mundo: solo a quien, en los últimos 30 días, buscó ese servicio
 * en una provincia que el profesional cubre, o contactó (WhatsApp, llamada o
 * solicitud) a un profesional de ese servicio en esa zona. Una promoción de
 * uñas en Escazú no le sirve a alguien en Limón, y un aviso que no sirve enseña
 * a ignorar los demás.
 *
 * Límites para que no sea ruido:
 * - una sola vez por promoción (editarla o republicarla no vuelve a avisar);
 * - máximo un aviso de promoción por persona cada 7 días;
 * - nunca al que publica ni a otros profesionales de ese mismo servicio;
 * - como mucho MAX_DESTINATARIOS por promoción.
 *
 * Usa el tipo `followed_professional_activity` (con `activity_type: "offer"`),
 * que la base ya acepta y el app ya sabe pintar en los dos idiomas: no hace
 * falta migración.
 */
const TIPO = "followed_professional_activity";
const DIAS_DE_INTERES = 30;
const DIAS_ENTRE_AVISOS = 7;
const MAX_DESTINATARIOS = 300;
const EVENTOS_DE_INTERES = ["search_performed", "whatsapp_click", "phone_click", "service_request_started"];

type Fila = Record<string, unknown>;

export async function avisarPromocionNueva({
  offerId,
  professionalId,
  categoryId,
  title,
}: {
  offerId: string;
  professionalId: string;
  categoryId: string | null | undefined;
  title: string;
}): Promise<number> {
  if (!offerId || !professionalId || !categoryId || !/^[a-z0-9_-]{1,60}$/u.test(categoryId)) return 0;
  const db = createAdminClient();

  const { data: yaAvisada } = await db
    .from("notifications")
    .select("id")
    .eq("type", TIPO)
    .contains("data", { offer_id: offerId })
    .limit(1);
  if ((yaAvisada ?? []).length > 0) return 0;

  const { data: pro } = await db
    .from("professionals")
    .select("id,profile_id,business_name,provincia_id,canton_id,coverage_country,coverage_provincias,coverage_areas,workplaces,profiles(full_name)")
    .eq("id", professionalId)
    .maybeSingle();
  if (!pro?.profile_id) return 0;
  const publicador = pro as unknown as Fila;

  const desde = new Date(Date.now() - DIAS_DE_INTERES * 86_400_000).toISOString();
  const { data: eventos } = await db
    .from("interaction_events")
    .select("viewer_user_id,event_type,professional_id,metadata")
    .eq("category_id", categoryId)
    .in("event_type", EVENTOS_DE_INTERES)
    .not("viewer_user_id", "is", null)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (!eventos?.length) return 0;

  // Dónde está cada profesional contactado: esa es la zona del interés.
  const contactados = [...new Set(eventos.map((e) => e.professional_id).filter((id): id is string => !!id))];
  const zonaDe = new Map<string, { provincia: string | null; canton: string | null }>();
  for (let i = 0; i < contactados.length; i += 200) {
    const { data } = await db.from("professionals").select("id,provincia_id,canton_id").in("id", contactados.slice(i, i + 200));
    for (const p of data ?? []) zonaDe.set(p.id, { provincia: p.provincia_id ?? null, canton: p.canton_id ?? null });
  }

  const candidatos = new Set<string>();
  for (const e of eventos) {
    const usuario = e.viewer_user_id as string;
    if (usuario === pro.profile_id || candidatos.has(usuario)) continue;
    let provincia: string | null = null;
    let canton: string | null = null;
    if (e.event_type === "search_performed") {
      const m = (e.metadata ?? {}) as Fila;
      provincia = typeof m.provincia === "string" && m.provincia ? m.provincia : null;
      canton = typeof m.canton === "string" && m.canton ? m.canton : null;
    } else if (e.professional_id) {
      if (e.professional_id === pro.id) continue;
      const zona = zonaDe.get(e.professional_id);
      provincia = zona?.provincia ?? null;
      canton = zona?.canton ?? null;
    }
    // Sin zona conocida no se puede decir que es "cerca": no se avisa.
    if (!provincia && !canton) continue;
    if (matchesProjectCoverage(publicador, provincia, canton)) candidatos.add(usuario);
  }
  if (candidatos.size === 0) return 0;

  let ids = [...candidatos];
  const excluidos = new Set<string>();
  const recientes = new Date(Date.now() - DIAS_ENTRE_AVISOS * 86_400_000).toISOString();
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const [colegas, avisados, perfiles] = await Promise.all([
      // Otros profesionales de ese servicio: es la competencia, no un cliente.
      db.from("professionals").select("profile_id").in("profile_id", lote).or(`category_id.eq.${categoryId},professions.cs.{${categoryId}}`),
      db.from("notifications").select("user_id").in("user_id", lote).eq("type", TIPO).contains("data", { activity_type: "offer" }).gte("created_at", recientes),
      db.from("profiles").select("id,is_disabled").in("id", lote),
    ]);
    for (const c of colegas.data ?? []) if (c.profile_id) excluidos.add(c.profile_id);
    for (const a of avisados.data ?? []) excluidos.add(a.user_id);
    for (const p of perfiles.data ?? []) if (p.is_disabled) excluidos.add(p.id);
  }
  ids = ids.filter((id) => !excluidos.has(id)).slice(0, MAX_DESTINATARIOS);
  if (ids.length === 0) return 0;

  const perfil = (Array.isArray(publicador.profiles) ? publicador.profiles[0] : publicador.profiles) as { full_name?: string | null } | null;
  const nombre = (typeof publicador.business_name === "string" && publicador.business_name.trim())
    || formatPersonDisplayName(perfil?.full_name ?? "")
    || "Un profesional";
  const titulo = title.trim().slice(0, 120);
  // El texto sigue la forma "<nombre> publicó una nueva promoción: <título>."
  // que lib/localized-notification.ts sabe rearmar en inglés.
  const filas = ids.map((userId) => ({
    user_id: userId,
    type: TIPO,
    title: "Nueva promoción cerca de ti",
    message: `${nombre} publicó una nueva promoción: ${titulo}.`,
    data: {
      link: `/promociones/${offerId}`,
      offer_id: offerId,
      content_id: offerId,
      activity_type: "offer",
      professional_id: professionalId,
      category_id: categoryId,
      actor_name: nombre,
    },
  }));
  const { error } = await db.from("notifications").insert(filas);
  if (error) {
    console.error("[aviso-de-promocion] insert failed", error.code, error.message);
    return 0;
  }
  if (!(await hasDurablePushOutbox())) {
    await Promise.all(filas.map((fila) => sendNotificationPush({ userId: fila.user_id, title: fila.title, message: fila.message, data: fila.data })));
  }
  return filas.length;
}
