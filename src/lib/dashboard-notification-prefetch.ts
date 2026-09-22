import { loadDashboardCache } from "@/lib/dashboard-prefetch-cache";

async function fetchRows<T>(url: string, key: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return json[key] ?? [];
}

const proOpenProjectsKey = (userId: string, categoryId?: string) => `dashboard:pro-open-projects:${userId}:${categoryId ?? "all"}`;

// Solo los avisos de proyecto precargan algo: al llegar «nuevo proyecto» el
// tablero ya esta listo cuando la persona toca el aviso. Las citas y las
// propuestas salieron del producto con sus precargas.
const PRO_PROJECT_TYPES = new Set(["new_project", "project_cancelled"]);

function settleWithin<T>(promise: Promise<T>) {
  return promise.catch(() => undefined);
}

export async function prefetchDashboardDataForNotification(userId: string, type: string) {
  if (!PRO_PROJECT_TYPES.has(type)) return;
  await settleWithin(loadDashboardCache(proOpenProjectsKey(userId), () => fetchRows("/api/projects?role=professional", "projects"), { force: true }));
}
