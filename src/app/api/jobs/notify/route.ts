import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { sendNotificationPush } from "@/lib/push/notify";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATUS_MESSAGES: Record<string, string> = {
  reviewing: "está revisando tu postulación",
  shortlisted: "preseleccionó tu postulación",
  accepted: "aceptó tu postulación",
  hired: "aceptó tu postulación",
  rejected: "decidió no continuar con tu postulación",
};

/**
 * Job application notifications. Applications and their status changes are
 * written by the browser under RLS, so this endpoint re-reads the truth with
 * the service role, verifies the caller is the right party, and creates the
 * cross-account notification. Duplicate-safe per application (and per status
 * for updates).
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const kind = body.kind === "application_status" ? "application_status" : "application";
  const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
  if (!UUID_RE.test(applicationId)) {
    return NextResponse.json({ error: "Postulación inválida." }, { status: 400 });
  }
  const viewer = await createClient().then((supabase) => safeGetUser(supabase)).catch(() => null);
  if (!viewer) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: application } = await admin
    .from("job_applications")
    .select("id, job_id, applicant_id, status")
    .eq("id", applicationId)
    .maybeSingle();
  if (!application) return NextResponse.json({ notified: false });

  const { data: job } = await admin
    .from("job_posts")
    .select("id, title, employer_id")
    .eq("id", application.job_id)
    .maybeSingle();
  if (!job) return NextResponse.json({ notified: false });

  const { data: employer } = await admin
    .from("professionals")
    .select("profile_id, business_name")
    .eq("id", job.employer_id)
    .maybeSingle();
  const employerProfileId = (employer as { profile_id?: string | null } | null)?.profile_id ?? null;
  if (!employerProfileId) return NextResponse.json({ notified: false });

  if (kind === "application") {
    // The applicant reports their own new application; the employer hears about it.
    if (application.applicant_id !== viewer.id || employerProfileId === viewer.id) {
      return NextResponse.json({ notified: false });
    }
    const { data: existing } = await admin
      .from("notifications")
      .select("id")
      .eq("user_id", employerProfileId)
      .eq("type", "job_application")
      .eq("data->>application_id", application.id)
      .limit(1);
    if (existing?.length) return NextResponse.json({ notified: false });

    const { data: profile } = await admin.from("profiles").select("full_name").eq("id", viewer.id).maybeSingle();
    const applicantName = (profile as { full_name?: string | null } | null)?.full_name?.trim() || "Alguien";
    const notification = {
      user_id: employerProfileId,
      type: "job_application",
      title: "Nueva postulación",
      message: `${applicantName} se postuló a "${job.title}".`,
      data: { application_id: application.id, job_id: job.id },
    };
    const { error } = await admin.from("notifications").insert(notification);
    if (error) {
      console.error("[jobs/notify] application insert failed:", error.message);
      return NextResponse.json({ notified: false });
    }
    await sendNotificationPush({ userId: employerProfileId, title: notification.title, message: notification.message, data: notification.data });
    return NextResponse.json({ notified: true });
  }

  // application_status: the employer reports the change; the applicant hears it.
  if (employerProfileId !== viewer.id || application.applicant_id === viewer.id) {
    return NextResponse.json({ notified: false });
  }
  const status = String(application.status ?? "");
  const { data: existing } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", application.applicant_id)
    .eq("type", "job_application_status")
    .eq("data->>application_id", application.id)
    .eq("data->>status", status)
    .limit(1);
  if (existing?.length) return NextResponse.json({ notified: false });

  const employerName = (employer as { business_name?: string | null } | null)?.business_name?.trim() || "El empleador";
  const statusPhrase = STATUS_MESSAGES[status] ?? "actualizó el estado de tu postulación";
  const notification = {
    user_id: application.applicant_id,
    type: "job_application_status",
    title: "Actualización de tu postulación",
    message: `${employerName} ${statusPhrase} para "${job.title}".`,
    data: { application_id: application.id, job_id: job.id, status },
  };
  const { error } = await admin.from("notifications").insert(notification);
  if (error) {
    console.error("[jobs/notify] status insert failed:", error.message);
    return NextResponse.json({ notified: false });
  }
  await sendNotificationPush({ userId: application.applicant_id, title: notification.title, message: notification.message, data: notification.data });
  return NextResponse.json({ notified: true });
}
