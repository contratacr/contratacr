import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function PublishJobPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const locale = await getLocale();
  const params = await searchParams;
  const fromPanel = params.from === "panel";
  const backHref = fromPanel ? "/dashboard/profesional?mode=offer&tab=jobs" : "/empleos";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const publishPath = `/${locale}/empleos/publicar${fromPanel ? "?from=panel" : ""}`;
  if (!user) redirect(`/${locale}/login?redirect=${encodeURIComponent(publishPath)}`);
  const { data: professional } = await supabase.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
  if (!professional) redirect(`/${locale}/registro/profesional?redirect=${encodeURIComponent(publishPath)}`);
  return <JobPostForm professionalId={professional.id} backHref={backHref} />;
}
