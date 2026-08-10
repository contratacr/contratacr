import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

function resumeNameFromUrl(value: string | null) {
  if (!value) return null;
  try {
    const storedName = decodeURIComponent(new URL(value).pathname.split("/").pop() ?? "");
    return storedName.replace(/^\d+-[0-9a-f-]{36}-/i, "") || "CV";
  } catch {
    return "CV";
  }
}

export async function GET() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return NextResponse.json({ applications: [] }, { status: 401 });
  const admin = createAdminClient();
  const { data: applications, error } = await admin.from("job_applications")
    .select("id,job_id,status,created_at,updated_at,resume_url,cover_letter,portfolio_url").eq("applicant_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ applications: [] }, { status: 500 });
  const jobIds = [...new Set((applications ?? []).map((item) => item.job_id))];
  if (!jobIds.length) return NextResponse.json({ applications: [] });
  const { data: jobs, error: jobsError } = await admin.from("job_posts")
    .select("id,title,employment_type,workplace_type,location_label,status,employer_id").in("id", jobIds);
  if (jobsError) return NextResponse.json({ applications: [] }, { status: 500 });
  const employerIds = [...new Set((jobs ?? []).map((job) => job.employer_id))];
  const { data: employers } = employerIds.length
    ? await admin.from("professionals").select("id,business_name,profiles(full_name,avatar_url)").in("id", employerIds)
    : { data: [] };
  const employerById = new Map((employers ?? []).map((employer) => {
    const profile = Array.isArray(employer.profiles) ? employer.profiles[0] : employer.profiles;
    return [employer.id, {
      name: employer.business_name || profile?.full_name || "Profesional en ContrataCR",
      avatarUrl: profile?.avatar_url ?? null,
    }];
  }));
  const jobById = new Map((jobs ?? []).map((job) => [job.id, job]));
  return NextResponse.json({ applications: (applications ?? []).map((application) => {
    const job = jobById.get(application.job_id);
    const employer = job ? employerById.get(job.employer_id) : null;
    return {
      id: application.id, status: application.status, createdAt: application.created_at,
      resumeUrl: application.resume_url,
      resumeName: resumeNameFromUrl(application.resume_url),
      coverLetter: application.cover_letter,
      portfolioUrl: application.portfolio_url,
      job: job ? {
        id: job.id, title: job.title, employmentType: job.employment_type,
        workplaceType: job.workplace_type, locationLabel: job.location_label, status: job.status,
        employerName: employer?.name ?? "Profesional en ContrataCR",
        employerAvatarUrl: employer?.avatarUrl ?? null,
      } : null,
    };
  }) });
}
