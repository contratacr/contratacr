import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";

/**
 * Correos de temporada a los clientes registrados ("antes de las lluvias: canoas,
 * techos, electricidad"). Reactiva a quien ya se registró; es el canal más
 * barato que hay. Solo admin; el envío masivo exige confirmación explícita.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const MAX_BODY = 4000;

/**
 * CUÁNTOS SALEN POR DÍA.
 *
 * El plan de Brevo son 300 correos diarios, y esos MISMOS 300 los usan las
 * respuestas de soporte, la recuperación de contraseña y los avisos de
 * verificación. Una campaña que se lleve los 300 deja al app sin correo
 * transaccional el resto del día, que es mucho peor que tardar dos días en
 * mandarla. Con 200 queda un colchón de 100 para lo que sí es urgente.
 */
const POR_TANDA = 200;

/** Entre una tanda y la siguiente: el tope del proveedor es por día natural. */
const HORAS_ENTRE_TANDAS = 24;

/**
 * Quien manda la campaña también la recibe como la recibe la gente. La prueba
 * `[PRUEBA]` llega al correo con el que se entra al admin; este es el personal
 * de Isaac, para verla en el teléfono como cualquier otro destinatario.
 */
const DESTINATARIO_EXTRA = "isaacsanchezmonge@gmail.com";

