import { NextResponse } from "next/server";
import { JOB_RESUME_BUCKET, resumeBelongsToApplicant, resumeOriginalName, resumeStoragePath } from "@/lib/jobs/resume-storage";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const rateLimited = enforceRateLimit(request, "job-resume-download", 40, 60_000);
  if (rateLimited) return rateLimited;

  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return NextResponse.json({ error: "Inicia sesión para descargar este CV." }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: application } = await admin
    .from("job_applications")
    .select("id,job_id,applicant_id,resume_url")
    .eq("id", id)
    .maybeSingle();

  if (!application?.resume_url) {
    return NextResponse.json({ error: "CV no encontrado." }, { status: 404 });
  }

  let authorized = application.applicant_id === user.id;
  if (!authorized) {
    const { data: job } = await admin
      .from("job_posts")
      .select("employer_id")
      .eq("id", application.job_id)
      .maybeSingle();
    if (job?.employer_id) {
      const { data: employer } = await admin
        .from("professionals")
        .select("profile_id")
        .eq("id", job.employer_id)
        .maybeSingle();
      authorized = employer?.profile_id === user.id;
    }
  }

  if (!authorized) {
    return NextResponse.json({ error: "CV no encontrado." }, { status: 404 });
  }

  const path = resumeStoragePath(application.resume_url);
  if (!path || !resumeBelongsToApplicant(path, application.applicant_id)) {
    return NextResponse.json({ error: "CV no encontrado." }, { status: 404 });
  }

  const fileName = resumeOriginalName(path) ?? "CV";
  const { data, error } = await admin.storage
    .from(JOB_RESUME_BUCKET)
    .createSignedUrl(path, 5 * 60, { download: fileName });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "No pudimos preparar este CV." }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
