import type { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { enlaceDeBaja, firmaDeBaja, firmaValida, normalizarCorreo } from "@/lib/email/baja";
import { escaparHtml } from "@/lib/email/escape";

type Admin = ReturnType<typeof createAdminClient>;

/** Weekly activity survey. Paused after the 13 October copy/delivery audit.
 * Follow-up records are contact attempts, not messages or unique people.
 * Do not re-enable before integrating coordinated campaign delivery and checking
 * opt-outs, provider failures and measurement semantics. Existing replies remain valid.
 */
export const WEEKLY_SUMMARY_ENABLED = false;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
const NO_ENTREGABLE = /\.(test|invalid|example|localhost|local)$/i;
export const RESPUESTAS = [0, 1, 2, 3] as const;

/** Lunes (YYYY-MM-DD, Costa Rica) de la semana ANTERIOR a `ahora`. */
export function semanaAnterior(ahora = new Date()) {
  const cr = new Date(ahora.getTime() - 6 * 3_600_000);
  const dia = (cr.getUTCDay() + 6) % 7; // 0 = lunes
  const lunesEsta = Date.UTC(cr.getUTCFullYear(), cr.getUTCMonth(), cr.getUTCDate() - dia);
  const lunes = new Date(lunesEsta - 7 * 86_400_000);
  const desde = new Date(lunes.getTime() + 6 * 3_600_000); // 00:00 CR en UTC
  const hasta = new Date(desde.getTime() + 7 * 86_400_000);
  return { semana: lunes.toISOString().slice(0, 10), desde, hasta };
}

function firmaDeReporte(profesional: string, semana: string) {
  return firmaDeBaja(`reporte:${profesional}:${semana}`);
}

export function reporteValido(profesional: string, semana: string, firma: string) {
  return firmaValida(`reporte:${profesional}:${semana}`, firma);
}

export function enlaceDeReporte(profesional: string, semana: string, cerrados: number) {
  const q = new URLSearchParams({ p: profesional, s: semana, n: String(cerrados), f: firmaDeReporte(profesional, semana) });
  return `${APP_URL}/api/trabajos/reportar?${q.toString()}`;
}

function fechaCorta(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CR", { day: "numeric", month: "long", timeZone: "UTC" });
}

function primerNombre(nombre: string | null | undefined) {
  const n = String(nombre ?? "").trim().split(/\s+/)[0] ?? "";
  return /^[\p{L}][\p{L}'-]{1,30}$/u.test(n) ? n : "";
}

export function cuerpoDelResumen({ nombre, contactos, semana, profesional, baja }: {
  nombre: string; contactos: number; semana: string; profesional: string; baja: string;
}) {
  const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${html}</p>`;
  const domingo = new Date(new Date(`${semana}T12:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const actividad = contactos === 1 ? "1 registro de intento de contacto" : `${contactos} registros de intentos de contacto`;
  const botones = RESPUESTAS.map((n) => `<a href="${escaparHtml(enlaceDeReporte(profesional, semana, n))}" style="display:inline-block;min-width:44px;margin:0 4px 8px 0;padding:10px 13px;border:1px solid #009FD9;border-radius:999px;color:#0089bb;text-decoration:none;font-weight:700;font-size:15px;text-align:center">${n === 3 ? "3 o más" : n}</a>`).join("");
  return `${nombre ? p(`Hola ${escaparHtml(nombre)},`) : ""}
    ${p(`Entre el ${fechaCorta(semana)} y el ${fechaCorta(domingo)}, ContrataCR guardó <strong>${actividad}</strong> con tus servicios.`)}
    ${p("Esto indica que se abrió una opción de contacto. No confirma que se enviara un mensaje ni que cada registro corresponda a una persona distinta.")}
    ${p("<strong>¿Cuántos trabajos conseguiste a través de ContrataCR durante esa semana?</strong> Puedes incluir contactos de semanas anteriores. Elige una opción y confírmala en la página siguiente:")}
    <div style="margin:4px 0 14px">${botones}</div>
    ${p("Tu respuesta es opcional. El equipo de ContrataCR la utiliza para evaluar el servicio; no se publica en tu perfil.")}
    <p style="margin:24px 0 0;border-top:1px solid #eef1f5;padding-top:14px;font-size:12px;line-height:1.6;color:#8b97a6">
      Te llega porque tienes un perfil en ContrataCR. <a href="${escaparHtml(baja)}" style="color:#8b97a6">Dejar de recibir estos correos</a>.
    </p>`;
}

export async function enviarResumenSemanal(admin: Admin, { simular = false, ahora = new Date() } = {}) {
  const { semana, desde, hasta } = semanaAnterior(ahora);
  if (!simular && !WEEKLY_SUMMARY_ENABLED) return { semana, profesionales: 0, candidatos: 0, enviados: 0, yaEnviados: 0, simular, paused: true };
  const { data: filas } = await admin
    .from("whatsapp_contact_followups")
    .select("professional_id, service_name")
    .gte("created_at", desde.toISOString())
    .lt("created_at", hasta.toISOString())
    .limit(10000);
  const ids = [...new Set((filas ?? []).map((f) => f.professional_id as string))];
  if (!ids.length) return { semana, profesionales: 0, enviados: 0, yaEnviados: 0, simular };

  // Lo que entró antes del arreglo desde un empleo no cuenta: era una postulación.
  const { data: empleos } = await admin.from("job_posts").select("employer_id, title").in("employer_id", ids);
  const deEmpleo = new Set((empleos ?? []).map((j) => `${j.employer_id}|${j.title}`));
  const porPro = new Map<string, number>();
  for (const f of filas ?? []) {
    if (deEmpleo.has(`${f.professional_id}|${f.service_name}`)) continue;
    porPro.set(f.professional_id as string, (porPro.get(f.professional_id as string) ?? 0) + 1);
  }

  const { data: pros } = await admin
    .from("professionals")
    .select("id, slug, profile_id, review_count, services, is_banned")
    .in("id", [...porPro.keys()]);
  const perfiles = new Map<string, { email: string | null; full_name: string | null; is_disabled: boolean | null }>();
  const profileIds = (pros ?? []).map((p) => p.profile_id).filter(Boolean) as string[];
  if (profileIds.length) {
    const { data } = await admin.from("profiles").select("id, email, full_name, is_disabled").in("id", profileIds);
    for (const p of data ?? []) perfiles.set(p.id, p);
  }
  const { data: bajas } = await admin.from("email_bajas").select("correo");
  const fuera = new Set((bajas ?? []).map((b) => normalizarCorreo(b.correo)));

  let enviados = 0;
  let yaEnviados = 0;
  let candidatos = 0;
  for (const pro of pros ?? []) {
    const perfil = pro.profile_id ? perfiles.get(pro.profile_id) : undefined;
    const correo = perfil?.email ? normalizarCorreo(perfil.email) : "";
    if (pro.is_banned || perfil?.is_disabled || !correo.includes("@") || NO_ENTREGABLE.test(correo) || fuera.has(correo) || !pro.slug) continue;
    candidatos += 1;
    if (simular) continue;
    const contactos = porPro.get(pro.id) ?? 0;
    // El candado: si ya hay fila de esta semana, el correo ya salió.
    const { data: nueva, error } = await admin
      .from("trabajos_reportados")
      .upsert({ professional_id: pro.id, semana, contactos }, { onConflict: "professional_id,semana", ignoreDuplicates: true })
      .select("id");
    if (error) { console.error("[resumen-semanal] candado:", error.message); continue; }
    if (!nueva?.length) { yaEnviados += 1; continue; }
    const asunto = "Tu actividad semanal en ContrataCR";
    const html = brandedEmailDocument({
      title: asunto,
      origin: APP_URL,
      bodyHtml: cuerpoDelResumen({
        nombre: primerNombre(perfil?.full_name), contactos, semana, profesional: pro.id, baja: enlaceDeBaja(APP_URL, correo),
      }),
    });
    const r = await sendBrevoEmail({ to: correo, subject: asunto, html, nivel: "normal", conBaja: true, campana: "resumen-semanal" });
    if (r.ok) enviados += 1;
    else if (r.status === "skipped" && /cupo/i.test(r.detail ?? "")) break;
  }
  return { semana, profesionales: porPro.size, candidatos, enviados, yaEnviados, simular };
}

export async function anotarReporte(admin: Admin, profesional: string, semana: string, cerrados: number) {
  const { data, error } = await admin
    .from("trabajos_reportados")
    .update({ cerrados, respondido_en: new Date().toISOString() })
    .eq("professional_id", profesional)
    .eq("semana", semana)
    .select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
