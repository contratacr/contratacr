import { textoCompletarPerfil, type FaltaDelPerfil } from "@/lib/notifications/completar-perfil-texto";
import { insertOnceNotifications, onceReceipts } from "@/lib/notifications/once";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * «¿NECESITAS A ALGUIEN?» EN LA CAMPANITA (4-oct-2026, decisión de Isaac).
 * Se manda a toda cuenta nueva al crearse y, una vez, a las que ya existían
 * (el recorrido diario de resena-google la reparte). Una línea y el enlace al
 * formulario; la aclaración «es para pedir, no para ofrecer» sobraba (6-oct).
 * Una sola vez por cuenta, mediante un recibo permanente en la base.
 */
const TITULO = { es: "¿Necesitas a alguien?", en: "Need someone?" };
const CUERPO = {
  es: "Publique lo que necesita y los profesionales le contactan por WhatsApp.",
  en: "Post what you need and professionals contact you on WhatsApp.",
};

export async function invitarAPublicarProyecto(admin: Admin, profileIds: string[], idioma: "es" | "en" = "es") {
  const destinatarios = [...new Set(profileIds.filter(Boolean))];
  if (destinatarios.length === 0) return { enviadas: 0, yaTenian: 0 };
  try {
    const recibos = await onceReceipts(admin, destinatarios, ["invita_proyecto"]);
    const yaTienen = new Set(recibos.map((r) => r.user_id));
    const nuevos = destinatarios.filter((id) => !yaTienen.has(id));
    const enviadas = await insertOnceNotifications(admin, nuevos.map((userId) => ({
      user_id: userId, type: "invita_proyecto", title: TITULO[idioma], message: CUERPO[idioma],
      data: { link: "/publicar-solicitud" }, read: false,
    })));
    return { enviadas, yaTenian: yaTienen.size };
  } catch {
    // Un aviso nunca puede tumbar el registro ni nada de lo que lo llame.
    return { enviadas: 0, yaTenian: 0 };
  }
}

/** Las cuentas de CLIENTE que todavía no la recibieron (una vez a cada una).
 *  Los profesionales quedan fuera: les llegaba «Publica lo que necesitas…» a
 *  317 profesionales (9-oct-2026). */
export async function invitarAPublicarATodas(admin: Admin, { simular = false } = {}) {
  const pros = new Set<string>();
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from("professionals").select("profile_id").not("profile_id", "is", null).order("id").range(desde, desde + 999);
    if (error) throw error;
    const filas = (data ?? []) as { profile_id: string }[];
    for (const f of filas) pros.add(f.profile_id);
    if (filas.length < 1000) break;
  }
  const ids: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await admin.from("profiles").select("id").eq("is_disabled", false).order("id").range(desde, desde + 999);
    if (error) throw error;
    const filas = (data ?? []) as { id: string }[];
    ids.push(...filas.map((f) => f.id).filter((id) => !pros.has(id)));
    if (filas.length < 1000) break;
  }
  if (simular) return { cuentas: ids.length, enviadas: 0 };
  const r = await invitarAPublicarProyecto(admin, ids);
  return { cuentas: ids.length, ...r };
}

/**
 * «COMPLETA TU PERFIL» al profesional recién registrado (5-oct-2026): lleva a
 * los pasos que faltan. Una sola vez.
 * SOLO LO QUE FALTA (18-nov-2026): decía siempre "foto, descripción y
 * servicios", también a quien ya había subido su foto en el registro. Ahora
 * nombra lo que falta de verdad y, si no falta nada, no se manda.
 */
export async function avisarCompletarPerfil(admin: Admin, profileId: string, idioma: "es" | "en" = "es") {
  try {
    const recibos = await onceReceipts(admin, [profileId], ["completa_perfil"]);
    if (recibos.length > 0) return;
    const [{ data: perfil }, { data: pro }] = await Promise.all([
      admin.from("profiles").select("avatar_url").eq("id", profileId).maybeSingle(),
      admin.from("professionals").select("bio, services").eq("profile_id", profileId).maybeSingle(),
    ]);
    const servicios = Array.isArray(pro?.services) ? pro.services : [];
    const faltan: FaltaDelPerfil[] = [];
    if (!String(perfil?.avatar_url ?? "").trim()) faltan.push("foto");
    if (!String(pro?.bio ?? "").trim()) faltan.push("descripcion");
    if (servicios.length === 0) faltan.push("servicios");
    if (faltan.length === 0) return;
    await insertOnceNotifications(admin, [{
      user_id: profileId,
      type: "completa_perfil",
      title: idioma === "en" ? "Complete your profile" : "Complete su perfil",
      message: textoCompletarPerfil(faltan, idioma),
      data: { link: "/dashboard/profesional?mode=offer&tab=completion", faltan },
      read: false,
    }]);
  } catch {
    // Nunca tumba el registro.
  }
}
