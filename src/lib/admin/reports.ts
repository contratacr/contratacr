import { createAdminClient } from "@/lib/supabase/admin";
import { getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";

// ── Comprehensive admin analytics ("Analítica"). Real aggregation across users,
// professionals, marketplace activity, subscriptions/payments and support.
// Best-effort per section (try/catch) so a missing table/column never 500s.

export type Count = { label: string; value: number };
export type RegPoint = { date: string; pros: number; clients: number };
export type ActPoint = { date: string; solicitudes: number; proyectos: number };
export type InteractionPoint = { date: string; total: number };
export type ProfessionalInteraction = {
  professionalId: string;
  slug: string;
  professionalName: string;
  total: number;
  profileViews: number;
  whatsappClicks: number;
  phoneClicks: number;
  availabilityActions: number;
  favorites: number;
  uniqueVisitors: number;
};

export type AdminReports = {
  users: { total: number; clients: number; pros: number; verifiedPros: number; activeClients: number; reg30: RegPoint[] };
  pros: { total: number; verified: number; pending: number; unverified: number; rejected: number; byCategory: Count[]; byProvince: Count[]; traveling: number; fixed: number; withSchedule: number; withoutSchedule: number; withServices: number; withoutServices: number };
  activity: { solicitudesTotal: number; solicitudesByStatus: Count[]; solicitudesResponded: number; proyectosTotal: number; proyectosByStatus: Count[]; topCategories: Count[]; series30: ActPoint[] };
  subs: { total: number; active: number; expired: number; byPlan: Count[]; byStatus: Count[]; byCycle: Count[]; byMethod: Count[]; revenueTotal: number; revenueByMethod: Count[]; pendingPayments: number; hasData: boolean };
  support: { total: number; byStatus: Count[]; series30: { date: string; tickets: number }[] };
  interactions: { total: number; uniqueVisitors: number; byType: Count[]; series30: InteractionPoint[]; professionals: ProfessionalInteraction[] };
};

const DAY = 86400000;
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function lastNDays(n: number, now: number): string[] {
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => dayKey(new Date(t0.getTime() - (n - 1 - i) * DAY)));
}
function bucketByDay(times: string[], days: string[]): Record<string, number> {
  const set = new Set(days);
  const out: Record<string, number> = Object.fromEntries(days.map((d) => [d, 0]));
  for (const t of times) { const k = (t || "").slice(0, 10); if (set.has(k)) out[k] += 1; }
  return out;
}
function tally(values: (string | null | undefined)[], labels: Record<string, string>): Count[] {
  const m = new Map<string, number>();
  for (const v of values) { const k = v ?? "—"; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, value]) => ({ label: labels[k] ?? k, value }));
}

