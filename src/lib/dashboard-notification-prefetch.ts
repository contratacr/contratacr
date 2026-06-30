import { loadDashboardCache } from "@/lib/dashboard-prefetch-cache";

async function fetchRows<T>(url: string, key: string): Promise<T[]> {
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  return json[key] ?? [];
}

const proBookingsKey = (userId: string) => `dashboard:pro-bookings:${userId}`;
const clientBookingsKey = (userId: string) => `dashboard:client-bookings:${userId}`;
const clientProjectsKey = (userId: string) => `dashboard:client-projects:${userId}`;
const proOpenProjectsKey = (userId: string, categoryId?: string) => `dashboard:pro-open-projects:${userId}:${categoryId ?? "all"}`;
const proMyProposalsKey = (userId: string) => `dashboard:pro-my-proposals:${userId}`;

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
  "proposal_accepted",
  "project_proposal_accepted",
  "project_proposal_declined",
  "new_project",
  "project_cancelled",
  "project_deleted",
  "project_completed",
]);

const CLIENT_PROJECT_TYPES = new Set([
  "proposal_received",
  "proposal_updated",
  "proposal_withdrawn",
  "project_work_done",
]);

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
    await Promise.all([
      settleWithin(loadDashboardCache(proMyProposalsKey(userId), () => fetchRows("/api/proposals?mine=true", "proposals"), { force: true })),
      settleWithin(loadDashboardCache(proOpenProjectsKey(userId), () => fetchRows("/api/projects?role=professional", "projects"), { force: true })),
    ]);
    return;
  }

  if (CLIENT_PROJECT_TYPES.has(type)) {
    await settleWithin(loadDashboardCache(clientProjectsKey(userId), () => fetchRows("/api/projects?role=client", "projects"), { force: true }));
  }
}
