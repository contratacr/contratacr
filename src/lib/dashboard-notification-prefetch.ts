import { loadDashboardCache } from "@/lib/dashboard-prefetch-cache";

async function fetchRows<T>(url: string, key: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return json[key] ?? [];
}

const proBookingsKey = (userId: string) => `dashboard:pro-bookings:${userId}`;
const clientBookingsKey = (userId: string) => `dashboard:client-bookings:${userId}`;
const proOpenProjectsKey = (userId: string, categoryId?: string) => `dashboard:pro-open-projects:${userId}:${categoryId ?? "all"}`;

const PRO_BOOKING_TYPES = new Set([
  "booking_received",
  "booking_cancelled_by_client",
  "booking_completed_by_client",
  "booking_rescheduled",
]);

const CLIENT_BOOKING_TYPES = new Set([
  "booking_confirmed",
  "booking_cancelled",
  "booking_completed",
  "booking_update",
  "review_request",
]);

const PRO_PROJECT_TYPES = new Set([
  "new_project",
  "project_cancelled",
  "project_deleted",
  "project_completed",
]);

// Los avisos de propuesta —recibida, corregida, retirada, trabajo marcado como
// hecho— ya no se emiten: el cliente no tiene nada que precargar al recibirlos.

function settleWithin<T>(promise: Promise<T>) {
  return promise.catch(() => undefined);
}

export async function prefetchDashboardDataForNotification(userId: string, type: string) {
  if (PRO_BOOKING_TYPES.has(type)) {
    await settleWithin(loadDashboardCache(proBookingsKey(userId), () => fetchRows("/api/bookings?role=professional", "bookings"), { force: true }));
    return;
  }

  if (CLIENT_BOOKING_TYPES.has(type)) {
    await settleWithin(loadDashboardCache(clientBookingsKey(userId), () => fetchRows("/api/bookings?role=client", "bookings"), { force: true }));
    return;
  }

  if (PRO_PROJECT_TYPES.has(type)) {
    await settleWithin(loadDashboardCache(proOpenProjectsKey(userId), () => fetchRows("/api/projects?role=professional", "projects"), { force: true }));
    return;
  }

}
