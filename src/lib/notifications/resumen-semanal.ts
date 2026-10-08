import type { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { enlaceDeBaja, firmaDeBaja, firmaValida, normalizarCorreo } from "@/lib/email/baja";
import { escaparHtml } from "@/lib/email/escape";
import { enlacePerfil } from "@/lib/profile-url";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL RESUMEN DEL LUNES AL PROFESIONAL (8-oct-2026).
 *
 * «Esta semana te escribieron 4 personas desde ContrataCR. ¿Con cuántas cerraste
 * trabajo?». Es la única forma de saber si un contacto terminó en trabajo: la
 * conversación es por WhatsApp, el cliente casi nunca tiene cuenta, y la tarjeta
 * «¿Llegaste a contratarlo?» solo la ve quien vuelve a entrar. Al profesional sí
 * se le puede preguntar, y le interesa contestar.
 *
 * - Solo a quien recibió al menos un contacto en la semana (lunes a domingo, hora
 *   de Costa Rica). Contactos = seguimientos de WhatsApp o llamada; los de
 *   empleos no cuentan (son postulaciones).
 * - Una vez por semana: la fila de `trabajos_reportados` hace de candado.
 * - Los botones abren una página que PIDE CONFIRMAR: los antivirus del correo
 *   abren los enlaces solos y anotarían una respuesta que nadie dio.
 * - Trae, si le falta, el consejo de pedir reseñas y de poner un precio.
 */

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

function tienePrecio(servicios: unknown) {
  return Array.isArray(servicios) && servicios.some((s) =>
    s && typeof s === "object" && (s as { active?: unknown }).active !== false
    && typeof (s as { priceAmount?: unknown }).priceAmount === "number" && ((s as { priceAmount: number }).priceAmount > 0)
    && (s as { priceType?: unknown }).priceType !== "a_convenir");
}

function cuerpoDelResumen({ nombre, contactos, semana, profesional, slug, sinResenas, sinPrecio, baja }: {
  nombre: string; contactos: number; semana: string; profesional: string; slug: string; sinResenas: boolean; sinPrecio: boolean; baja: string;
}) {
  const p = (html: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${html}</p>`;
  const domingo = new Date(new Date(`${semana}T12:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const personas = contactos === 1 ? "1 persona te escribió" : `${contactos} personas te escribieron`;
  const botones = RESPUESTAS.map((n) => `<a href="${escaparHtml(enlaceDeReporte(profesional, semana, n))}" style="display:inline-block;min-width:44px;margin:0 4px 8px 0;padding:10px 13px;border:1px solid #009FD9;border-radius:999px;color:#0089bb;text-decoration:none;font-weight:700;font-size:15px;text-align:center">${n === 3 ? "3 o más" : n}</a>`).join("");
  const consejos: string[] = [];
  if (sinResenas) {
    const mensaje = `Hola, ¿cómo estás? Ahora estoy en ContrataCR y me ayudaría mucho que me dejaras una reseña del trabajo que te hice. Es rápido, entras a este enlace y listo: ${enlacePerfil(slug)}?tab=resenas ¡Muchas gracias!`;
    consejos.push(`Aún no tienes reseñas, y los perfiles con al menos una reciben muchos más mensajes. <a href="https://wa.me/?text=${encodeURIComponent(mensaje)}" style="color:#009FD9;font-weight:700">Pídele una a un cliente por WhatsApp</a>.`);
  }
  if (sinPrecio) {
    consejos.push(`Tus servicios no muestran un precio de referencia. Un «desde ₡» ayuda a que el cliente se anime a escribir. <a href="${APP_URL}/dashboard/profesional" style="color:#009FD9;font-weight:700">Agregar precio</a>.`);
  }
  return `${nombre ? p(`Hola ${escaparHtml(nombre)},`) : ""}
    ${p(`Entre el ${fechaCorta(semana)} y el ${fechaCorta(domingo)}, <strong>${personas}</strong> desde tu perfil en ContrataCR.`)}
    ${p("<strong>¿Con cuántas cerraste trabajo?</strong> Toca un número:")}
    <div style="margin:4px 0 14px">${botones}</div>
    ${p('<span style="color:#68778d;font-size:13px">Con tu respuesta sabemos qué está funcionando para traerte más clientes. Nadie más la ve.</span>')}
    ${consejos.length ? `<div style="margin:18px 0 0;padding:14px 16px;border-radius:14px;background:#f4f7fa">${consejos.map((c) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:#162543">${c}</p>`).join("")}</div>` : ""}
    <p style="margin:24px 0 0;border-top:1px solid #eef1f5;padding-top:14px;font-size:12px;line-height:1.6;color:#8b97a6">
      Te llega porque tienes un perfil en ContrataCR. <a href="${escaparHtml(baja)}" style="color:#8b97a6">Dejar de recibir estos correos</a>.
    </p>`;
}

export async function enviarResumenSemanal(admin: Admin, { simular = false, ahora = new Date() } = {}) {
  const { semana, desde, hasta } = semanaAnterior(ahora);
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
    const asunto = contactos === 1 ? "Esta semana 1 persona te escribió por ContrataCR" : `Esta semana te escribieron ${contactos} personas por ContrataCR`;
    const html = brandedEmailDocument({
      title: asunto,
      origin: APP_URL,
      bodyHtml: cuerpoDelResumen({
        nombre: primerNombre(perfil?.full_name), contactos, semana, profesional: pro.id, slug: pro.slug,
        sinResenas: Number(pro.review_count ?? 0) <= 0, sinPrecio: !tienePrecio(pro.services), baja: enlaceDeBaja(APP_URL, correo),
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
