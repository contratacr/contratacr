import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { JobsManager } from "@/components/jobs/jobs-manager";
import { type JobPost } from "@/lib/jobs";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";

export const dynamic = "force-dynamic";

export default async function MyJobsPage() {
  const locale = await getLocale();
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(`/${locale}/empleos/mis-empleos`)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/empleos`);
  const { data } = await supabase.from("job_posts").select("*, job_applications(id,status,created_at,cover_letter,applicant_email,phone,resume_url,portfolio_url,profiles(full_name))").eq("employer_id", professional.id).order("created_at", { ascending: false });
  const jobs = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title: repairVisibleText(String(row.title ?? "")),
    applications: ((row.job_applications ?? []) as Array<Record<string, unknown>>).map((application) => ({
      ...application,
      applicant_name: repairVisibleText((application.profiles as { full_name?: string } | null)?.full_name || "Postulante"),
    })),
  })) as Array<JobPost & { applications: Array<{ id: string; status: string; created_at: string; cover_letter: string; applicant_email: string | null; phone: string | null; resume_url: string | null; portfolio_url: string | null; applicant_name: string }> }>;
  return <JobsManager initialJobs={jobs} />;
}
