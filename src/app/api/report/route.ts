export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { brandedEmailDocument, sendBrevoEmail } from "@/lib/email/send";
import { auditUserAction } from "@/lib/audit/user-action";
import { writeSourceColumns } from "@/lib/security/write-guard";

const SUPPORT_TO = "soporte@contratacr.com";

export async function POST(req: NextRequest) {
  // Public endpoint: bound abuse and enumeration per client IP.
  const limited = enforceRateLimit(req, "report", 10, 600000);
  if (limited) return limited;
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
    let reportId: string | null = null;
    try {
      const admin = createAdminClient();
      const { data: pro } = await admin.from("professionals").select("id").eq("slug", professionalSlug).maybeSingle();
      let { data: reportRow, error: reportError } = await admin.from("reports").insert({
        professional_id: pro?.id ?? null,
        professional_slug: professionalSlug,
        professional_name: professionalName ?? null,
        reason: storedReason,
        reporter_email: reporterEmail ?? null,
        ...writeSourceColumns(req),
      }).select("id").single();
      if (reportError && /created_source|created_app|created_supabase|column|schema cache|PGRST204|could not find/i.test(reportError.message)) {
        ({ data: reportRow, error: reportError } = await admin.from("reports").insert({
          professional_id: pro?.id ?? null,
          professional_slug: professionalSlug,
          professional_name: professionalName ?? null,
          reason: storedReason,
          reporter_email: reporterEmail ?? null,
        }).select("id").single());
      }
      if (reportError) throw reportError;
      reportId = reportRow?.id ?? null;
      await auditUserAction(admin, req, {
        action: "report.professional_profile",
        entityTable: "reports",
        entityId: reportId,
        afterData: {
          professional_id: pro?.id ?? null,
          professional_slug: professionalSlug,
          professional_name: professionalName ?? null,
          reporter_email: reporterEmail ?? null,
          high_priority: isImpersonation,
        },
      });
    } catch (e) {
      console.error("[report] persist failed (continuing to email):", e);
    }

    const profileUrl = `https://contratacr.com/es/profesionales/${professionalSlug}`;
    const html = brandedEmailDocument({
      title: "Reporte de perfil — ContrataCR",
      bodyHtml: `
          <h1 style="font-size:20px;line-height:1.3;margin:0 0 16px">Reporte de perfil</h1>
          <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:14px;">
            <tr><td style="padding:6px 0;color:#6b7280;width:120px;">Profesional:</td><td style="padding:6px 0;font-weight:600;color:#111827;">${professionalName ?? "—"}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Perfil:</td><td style="padding:6px 0;"><a href="${profileUrl}" style="color:#009FD9;">${profileUrl}</a></td></tr>
            <tr><td style="padding:6px 0;color:#6b7280;">Reportado por:</td><td style="padding:6px 0;color:#111827;">${reporterEmail || "Anónimo"}</td></tr>
          </table>
          <hr style="border:none;border-top:1px solid #f3f4f6;margin:12px 0;"/>
          <p style="font-size:13px;color:#6b7280;margin:0 0 6px;">Motivo:</p>
          <div style="font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap;">${String(reason ?? "Sin detalle").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>`,
    });

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
