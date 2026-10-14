import { NextResponse } from "next/server";
import { CAMPAIGN_BATCH_SIZE, REVIEW_CAMPAIGN, eligibleCampaignRecipients, isRetiredCampaign, type CampaignHistory } from "@/lib/email/campaign-policy";
import { deliverCampaignOnce } from "@/lib/email/campaign-delivery";
import { enlaceDeBaja } from "@/lib/email/baja";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { LIFECYCLE_CAMPAIGNS } from "@/lib/email/lifecycle-policy";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const MAX_BODY = 4000;
const POR_TANDA = CAMPAIGN_BATCH_SIZE;

type Admin = ReturnType<typeof createAdminClient>;
async function readAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) return rows;
  }
}

async function campaignState(db: Admin) {
  const [professionals, history, bajas] = await Promise.all([
    readAll((from, to) => db.from("professionals")
      .select("profile_id,slug,review_count,created_at,profiles!inner(email,full_name,is_disabled)")
      .eq("review_count", 0).eq("is_banned", false).eq("oculto_del_buscador", false)
      .eq("profiles.is_disabled", false).neq("profiles.role", "admin").not("slug", "is", null).order("profile_id").range(from, to)),
    readAll((from, to) => db.from("admin_campaign_sends")
      .select("email, campana, status, enviado_en, abierto_en, click_en, rebote_en")
      .order("id").range(from, to)),
    readAll((from, to) => db.from("email_bajas").select("correo").order("correo").range(from, to)),
  ]);
  const now = Date.now();
  const clients = professionals.flatMap((pro) => {
    const profile = pro.profiles as unknown as { email: string | null; full_name: string | null };
    return profile?.email && pro.created_at && now - Date.parse(pro.created_at) >= 7 * 86_400_000
      ? [{ email: profile.email, full_name: profile.full_name }] : [];
  });
  const typedHistory = history as CampaignHistory[];
  const own = typedHistory.filter((r) => REVIEW_CAMPAIGN.historyKeys.includes(r.campana));
  const sent = own.filter((r) => r.status === "sent");
  const latest = own.map((r) => r.enviado_en).sort().at(-1) ?? null;
  return {
    clients, pendientes: eligibleCampaignRecipients(clients, typedHistory, bajas.map((r) => r.correo), now, REVIEW_CAMPAIGN.historyKeys),
    enviados: new Set(sent.map((r) => r.email)).size,
    sinConfirmar: own.filter((r) => r.status !== "sent").length,
    ultimoEnvio: latest,
    abiertos: sent.filter((r) => r.abierto_en).length,
    clics: sent.filter((r) => r.click_en).length,
    rebotes: sent.filter((r) => r.rebote_en).length,
  };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function primerNombre(nombre: string | null | undefined) {
  const limpio = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  // Un nombre de una letra o un correo metido en el campo no sirven de saludo.
  return /^[\p{L}][\p{L}'\-]{1,}$/u.test(limpio) ? limpio : "";
}

function bodyToHtml(body: string, ctaLabel: string, ctaHref: string, bajaHref: string, nombre: string) {
  // POR NOMBRE. El envío ya traía `full_name` de cada persona y no lo usaba:
  // todas las campañas salían sin saludo. Un correo que no te llama por tu
  // nombre se lee como publicidad masiva, que es justo lo que los buzones
  // clasifican aparte. Si no hay nombre usable, no se saluda a medias.
  const saludo = nombre ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">Hola ${escapeHtml(nombre)},</p>` : "";
  const parrafos = saludo + body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const cta = ctaLabel && ctaHref
    ? `<p style="margin:22px 0 8px"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#009FD9;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:15px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  // La firma: un correo sin nombre detrás se lee como un envío masivo, que es
  // justo lo que hace que lo borren sin abrirlo.
  const firma = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid #eef1f5;width:100%">
      <tr><td style="padding-top:18px;font-family:Arial,Helvetica,sans-serif">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#162543">Equipo ContrataCR</p>
        <p style="margin:2px 0 0;font-size:13px;color:#68778d">La plataforma de servicios hecha para Costa Rica</p>
        <p style="margin:8px 0 0;font-size:13px;color:#68778d">
          <a href="${escapeHtml(APP_URL)}" style="color:#009FD9;text-decoration:none">contratacr.com</a>
          &nbsp;·&nbsp;
          <a href="${escapeHtml(APP_URL)}/soporte" style="color:#009FD9;text-decoration:none">Soporte en ContrataCR</a>
        </p>
      </td></tr>
    </table>`;
  // Un enlace, no una instrucción. «Responde con la palabra BAJA» le sirve a
  // una persona pero no a Gmail, y era parte de por qué estos correos caían en
  // No deseado. Este enlace es el mismo que viaja en la cabecera.
  //
  // El texto del enlace es la frase que la persona diría, no «date de baja»:
  // nadie recuerda haberse suscrito a nada, se hizo una cuenta.
  // Invitar a responder no es cortesía: cuando alguien contesta, su buzón
  // aprende que este remitente es legítimo. Una respuesta limpia más
  // reputación que cien entregas.
  const responder = `<p style="margin:14px 0 0;font-size:14px;line-height:1.6;color:#52627a">¿Necesitas ayuda? <a href="${escapeHtml(APP_URL)}/soporte" style="color:#009FD9">Abre un caso en Soporte</a>.</p>`;
  const pie = `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#68778d">Recibes este correo porque tienes una cuenta en ContrataCR. <a href="${escapeHtml(bajaHref)}" style="color:#68778d;text-decoration:underline">No quiero recibir novedades</a>.</p>`;
  return parrafos + cta + responder + firma + pie;
}

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const params = new URL(request.url).searchParams;
  if (isRetiredCampaign(params.get("campaignId") ?? undefined, params.get("audiencia") ?? undefined)) {
    return NextResponse.json({ error: "Esta campaña de correo se retiró; el recordatorio se gestiona dentro de la app." }, { status: 410 });
  }
  try {
    const state = await campaignState(createAdminClient());
    return NextResponse.json({
      clients: state.clients.length, adminEmail: admin.email, porTanda: POR_TANDA,
      campana: REVIEW_CAMPAIGN.key, enviados: state.enviados, sinConfirmar: state.sinConfirmar,
      abiertos: state.abiertos, clics: state.clics, rebotes: state.rebotes,
      midiendo: Boolean(process.env.BREVO_WEBHOOK_SECRET), restantes: state.pendientes.length,
      horasParaLaProxima: 0,
      automation: LIFECYCLE_CAMPAIGNS.map(({key,subject,days,audience,enabled}) => ({key,subject,days,audience,enabled})),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar el historial o las bajas. El envío permanece bloqueado." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as {
    subject?: string; body?: string; ctaLabel?: string; ctaPath?: string;
    mode?: "test" | "all"; confirm?: string; audiencia?: string; campaignId?: string;
  };
  if (isRetiredCampaign(payload.campaignId, payload.audiencia)) {
    return NextResponse.json({ error: "Esta campaña de correo se retiró; el recordatorio se gestiona dentro de la app." }, { status: 410 });
  }
  const subject = String(payload.subject ?? "").trim().slice(0, 120);
  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  if (!subject || !body) return NextResponse.json({ error: "Falta el asunto o el texto." }, { status: 400 });
  const ctaLabel = String(payload.ctaLabel ?? "").trim().slice(0, 60);
  const ctaPath = String(payload.ctaPath ?? "").trim();
  if (ctaPath && (!ctaPath.startsWith("/") || ctaPath.startsWith("//") || ctaPath.includes("\\"))) {
    return NextResponse.json({ error: "El enlace debe ser una ruta interna." }, { status: 400 });
  }
  const campana = REVIEW_CAMPAIGN.key;
  let cta: URL | null = null;
  try {
    cta = ctaPath ? new URL(ctaPath, APP_URL) : null;
    if (cta && cta.origin !== new URL(APP_URL).origin) throw new Error("External campaign destination");
  } catch {
    return NextResponse.json({ error: "El enlace debe ser una ruta interna válida." }, { status: 400 });
  }
  if (cta) {
    cta.searchParams.set("utm_source", "correo");
    cta.searchParams.set("utm_medium", "campana");
    cta.searchParams.set("utm_campaign", campana);
  }
  const htmlPara = (correo: string, nombre?: string | null) => brandedEmailDocument({
    title: subject, bodyHtml: bodyToHtml(body, ctaLabel, cta?.toString() ?? "", enlaceDeBaja(APP_URL, correo), primerNombre(nombre)), origin: APP_URL,
  });
  const replyTo = { email: "soporte@contratacr.com", name: "ContrataCR" };
  if (payload.mode !== "all") {
    const result = await sendBrevoEmail({ to: admin.email, subject: `[PRUEBA] ${subject}`, html: htmlPara(admin.email, "Isaac"), replyTo, nivel: "masivo" });
    return NextResponse.json({ mode: "test", to: admin.email, ...result });
  }
  if (payload.confirm !== "ENVIAR") return NextResponse.json({ error: "Confirmación requerida." }, { status: 400 });
  try {
    const db = createAdminClient();
    const state = await campaignState(db);
    let sent = 0, failed = 0, skipped = 0;
    for (const client of state.pendientes.slice(0, POR_TANDA)) {
      const result = await deliverCampaignOnce(db, campana, client.email, async () => {
        // Una reseña, baja o inhabilitación puede ocurrir después del recuento inicial.
        const [{ data: current, error: currentError }, { data: baja, error: bajaError }, { data: rebotes, error: reboteError }] = await Promise.all([
          db.from("professionals").select("id,created_at,profiles!inner(email)")
          .eq("review_count", 0).eq("is_banned", false).eq("oculto_del_buscador", false)
          .eq("profiles.is_disabled", false).neq("profiles.role", "admin").eq("profiles.email", client.email)
          .not("slug", "is", null).limit(1),
          db.from("email_bajas").select("correo").ilike("correo", client.email).limit(1),
          db.from("admin_campaign_sends").select("rebote_en").ilike("email", client.email).not("rebote_en", "is", null).limit(1),
        ]);
        if (currentError || bajaError || reboteError) throw currentError ?? bajaError ?? reboteError;
        if (baja?.length || rebotes?.length || !current?.some((pro) => pro.created_at && Date.now() - Date.parse(pro.created_at) >= 7 * 86_400_000)) {
          return { ok: false, status: "skipped" as const, detail: "La cuenta ya no es elegible." };
        }
        return sendBrevoEmail({
          to: client.email, subject, html: htmlPara(client.email, client.full_name), replyTo, nivel: "masivo", campana,
        });
      }, { coordinated: true });
      if (result === "sent") sent += 1;
      else if (result === "uncertain") failed += 1;
      else skipped += 1;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    const updated = await campaignState(db);
    return NextResponse.json({ mode: "all", total: state.clients.length, sent, failed, skipped,
      restantes: updated.pendientes.length, sinConfirmar: updated.sinConfirmar, completa: updated.pendientes.length === 0 });
  } catch {
    return NextResponse.json({ error: "No se pudo completar la tanda. Actualiza el estado: los envíos reservados quedan bloqueados para evitar repetirlos." }, { status: 503 });
  }
}
