export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/email/send";

const SUPPORT_TO = "soporte@contratacr.com";

export async function POST(req: NextRequest) {
  try {
    const { professionalName, professionalSlug, reason, reporterEmail } = await req.json();

    if (!professionalSlug) {
      return NextResponse.json({ error: "Falta el perfil a reportar." }, { status: 400 });
    }

    // Impersonation reports are the real-world deterrent against an impostor who
    // entered a real cédula + matching name (the padrón cannot prove physical
    // identity) — flag them HIGH PRIORITY so support triages first (items 8/10).
    const isImpersonation = /suplantaci[oó]n de identidad/i.test(String(reason ?? ""));
    const storedReason = isImpersonation ? `[PRIORIDAD ALTA] ${reason}` : (reason ?? "Sin detalle");

    // Persist the report so the admin moderation queue can action it (best-effort;
    // resolve the professional_id from the slug). Never blocks the email path.
    try {
      const admin = createAdminClient();
      const { data: pro } = await admin.from("professionals").select("id").eq("slug", professionalSlug).maybeSingle();
      await admin.from("reports").insert({
        professional_id: pro?.id ?? null,
        professional_slug: professionalSlug,
        professional_name: professionalName ?? null,
        reason: storedReason,
        reporter_email: reporterEmail ?? null,
      });
    } catch (e) {
      console.error("[report] persist failed (continuing to email):", e);
    }

    const profileUrl = `https://contratacr.com/es/profesionales/${professionalSlug}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4f7fa;border-radius:8px;">
        <div style="background:#1a2744;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
          <h2 style="margin:0;font-size:18px;">Reporte de perfil — ContrataCR</h2>
        </div>
        <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Profesional:</td><td style="padding:6px 0;font-weight:600;color:#111827;">${professionalName ?? "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Perfil:</td><td style="padding:6px 0;"><a href="${profileUrl}" style="color:#009FD9;">${profileUrl}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Reportado por:</td><td style="padding:6px 0;color:#111827;">${reporterEmail || "Anónimo"}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:12px 0;"/>
          <p style="font-size:13px;color:#6b7280;margin:0 0 6px;">Motivo:</p>
          <div style="font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${String(reason ?? "Sin detalle").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
        </div>
      </div>`;

    const r = await sendBrevoEmail({
      to: SUPPORT_TO,
      replyTo: reporterEmail || undefined,
      subject: `${isImpersonation ? "[PRIORIDAD ALTA] " : ""}[Reporte] Perfil de ${professionalName ?? professionalSlug}`,
      html,
    });

    // The report is already persisted to the moderation queue above, so a skipped
    // (Brevo not configured) or failed email still succeeds for the user. Only a
    // hard failure surfaces an error.
    if (r.status === "failed") {
      return NextResponse.json({ error: "No se pudo enviar el reporte." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[report] error:", err);
    return NextResponse.json({ error: "Error interno del servidor." }, { status: 500 });
  }
}
