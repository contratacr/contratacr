import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * «¿NECESITAS A ALGUIEN?» EN LA CAMPANITA (4-oct-2026, decisión de Isaac).
 * Se manda a toda cuenta nueva al crearse y, una vez, a las que ya existían
 * (el recorrido diario de resena-google la reparte). Explica en una línea qué
 * es un proyecto —pedir un servicio, no ofrecerlo— y lleva al formulario.
 * Una sola vez por cuenta: antes de insertar se comprueba que no la tenga.
 */
const TITULO = { es: "¿Necesitas a alguien?", en: "Need someone?" };
const CUERPO = {
  es: "Publica lo que necesitas y los profesionales te contactan por WhatsApp. Es para pedir un servicio, no para ofrecerlo.",
  en: "Post what you need and professionals contact you on WhatsApp. It is for requesting a service, not offering one.",
};

export async function invitarAPublicarProyecto(admin: Admin, profileIds: string[], idioma: "es" | "en" = "es") {
  const destinatarios = [...new Set(profileIds.filter(Boolean))];
  if (destinatarios.length === 0) return { enviadas: 0, yaTenian: 0 };
  try {
    const yaTienen = new Set<string>();
    for (let i = 0; i < destinatarios.length; i += 300) {
      const { data } = await admin.from("notifications").select("user_id").eq("type", "invita_proyecto").in("user_id", destinatarios.slice(i, i + 300));
      (data ?? []).forEach((f) => yaTienen.add(String((f as { user_id: string }).user_id)));
    }
    const nuevos = destinatarios.filter((id) => !yaTienen.has(id));
    let enviadas = 0;
    for (let i = 0; i < nuevos.length; i += 200) {
      const tanda = nuevos.slice(i, i + 200).map((userId) => ({
        user_id: userId,
        type: "invita_proyecto",
        title: TITULO[idioma],
        message: CUERPO[idioma],
        data: { link: "/publicar-proyecto" },
        read: false,
      }));
      const { error } = await admin.from("notifications").insert(tanda);
      // Un rechazo de la base no puede pasar callado: el 4-oct el tipo no
      // existía en la regla de la base y no llegó ninguno, sin una sola señal.
      if (error) console.error("[invita_proyecto] insert", error.code, error.message);
      else enviadas += tanda.length;
    }
    return { enviadas, yaTenian: yaTienen.size };
  } catch {
    // Un aviso nunca puede tumbar el registro ni nada de lo que lo llame.
    return { enviadas: 0, yaTenian: 0 };
  }
}

/** Las cuentas que todavía no la recibieron (para repartirla una vez a todas). */
export async function invitarAPublicarATodas(admin: Admin, { simular = false } = {}) {
  const ids: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await admin.from("profiles").select("id").range(desde, desde + 999);
    const filas = (data ?? []) as { id: string }[];
    ids.push(...filas.map((f) => f.id));
    if (filas.length < 1000) break;
  }
  if (simular) return { cuentas: ids.length, enviadas: 0 };
  const r = await invitarAPublicarProyecto(admin, ids);
  return { cuentas: ids.length, ...r };
}

/**
 * «COMPLETA TU PERFIL» al profesional recién registrado (5-oct-2026): lleva a
 * los pasos que faltan (foto, descripción, servicios…). Una sola vez.
 */
export async function avisarCompletarPerfil(admin: Admin, profileId: string, idioma: "es" | "en" = "es") {
  try {
    const { data } = await admin.from("notifications").select("id").eq("type", "completa_perfil").eq("user_id", profileId).limit(1);
    if ((data ?? []).length > 0) return;
    const { error } = await admin.from("notifications").insert({
      user_id: profileId,
      type: "completa_perfil",
      title: idioma === "en" ? "Complete your profile" : "Completa tu perfil",
      message: idioma === "en"
        ? "Profiles with a photo, description and prices get more clients. It takes a few minutes."
        : "Los perfiles con foto, descripción y precios reciben más clientes. Te toma unos minutos.",
      data: { link: "/dashboard/profesional?mode=offer&tab=completion" },
      read: false,
    });
    if (error) console.error("[completa_perfil] insert", error.code, error.message);
  } catch {
    // Nunca tumba el registro.
  }
}
