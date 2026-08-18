import { JobsBoard } from "@/components/jobs/jobs-board";
import { type JobPost } from "@/lib/jobs";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { buildSocialUrl } from "@/lib/social";

export const dynamic = "force-dynamic";

export async function JobsPageContent({ initialSelectedJobId = null, returnTo = null, detailOnly = false }: { initialSelectedJobId?: string | null; returnTo?: string | null; detailOnly?: boolean } = {}) {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const [{ data, error: jobsError }, { data: professional }, { data: profile }, { data: applications }] = await Promise.all([
    supabase
      .from("job_posts")
      .select("*, job_applications(count), professionals!job_posts_employer_id_fkey(slug,business_name,profiles(full_name,avatar_url))")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    user ? supabase.from("professionals").select("id,social_links").eq("profile_id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("profiles").select("email,phone").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    user ? supabase.from("job_applications").select("job_id").eq("applicant_id", user.id) : Promise.resolve({ data: [] as Array<{ job_id: string }> }),
  ]);

  if (jobsError) {
    console.error("Could not load published jobs", jobsError.message);
  }

  const jobs = ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const employer = row.professionals as { slug?: string; business_name?: string; profiles?: { full_name?: string; avatar_url?: string | null } | null } | null;
    const applicationCountRow = Array.isArray(row.job_applications) ? row.job_applications[0] as { count?: number | string } | undefined : undefined;
    const applicationCount = Number(applicationCountRow?.count ?? 0);
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      employer_name: repairVisibleText(employer?.business_name || employer?.profiles?.full_name || "Profesional en ContrataCR"),
      employer_slug: employer?.slug ?? null,
      employer_avatar_url: employer?.profiles?.avatar_url ?? null,
      application_count: Number.isFinite(applicationCount) ? applicationCount : 0,
    } as JobPost;
  });

  const socialLinks = (professional?.social_links && typeof professional.social_links === "object" ? professional.social_links : {}) as Record<string, string>;

  return (
    <JobsBoard
      jobs={jobs}
      canPost={!!professional}
      initialSelectedJobId={initialSelectedJobId}
      returnTo={returnTo}
      currentProfessionalId={professional?.id ?? null}
      currentUserId={user?.id ?? null}
      currentUserEmail={profile?.email ?? user?.email ?? null}
      currentUserPhone={profile?.phone ?? null}
      currentUserLinkedIn={socialLinks.linkedin ? buildSocialUrl("linkedin", socialLinks.linkedin) : null}
      appliedJobIds={(applications ?? []).map((item) => item.job_id)}
      detailOnly={detailOnly}
    />
  );
}

export default async function JobsPage() {
  return <JobsPageContent />;
}
