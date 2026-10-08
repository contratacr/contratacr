import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { enlaceDeBaja, normalizarCorreo } from "@/lib/email/baja";
import { escaparHtml as escapeHtml } from "@/lib/email/escape";

/**
 * LOS AVISOS DE PROYECTOS Y EMPLEOS TAMBIÉN LLEGAN POR CORREO (7-oct-2026).
 *
 * Medido ese día: de 313 profesionales activos, UNO tenía notificaciones push.
 * Un proyecto nuevo solo lo veía quien abría el app y miraba la campana: casi
 * nadie. El correo es lo que sí les llega.
 *
 * - Uno por aviso y en el momento: un proyecto es alguien esperando respuesta.
 *   El volumen de entonces (81 avisos en 45 días, 36 el peor día) cabe de sobra
 *   en los 300 diarios de Brevo. Si algún día pasa de ~200 al día, el camino es
 *   un resumen diario por persona.
 * - Nivel `normal`: se corta cuando quedan 40 libres en el día, así que nunca le
 *   quita el cupo a crear cuenta o recuperar la contraseña.
 * - Con salida: enlace y cabecera de baja (Gmail los exige). Quien se dio de baja
 *   de los correos de ContrataCR no recibe estos tampoco.
 * - Nunca a direcciones que no existen: test copia producción con correos
 *   `@mirror.contratacr.test`, y un rebote masivo daña al remitente.
 */

const NO_ENTREGABLE = /\.(test|invalid|example|localhost|local)$/i;
const SIMULTANEOS = 5;
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");

export type AvisoPorCorreo = {
  /** Cuentas (profiles.id) a las que se les avisa. */
  destinatarios: string[];
  asunto: string;
  /** Primera línea del correo, en negrita. */
  titular: string;
  /** Párrafos en texto plano. */
  parrafos: string[];
  boton: { texto: string; ruta: string };
  /** «Te llega porque ofreces Electricidad en ContrataCR.» */
  porQue: string;
  /** Etiqueta para Brevo (aperturas y clics por tipo de aviso). */
  campana: "aviso-proyecto" | "aviso-empleo";
};

function primerNombre(nombre: string | null | undefined) {
  const n = String(nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{1,30}$/u.test(n) ? n : "";
}

export function cuerpoDeAviso(aviso: AvisoPorCorreo, nombre: string, baja: string) {
  const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${html}</p>`;
  const saludo = nombre ? p(`Hola ${escapeHtml(nombre)},`) : "";
  return `${saludo}
    ${p(`<strong>${escapeHtml(aviso.titular)}</strong>`)}
    ${aviso.parrafos.filter(Boolean).map((t) => p(escapeHtml(t).replace(/\n/g, "<br>"))).join("")}
    <p style="margin:22px 0 8px"><a href="${escapeHtml(APP_URL + aviso.boton.ruta)}" style="display:inline-block;background:#009FD9;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:15px">${escapeHtml(aviso.boton.texto)}</a></p>
    <p style="margin:26px 0 0;border-top:1px solid #eef1f5;padding-top:14px;font-size:12px;line-height:1.6;color:#8b97a6">
      ${escapeHtml(aviso.porQue)} <a href="${escapeHtml(baja)}" style="color:#8b97a6">Dejar de recibir estos correos</a>.
    </p>`;
}

/** Manda el aviso por correo. Devuelve cuántos salieron. Nunca lanza. */
export async function avisarPorCorreo(aviso: AvisoPorCorreo): Promise<number> {
  try {
    const ids = [...new Set(aviso.destinatarios)].filter(Boolean);
    if (!ids.length) return 0;
    const db = createAdminClient();
    const { data: perfiles } = await db.from("profiles").select("id, email, full_name, is_disabled").in("id", ids);
    // Un profesional bloqueado por el admin no recibe trabajo por correo.
    const { data: bloqueados } = await db.from("professionals").select("profile_id").in("profile_id", ids).eq("is_banned", true);
    const sinTrabajo = new Set((bloqueados ?? []).map((b) => b.profile_id));
    const candidatos = (perfiles ?? [])
      .filter((p) => !sinTrabajo.has(p.id) && !p.is_disabled && p.email && p.email.includes("@") && !NO_ENTREGABLE.test(p.email.trim()))
      .map((p) => ({ correo: normalizarCorreo(p.email!), nombre: primerNombre(p.full_name) }));
    if (!candidatos.length) return 0;

    const { data: bajas } = await db.from("email_bajas").select("correo").in("correo", candidatos.map((c) => c.correo));
    const fuera = new Set((bajas ?? []).map((b) => normalizarCorreo(b.correo)));
    const lista = candidatos.filter((c) => !fuera.has(c.correo));

    let enviados = 0;
    for (let i = 0; i < lista.length; i += SIMULTANEOS) {
      const tanda = lista.slice(i, i + SIMULTANEOS);
      const resultados = await Promise.all(tanda.map(({ correo, nombre }) => {
        const baja = enlaceDeBaja(APP_URL, correo);
        return sendBrevoEmail({
          to: correo,
          subject: aviso.asunto,
          html: brandedEmailDocument({ title: aviso.asunto, bodyHtml: cuerpoDeAviso(aviso, nombre, baja), origin: APP_URL }),
          nivel: "normal",
          conBaja: true,
          campana: aviso.campana,
        });
      }));
      enviados += resultados.filter((r) => r.ok).length;
      // Sin cupo para este nivel: el resto del día tampoco va a salir.
      if (resultados.some((r) => r.status === "skipped" && /cupo/i.test(r.detail ?? ""))) break;
    }
    return enviados;
  } catch (err) {
    console.error("[aviso-por-correo]", err);
    return 0;
  }
}
