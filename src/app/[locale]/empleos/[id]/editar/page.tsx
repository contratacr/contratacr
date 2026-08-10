import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const locale = await getLocale();
  const { id } = await params;
  const query = await searchParams;
  const fromPanel = query.from === "panel";
  const editPath = `/${locale}/empleos/${id}/editar${fromPanel ? "?from=panel" : ""}`;
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(editPath)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/dashboard/profesional?mode=offer`);
  const { data: job } = await supabase.from("job_posts").select("*").eq("id", id).eq("employer_id", professional.id).maybeSingle();
  if (!job) notFound();
  return <JobPostForm professionalId={professional.id} initialJob={job} backHref={fromPanel ? "/dashboard/profesional?mode=offer&tab=jobs" : `/empleos/${id}`} />;
}
