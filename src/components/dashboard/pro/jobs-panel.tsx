"use client";

import { useEffect, useState } from "react";
import { JobsManager, type ManagedJob } from "@/components/jobs/jobs-manager";
import { createClient } from "@/lib/supabase/client";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { PanelListSkeleton } from "@/components/ui/content-loading";

export function JobsPanel({ professionalId }: { professionalId: string }) {
  const [jobs, setJobs] = useState<ManagedJob[] | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    void createClient()
      .from("job_posts")
      .select("*, job_applications(id,status,created_at,cover_letter,applicant_email,phone,resume_url,portfolio_url,profiles(full_name))")
      .eq("employer_id", professionalId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          ...row,
          title: repairVisibleText(String(row.title ?? "")),
          applications: ((row.job_applications ?? []) as Array<Record<string, unknown>>).map((application) => ({
            ...application,
            applicant_name: repairVisibleText(
              (application.profiles as { full_name?: string } | null)?.full_name || "Postulante",
            ),
          })),
        })) as ManagedJob[];
        setJobs(rows);
      });
    return () => {
      active = false;
    };
  }, [professionalId, refreshKey]);

  if (!jobs) {
    return <PanelListSkeleton rows={2} />;
  }

  return <JobsManager initialJobs={jobs} professionalId={professionalId} embedded onRefresh={() => setRefreshKey((key) => key + 1)} />;
}