export async function getAdminReports(locale = "es"): Promise<AdminReports> {
  const admin = createAdminClient();
  const now = Date.now();
  const days30 = lastNDays(30, now);

  const empty: AdminReports = {
    users: { total: 0, clients: 0, pros: 0, verifiedPros: 0, activeClients: 0, reg30: days30.map((d) => ({ date: d, pros: 0, clients: 0 })) },
    pros: { total: 0, verified: 0, pending: 0, unverified: 0, rejected: 0, byCategory: [], byProvince: [], traveling: 0, fixed: 0, withSchedule: 0, withoutSchedule: 0, withServices: 0, withoutServices: 0 },
    activity: { solicitudesTotal: 0, solicitudesByStatus: [], solicitudesResponded: 0, proyectosTotal: 0, proyectosByStatus: [], topCategories: [], series30: days30.map((d) => ({ date: d, solicitudes: 0, proyectos: 0 })) },
    subs: { total: 0, active: 0, expired: 0, byPlan: [], byStatus: [], byCycle: [], byMethod: [], revenueTotal: 0, revenueByMethod: [], pendingPayments: 0, hasData: false },
    support: { total: 0, byStatus: [], series30: days30.map((d) => ({ date: d, tickets: 0 })) },
    interactions: { total: 0, uniqueVisitors: 0, byType: [], series30: days30.map((d) => ({ date: d, total: 0 })), professionals: [] },
  };

  // ── Users + professionals + clients ──
  try {
    const [{ data: profiles }, { data: pros }] = await Promise.all([
      admin.from("profiles").select("id, role, created_at"),
      admin.from("professionals").select("id, created_at, verification_status, category_id, provincia_id, professions, service_type, availability_public, services"),
    ]);
    const allProfiles = profiles ?? [];
    const clients = allProfiles.filter((p) => p.role === "client");
    const proRows = pros ?? [];

    empty.users.total = allProfiles.length;
    empty.users.clients = clients.length;
    empty.users.pros = proRows.length;
    empty.users.verifiedPros = proRows.filter((p) => p.verification_status === "verified").length;

    const proReg = bucketByDay(proRows.map((p) => p.created_at as string), days30);
    const cliReg = bucketByDay(clients.map((c) => c.created_at as string), days30);
    empty.users.reg30 = days30.map((d) => ({ date: d, pros: proReg[d], clients: cliReg[d] }));

    // Professionals breakdowns
    empty.pros.total = proRows.length;
    empty.pros.verified = proRows.filter((p) => p.verification_status === "verified").length;
    empty.pros.pending = proRows.filter((p) => p.verification_status === "pending" || p.verification_status === "under_review").length;
    empty.pros.rejected = proRows.filter((p) => p.verification_status === "rejected").length;
    empty.pros.unverified = proRows.length - empty.pros.verified - empty.pros.pending - empty.pros.rejected;
    empty.pros.traveling = proRows.filter((p) => String(p.service_type ?? "").includes("mobile")).length;
    empty.pros.fixed = proRows.length - empty.pros.traveling;
    empty.pros.withServices = proRows.filter((p) => Array.isArray(p.services) && p.services.length > 0).length;
    empty.pros.withoutServices = proRows.length - empty.pros.withServices;

    const catCounts = new Map<string, number>();
    for (const p of proRows) {
      const ids = new Set<string>();
      if (p.category_id) ids.add(p.category_id as string);
      for (const c of (p.professions as string[] | null) ?? []) if (c) ids.add(c);
      for (const id of ids) catCounts.set(id, (catCounts.get(id) ?? 0) + 1);
    }
    empty.pros.byCategory = [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, value]) => ({ label: getCategoryLabel(id, locale), value }));
    const provCounts = new Map<string, number>();
    for (const p of proRows) if (p.provincia_id) provCounts.set(p.provincia_id as string, (provCounts.get(p.provincia_id as string) ?? 0) + 1);
    empty.pros.byProvince = [...provCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ label: getProvinceById(id)?.name ?? id, value }));

    // With/without published schedule (distinct professional_id in availability_slots)
    try {
      const { data: slots } = await admin.from("availability_slots").select("professional_id");
      const withSched = new Set((slots ?? []).map((s) => s.professional_id));
      empty.pros.withSchedule = [...withSched].filter(Boolean).length;
      empty.pros.withoutSchedule = proRows.length - empty.pros.withSchedule;
    } catch { /* table missing */ }
  } catch (e) { console.error("[reports] users/pros", e); }

  // ── Active clients (sent ≥1 solicitud) + marketplace activity ──
  try {
    const [{ data: bookings }, { data: projects }] = await Promise.all([
      admin.from("bookings").select("id, status, created_at, client_id"),
      admin.from("projects").select("id, status, created_at, category_id"),
    ]);
    const bRows = bookings ?? [];
    const pRows = projects ?? [];

    empty.users.activeClients = new Set(bRows.map((b) => b.client_id).filter(Boolean)).size;

    empty.activity.solicitudesTotal = bRows.length;
    const bStatusLabels: Record<string, string> = { pending: "Pendiente", confirmed: "Confirmada", in_progress: "En curso", awaiting_confirmation: "Por confirmar", completed: "Completada", cancelled: "Cancelada", rescheduled: "Reprogramada" };
    empty.activity.solicitudesByStatus = tally(bRows.map((b) => b.status as string), bStatusLabels);
    empty.activity.solicitudesResponded = bRows.filter((b) => ["confirmed", "in_progress", "awaiting_confirmation", "completed"].includes(b.status as string)).length;

    empty.activity.proyectosTotal = pRows.length;
    const pStatusLabels: Record<string, string> = { open: "Abierto", in_progress: "En curso", awaiting_confirmation: "Por confirmar", completed: "Completado", cancelled: "Cancelado" };
    empty.activity.proyectosByStatus = tally(pRows.map((p) => p.status as string), pStatusLabels);

    const catCounts = new Map<string, number>();
    for (const p of pRows) if (p.category_id) catCounts.set(p.category_id as string, (catCounts.get(p.category_id as string) ?? 0) + 1);
    empty.activity.topCategories = [...catCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, value]) => ({ label: getCategoryLabel(id, locale), value }));

    const bBucket = bucketByDay(bRows.map((b) => b.created_at as string), days30);
    const pBucket = bucketByDay(pRows.map((p) => p.created_at as string), days30);
    empty.activity.series30 = days30.map((d) => ({ date: d, solicitudes: bBucket[d], proyectos: pBucket[d] }));
  } catch (e) { console.error("[reports] activity", e); }

  // ── Subscriptions + payments (works now; populates when payments activate) ──
  try {
    const [{ data: subs }, { data: payments }] = await Promise.all([
      admin.from("subscriptions").select("status, plan, billing_cycle, payment_method"),
      admin.from("subscription_payments").select("amount, method, status, paid_at"),
    ]);
    const sRows = subs ?? [];
    const payRows = payments ?? [];
    empty.subs.total = sRows.length;
    empty.subs.active = sRows.filter((s) => s.status === "active").length;
    empty.subs.expired = sRows.filter((s) => s.status === "expired").length;
    empty.subs.byPlan = tally(sRows.map((s) => s.plan as string), { free: "Free", premium: "Premium" });
    empty.subs.byStatus = tally(sRows.map((s) => s.status as string), { active: "Activa", inactive: "Inactiva", expired: "Expirada", pending: "Pendiente", cancelled: "Cancelada" });
    empty.subs.byCycle = tally(sRows.map((s) => s.billing_cycle as string), { monthly: "Mensual", annual: "Anual" });
    empty.subs.byMethod = tally(sRows.map((s) => s.payment_method as string), { card: "Tarjeta", sinpe: "SINPE", manual: "Manual" });

    const paid = payRows.filter((p) => p.status === "paid");
    empty.subs.revenueTotal = paid.reduce((a, p) => a + (Number(p.amount) || 0), 0);
    const revByMethod = new Map<string, number>();
    for (const p of paid) revByMethod.set(p.method as string, (revByMethod.get(p.method as string) ?? 0) + (Number(p.amount) || 0));
    const methodLabels: Record<string, string> = { card: "Tarjeta", sinpe: "SINPE", manual: "Manual" };
    empty.subs.revenueByMethod = [...revByMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, value]) => ({ label: methodLabels[k] ?? k, value }));
    empty.subs.pendingPayments = payRows.filter((p) => p.status === "pending").length;
    empty.subs.hasData = sRows.length > 0 || payRows.length > 0;
  } catch (e) { console.error("[reports] subs", e); }

  // ── Support tickets ──
  try {
    const { data: tickets } = await admin.from("support_tickets").select("status, created_at");
    const tRows = tickets ?? [];
    empty.support.total = tRows.length;
    empty.support.byStatus = tally(tRows.map((t) => t.status as string), { open: "Pendiente", in_progress: "En proceso", resolved: "Resuelto" });
    const tBucket = bucketByDay(tRows.map((t) => t.created_at as string), days30);
    empty.support.series30 = days30.map((d) => ({ date: d, tickets: tBucket[d] }));
  } catch (e) { console.error("[reports] support", e); }

  // First-party interaction analytics. Totals and per-professional values are
  // all-time; the compact trend remains limited to the last 30 days.
  try {
    const since = new Date(now - 29 * DAY);
    since.setHours(0, 0, 0, 0);
    const { data, error } = await admin.rpc("get_admin_interaction_analytics", { p_since: since.toISOString() });
    if (error) throw error;
    const payload = (data ?? {}) as Record<string, unknown>;
    const typeLabels: Record<string, string> = {
      profile_view: "Vistas de perfil",
      whatsapp_click: "WhatsApp",
      phone_click: "Llamadas",
      availability_view: "Ver disponibilidad",
      schedule_slot_selected: "Horarios seleccionados",
      favorite_add: "Perfiles guardados",
      favorite_remove: "Perfiles eliminados de guardados",
      profile_share: "Perfiles compartidos",
      external_link_click: "Enlaces externos",
      service_request_started: "Solicitudes iniciadas",
    };
    empty.interactions.total = Number(payload.total) || 0;
    empty.interactions.uniqueVisitors = Number(payload.uniqueVisitors) || 0;
    empty.interactions.byType = (Array.isArray(payload.byType) ? payload.byType : []).map((row) => {
      const item = row as Record<string, unknown>;
      const type = String(item.type ?? "");
      return { label: typeLabels[type] ?? type, value: Number(item.total) || 0 };
    });
    const seriesMap = new Map((Array.isArray(payload.series) ? payload.series : []).map((row) => {
      const item = row as Record<string, unknown>;
      return [String(item.date ?? ""), Number(item.total) || 0] as const;
    }));
    empty.interactions.series30 = days30.map((date) => ({ date, total: seriesMap.get(date) ?? 0 }));
    empty.interactions.professionals = (Array.isArray(payload.professionals) ? payload.professionals : []).map((row) => {
      const item = row as Record<string, unknown>;
      return {
        professionalId: String(item.professional_id ?? ""),
        slug: String(item.slug ?? ""),
        professionalName: String(item.professional_name ?? "Profesional"),
        total: Number(item.total) || 0,
        profileViews: Number(item.profile_views) || 0,
        whatsappClicks: Number(item.whatsapp_clicks) || 0,
        phoneClicks: Number(item.phone_clicks) || 0,
        availabilityActions: Number(item.availability_actions) || 0,
        favorites: Number(item.favorites) || 0,
        uniqueVisitors: Number(item.unique_visitors) || 0,
      };
    });
  } catch (e) { console.error("[reports] interactions", e); }

  return empty;
}
