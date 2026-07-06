"use client";

import { useEffect, useMemo, useState } from "react";

type NotificationProjectData = {
  project_id?: string | null;
  project_created_at?: string | null;
};

type ProjectNotification = {
  type: string;
  data?: NotificationProjectData | null;
};

type ProjectTimeMap = Record<string, string | null>;

export function getNotificationProjectCreatedAt(
  notification: ProjectNotification,
  projectTimes: ProjectTimeMap
): string | null {
  if (notification.type !== "new_project") return null;
  const projectId = notification.data?.project_id;
  return notification.data?.project_created_at ?? (projectId ? projectTimes[projectId] ?? null : null);
}

export function useNotificationProjectTimes(items: ProjectNotification[]): ProjectTimeMap {
  const [projectTimes, setProjectTimes] = useState<ProjectTimeMap>({});

  const missingIdsKey = useMemo(() => {
    const missing = new Set<string>();
    for (const item of items) {
      const projectId = item.data?.project_id;
      if (item.type === "new_project" && projectId && !item.data?.project_created_at && projectTimes[projectId] === undefined) {
        missing.add(projectId);
      }
    }
    return [...missing].sort().join("|");
  }, [items, projectTimes]);

  useEffect(() => {
    if (!missingIdsKey) return;
    let cancelled = false;
    const missingIds = missingIdsKey.split("|").filter(Boolean);

    void (async () => {
      const next: ProjectTimeMap = Object.fromEntries(missingIds.map((id) => [id, null]));
      try {
        const res = await fetch("/api/projects?role=professional", { cache: "no-store" });
        const payload = res.ok ? await res.json() : { projects: [] };
        const projects = Array.isArray(payload?.projects) ? payload.projects : [];
        for (const project of projects) {
          if (
            typeof project?.id === "string" &&
            missingIds.includes(project.id) &&
            typeof project?.created_at === "string"
          ) {
            next[project.id] = project.created_at;
          }
        }
      } catch {
        // Best effort only; existing notifications fall back to their notification time.
      }
      if (!cancelled) setProjectTimes((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
  }, [missingIdsKey]);

  return projectTimes;
}