async function listClients() {
  const db = createAdminClient();
  // TODAS las cuentas, no solo las de rol «cliente»: un profesional también
  // contrata —necesita un electricista, una niñera, un contador— y dejarlo
  // fuera era perder a la mitad de la gente registrada justo en el correo que
  // sirve para que vuelvan.
  const { data } = await db
    .from("profiles")
    .select("id, email, full_name")
    .eq("is_disabled", false)
    .not("email", "is", null)
    .limit(5000);
  const cuentas = (data ?? []).filter((p) => typeof p.email === "string" && p.email.includes("@") && !p.email.endsWith("@contratacr.test"));
  if (!cuentas.some((p) => p.email?.toLowerCase() === DESTINATARIO_EXTRA)) {
    cuentas.unshift({ id: "extra", email: DESTINATARIO_EXTRA, full_name: null } as (typeof cuentas)[number]);
  }
  return cuentas;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function bodyToHtml(body: string, ctaLabel: string, ctaHref: string) {
  const parrafos = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const cta = ctaLabel && ctaHref
    ? `<p style="margin:22px 0 8px"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#009FD9;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:15px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  // La firma: un correo sin nombre detrás se lee como un envío masivo, que es
  // justo lo que hace que lo borren sin abrirlo.
  const firma = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;border-top:1px solid #eef1f5;width:100%">
      <tr><td style="padding-top:18px;font-family:Arial,Helvetica,sans-serif">
        <p style="margin:0;font-size:14px;font-weight:bold;color:#162543">Equipo ContrataCR</p>
        <p style="margin:2px 0 0;font-size:13px;color:#68778d">El mercado de servicios hecho para Costa Rica</p>
        <p style="margin:8px 0 0;font-size:13px;color:#68778d">
          <a href="${escapeHtml(APP_URL)}" style="color:#009FD9;text-decoration:none">contratacr.com</a>
          &nbsp;·&nbsp;
          <a href="mailto:soporte@contratacr.com" style="color:#009FD9;text-decoration:none">soporte@contratacr.com</a>
        </p>
      </td></tr>
    </table>`;
  const pie = `<p style="margin:18px 0 0;font-size:12px;line-height:1.5;color:#68778d">Recibes este correo porque tienes una cuenta en ContrataCR. Si no quieres recibir avisos de temporada, responde a este correo con la palabra BAJA.</p>`;
  return parrafos + cta + firma + pie;
}

function campanaDesdeAsunto(asunto: string) {
  return asunto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campana";
}

/** A quién ya le salió esta campaña, y cuándo fue la última vez. */
async function estadoDeCampana(campana: string) {
  const db = createAdminClient();
  const { data, error } = await db
    .from("admin_campaign_sends")
    .select("email, enviado_en")
    .eq("campana", campana)
    .order("enviado_en", { ascending: false })
    .limit(5000);
  // Sin la tabla (migración 211 todavía sin correr) la campaña sigue saliendo,
  // solo que sin memoria: es mejor que bloquear el envío.
  if (error) return { correos: new Set<string>(), enviados: 0, ultimoEnvio: null as string | null };
  const filas = data ?? [];
  return {
    correos: new Set(filas.map((f) => String(f.email).toLowerCase())),
    enviados: filas.length,
    ultimoEnvio: filas[0]?.enviado_en ?? null,
  };
}

function horasQueFaltan(ultimoEnvio: string | null) {
  if (!ultimoEnvio) return 0;
  const pasadas = (Date.now() - new Date(ultimoEnvio).getTime()) / 3_600_000;
  return Math.max(0, Math.ceil(HORAS_ENTRE_TANDAS - pasadas));
}

export async function GET(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const clients = await listClients();
  // Cuánto queda de ESTA campaña: el panel necesita decir «quedan N» y cuándo
  // se puede mandar la próxima tanda, no solo cuántas cuentas hay.
  const campana = campanaDesdeAsunto(new URL(request.url).searchParams.get("asunto") ?? "");
  const { enviados, ultimoEnvio } = await estadoDeCampana(campana);
  return NextResponse.json({
    clients: clients.length,
    adminEmail: admin.email,
    porTanda: POR_TANDA,
    campana,
    enviados,
    restantes: Math.max(0, clients.length - enviados),
    horasParaLaProxima: horasQueFaltan(ultimoEnvio),
  });
}

export async function POST(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const payload = await request.json().catch(() => ({})) as { subject?: string; body?: string; ctaLabel?: string; ctaPath?: string; mode?: "test" | "all"; confirm?: string };
  const subject = String(payload.subject ?? "").trim().slice(0, 120);
  const body = String(payload.body ?? "").trim().slice(0, MAX_BODY);
  if (!subject || !body) return NextResponse.json({ error: "Falta el asunto o el texto." }, { status: 400 });
  const ctaLabel = String(payload.ctaLabel ?? "").trim().slice(0, 60);
  const ctaPath = String(payload.ctaPath ?? "").trim();
  // El enlace viaja MARCADO: sin utm no hay forma de saber si el correo produjo
  // algo, y una campaña que no se puede medir se repite a ciegas. La marca es la
  // misma que ya entiende la atribución del app.
  const campana = subject.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "campana";
  const conMarca = (ruta: string) => {
    const separador = ruta.includes("?") ? "&" : "?";
    return `${APP_URL}${ruta}${separador}utm_source=correo&utm_medium=campana&utm_campaign=${encodeURIComponent(campana)}`;
  };
  const ctaHref = ctaPath && ctaPath.startsWith("/") ? conMarca(ctaPath) : "";
  const html = brandedEmailDocument({ title: subject, bodyHtml: bodyToHtml(body, ctaLabel, ctaHref), origin: APP_URL });
  const replyTo = { email: "soporte@contratacr.com", name: "ContrataCR" };

  if (payload.mode !== "all") {
    const result = await sendBrevoEmail({ to: admin.email, subject: `[PRUEBA] ${subject}`, html, replyTo });
    return NextResponse.json({ mode: "test", to: admin.email, ...result });
  }

  // Envío real: exige escribir ENVIAR para evitar un clic accidental.
  if (payload.confirm !== "ENVIAR") return NextResponse.json({ error: "Confirmación requerida." }, { status: 400 });
  const clients = await listClients();
  const db = createAdminClient();
  const { correos: yaEnviados, ultimoEnvio } = await estadoDeCampana(campana);

  // EL CANDADO. El tope del proveedor es por día: mandar la segunda tanda antes
  // de que pase el día la corta a la mitad igual que la primera.
  const faltan = horasQueFaltan(ultimoEnvio);
  if (faltan > 0) {
    return NextResponse.json({
      error: `La tanda anterior salió hace menos de ${HORAS_ENTRE_TANDAS} horas. Faltan ${faltan} h para la siguiente.`,
      horasParaLaProxima: faltan,
    }, { status: 429 });
  }

  const pendientes = clients.filter((client) => !yaEnviados.has(String(client.email).toLowerCase()));
  const tanda = pendientes.slice(0, POR_TANDA);
  if (tanda.length === 0) {
    return NextResponse.json({ mode: "all", total: clients.length, sent: 0, failed: 0, skipped: 0, restantes: 0, completa: true });
  }

  let sent = 0, failed = 0, skipped = 0;
  for (const client of tanda) {
    const result = await sendBrevoEmail({ to: client.email, subject, html, replyTo });
    if (result.ok) {
      sent += 1;
      // Se anota SOLO lo que salió: lo que falló vuelve a intentarse mañana.
      await db.from("admin_campaign_sends").insert({ campana, email: String(client.email).toLowerCase() });
    } else if (result.status === "skipped") skipped += 1; else failed += 1;
    // Un respiro entre envíos para no golpear el límite de Brevo.
    await new Promise((r) => setTimeout(r, 120));
  }
  const restantes = Math.max(0, pendientes.length - sent);
  console.info(`[campanas] "${subject}" → enviados ${sent}, fallidos ${failed}, omitidos ${skipped}; quedan ${restantes} de ${clients.length}`);
  return NextResponse.json({ mode: "all", total: clients.length, sent, failed, skipped, restantes, completa: restantes === 0 });
}
