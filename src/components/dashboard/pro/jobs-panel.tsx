"use client";

import { useCachedResource } from "@/hooks/use-cached-resource";
import { JobsManager, type ManagedJob } from "@/components/jobs/jobs-manager";
import { createClient } from "@/lib/supabase/client";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { PanelListSkeleton } from "@/components/ui/content-loading";

const SIN_EMPLEOS: ManagedJob[] = [];

// Caché de sesión: al volver a la sección se pinta lo último que se vio y la
// consulta se repite por detrás. Antes cada entrada arrancaba de cero y
// mostraba el esqueleto aunque no hubiera nada nuevo que cargar.
export function JobsPanel({ professionalId }: { professionalId: string }) {
  const { data: jobs, loading, refresh } = useCachedResource<ManagedJob[]>(
    `dashboard:jobs:${professionalId}`,
    () => cargarEmpleos(professionalId),
    SIN_EMPLEOS,
  );
  if (loading) {
    return <PanelListSkeleton rows={2} />;
  }
  return <JobsManager initialJobs={jobs} professionalId={professionalId} embedded onRefresh={() => void refresh()} />;
}

async function cargarEmpleos(professionalId: string): Promise<ManagedJob[]> {
  const { data } = await createClient()
    .from("job_posts")
    .select("*, job_applications(id,status,created_at,cover_letter,applicant_email,phone,resume_url,portfolio_url,profiles(full_name))")
    .eq("employer_id", professionalId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    ...row,
    title: repairVisibleText(String(row.title ?? "")),
    applications: ((row.job_applications ?? []) as Array<Record<string, unknown>>).map((application) => ({
      ...application,
      applicant_name: repairVisibleText(
        (application.profiles as { full_name?: string } | null)?.full_name || "Postulante",
      ),
    })),
  })) as ManagedJob[];
}
