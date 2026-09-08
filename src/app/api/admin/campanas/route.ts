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

async function listClients() {
  const db = createAdminClient();
  const { data } = await db
    .from("profiles")
    .select("id, email, full_name")
    .eq("role", "client")
    .eq("is_disabled", false)
    .not("email", "is", null)
    .limit(5000);
  return (data ?? []).filter((p) => typeof p.email === "string" && p.email.includes("@") && !p.email.endsWith("@contratacr.test"));
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function bodyToHtml(body: string, ctaLabel: string, ctaHref: string) {
  const parrafos = body.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#162543">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  const cta = ctaLabel && ctaHref
    ? `<p style="margin:22px 0 8px"><a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#009FD9;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px;font-size:15px">${escapeHtml(ctaLabel)}</a></p>`
    : "";
  const pie = `<p style="margin:26px 0 0;font-size:12px;line-height:1.5;color:#68778d">Recibes este correo porque tienes una cuenta en ContrataCR. Si no quieres recibir avisos de temporada, responde a este correo con la palabra BAJA.</p>`;
  return parrafos + cta + pie;
}

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const clients = await listClients();
  return NextResponse.json({ clients: clients.length, adminEmail: admin.email });
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
  const ctaHref = ctaPath && ctaPath.startsWith("/") ? `${APP_URL}${ctaPath}` : "";
  const html = brandedEmailDocument({ title: subject, bodyHtml: bodyToHtml(body, ctaLabel, ctaHref), origin: APP_URL });
  const replyTo = { email: "soporte@contratacr.com", name: "ContrataCR" };

  if (payload.mode !== "all") {
    const result = await sendBrevoEmail({ to: admin.email, subject: `[PRUEBA] ${subject}`, html, replyTo });
    return NextResponse.json({ mode: "test", to: admin.email, ...result });
  }

  // Envío real: exige escribir ENVIAR para evitar un clic accidental.
  if (payload.confirm !== "ENVIAR") return NextResponse.json({ error: "Confirmación requerida." }, { status: 400 });
  const clients = await listClients();
  let sent = 0, failed = 0, skipped = 0;
  for (const client of clients) {
    const result = await sendBrevoEmail({ to: client.email, subject, html, replyTo });
    if (result.ok) sent += 1; else if (result.status === "skipped") skipped += 1; else failed += 1;
    // Un respiro entre envíos para no golpear el límite de Brevo.
    await new Promise((r) => setTimeout(r, 120));
  }
  console.info(`[campanas] "${subject}" → enviados ${sent}, fallidos ${failed}, omitidos ${skipped} de ${clients.length}`);
  return NextResponse.json({ mode: "all", total: clients.length, sent, failed, skipped });
}
