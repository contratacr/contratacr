import { createAdminClient } from "@/lib/supabase/admin";
import { getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";

// ── Comprehensive admin analytics ("Analítica"). Real aggregation across users,
// professionals, marketplace activity, interactions and support.
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
  serviceRequestsCreated: number;
  proposalsSent: number;
  proposalsAccepted: number;
  reviewsReceived: number;
  uniqueVisitors: number;
};

export type WeekCompare = { now: number; prev: number };
export type DemandRow = { id: string; label: string; demand: number; searches: number; projects: number; supply: number; gap: boolean };
export type AdminInsights = {
  week: { pros: WeekCompare; clients: WeekCompare; searches: WeekCompare; requests: WeekCompare; contacts: WeekCompare; applications: WeekCompare };
  funnel: { searches: number; profileViews: number; contacts: number; requests: number };
  demand: DemandRow[];
  platform: { web: number; native: number };
  tracking: { since: string | null; events14d: number };
};

export type AcquisitionRow = { key: string; label: string; pros: number; clients: number; pros30: number; clients30: number };
export type AcquisitionCampaign = { label: string; source: string; pros: number; clients: number };
export type AdminAcquisition = {
  // Registrations that carry an origin vs. those created before tracking existed.
  tracked: number;
  untracked: number;
  tracked30: number;
  untracked30: number;
  since: string | null;
  rows: AcquisitionRow[];
  campaigns: AcquisitionCampaign[];
};
export type AdminReports = {
  insights: AdminInsights;
  acquisition: AdminAcquisition;
  users: { total: number; clients: number; pros: number; verifiedPros: number; activeClients: number; reg30: RegPoint[] };
  pros: { total: number; verified: number; pending: number; unverified: number; rejected: number; byCategory: Count[]; byProvince: Count[]; traveling: number; fixed: number; withSchedule: number; withoutSchedule: number; withServices: number; withoutServices: number };
  activity: { solicitudesTotal: number; solicitudesByStatus: Count[]; solicitudesResponded: number; proyectosTotal: number; proyectosByStatus: Count[]; topCategories: Count[]; series30: ActPoint[] };
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

// Plain-language name for an origin. utm_source is free text chosen when the ad
// link is built, so the common spellings are folded together; a paid medium
// (utm_medium=paid|cpc|ads, or a click id) reads as "Anuncios en …".
const SOURCE_NAMES: Record<string, string> = {
  meta: "Meta", instagram: "Instagram", facebook: "Facebook", fb: "Facebook", ig: "Instagram",
  tiktok: "TikTok", google: "Google", whatsapp: "WhatsApp", direct: "Directo", other: "Otros sitios",
};
const PAID_MEDIUMS = new Set(["paid", "cpc", "ads", "ad", "paid_social", "paidsocial", "ppc"]);
function acquisitionLabel(source: string, medium: string | null): { key: string; label: string } {
  const src = SOURCE_NAMES[source] ?? source;
  const paid = !!medium && PAID_MEDIUMS.has(medium);
  if (source === "direct") return { key: "direct", label: "Directo (sin enlace de origen)" };
  if (source === "other") return { key: "other", label: "Otros sitios" };
  if (paid) return { key: `${source}:paid`, label: `Anuncios en ${src}` };
  if (medium === "organic" || medium === "social" || !medium) return { key: `${source}:organic`, label: `${src} (orgánico)` };
  return { key: `${source}:${medium}`, label: `${src} (${medium})` };
}

export async function getAdminReports(locale = "es"): Promise<AdminReports> {
  const admin = createAdminClient();
  const now = Date.now();
  const days30 = lastNDays(30, now);

  const empty: AdminReports = {
    insights: {
      week: { pros: { now: 0, prev: 0 }, clients: { now: 0, prev: 0 }, searches: { now: 0, prev: 0 }, requests: { now: 0, prev: 0 }, contacts: { now: 0, prev: 0 }, applications: { now: 0, prev: 0 } },
      funnel: { searches: 0, profileViews: 0, contacts: 0, requests: 0 },
      demand: [],
      platform: { web: 0, native: 0 },
      tracking: { since: null, events14d: 0 },
    },
    acquisition: { tracked: 0, untracked: 0, tracked30: 0, untracked30: 0, since: null, rows: [], campaigns: [] },
    users: { total: 0, clients: 0, pros: 0, verifiedPros: 0, activeClients: 0, reg30: days30.map((d) => ({ date: d, pros: 0, clients: 0 })) },
    pros: { total: 0, verified: 0, pending: 0, unverified: 0, rejected: 0, byCategory: [], byProvince: [], traveling: 0, fixed: 0, withSchedule: 0, withoutSchedule: 0, withServices: 0, withoutServices: 0 },
    activity: { solicitudesTotal: 0, solicitudesByStatus: [], solicitudesResponded: 0, proyectosTotal: 0, proyectosByStatus: [], topCategories: [], series30: days30.map((d) => ({ date: d, solicitudes: 0, proyectos: 0 })) },
    support: { total: 0, byStatus: [], series30: days30.map((d) => ({ date: d, tickets: 0 })) },
    interactions: { total: 0, uniqueVisitors: 0, byType: [], series30: days30.map((d) => ({ date: d, total: 0 })), professionals: [] },
  };

  // Raw timestamps and counts shared with the plain-language insights below.
  let proCreated: string[] = [];
  let clientCreated: string[] = [];
  let supplyByCategory = new Map<string, number>();
  let requestCreated: string[] = [];
  let projectRowsForDemand: Array<{ created_at: string; category_id: string | null }> = [];

  // ── Users + professionals + clients ──
  try {
    const [{ data: profiles }, { data: pros }] = await Promise.all([
      admin.from("profiles").select("id, role, created_at"),
      admin.from("professionals").select("id, profile_id, created_at, verification_status, category_id, provincia_id, professions, service_type, availability_public, services"),
    ]);
    const allProfiles = profiles ?? [];
    const proRows = pros ?? [];
    const professionalProfileIds = new Set(proRows.map((professional) => professional.profile_id).filter(Boolean));
    const clients = allProfiles.filter((profile) => profile.role === "client" && !professionalProfileIds.has(profile.id));

    empty.users.total = allProfiles.length;
    empty.users.clients = clients.length;
    empty.users.pros = proRows.length;
    empty.users.verifiedPros = proRows.filter((p) => p.verification_status === "verified").length;

    proCreated = proRows.map((p) => p.created_at as string);
    clientCreated = clients.map((c) => c.created_at as string);
    const proReg = bucketByDay(proRows.map((p) => p.created_at as string), days30);
    const cliReg = bucketByDay(clients.map((c) => c.created_at as string), days30);
    empty.users.reg30 = days30.map((d) => ({ date: d, pros: proReg[d], clients: cliReg[d] }));

    // Professionals breakdowns
    empty.pros.total = proRows.length;
    empty.pros.verified = proRows.filter((p) => p.verification_status === "verified").length;
    empty.pros.pending = proRows.filter((p) => p.verification_status === "pending" || p.verification_status === "under_appeal").length;
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
    supplyByCategory = catCounts;
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

    // Where registrations come from (migration 177). Separate query so an older
    // schema only empties this section.
    try {
      const { data: acq, error: acqError } = await admin
        .from("profiles")
        .select("id, role, created_at, acquisition_source, acquisition_medium, acquisition_campaign, acquisition_captured_at");
      if (acqError) throw acqError;
      const cut30 = now - 30 * DAY;
      const rows = new Map<string, AcquisitionRow>();
      const campaigns = new Map<string, AcquisitionCampaign>();
      let since: string | null = null;
      for (const profile of acq ?? []) {
        const isPro = professionalProfileIds.has(profile.id);
        const isClient = profile.role === "client" && !isPro;
        if (!isPro && !isClient) continue;
        const recent = new Date(profile.created_at as string).getTime() >= cut30;
        const source = (profile.acquisition_source as string | null) ?? null;
        if (!source) {
          empty.acquisition.untracked += 1;
          if (recent) empty.acquisition.untracked30 += 1;
          continue;
        }
        empty.acquisition.tracked += 1;
        if (recent) empty.acquisition.tracked30 += 1;
        const captured = (profile.acquisition_captured_at as string | null) ?? (profile.created_at as string);
        if (!since || captured < since) since = captured;
        const { key, label } = acquisitionLabel(source, (profile.acquisition_medium as string | null) ?? null);
        const row = rows.get(key) ?? { key, label, pros: 0, clients: 0, pros30: 0, clients30: 0 };
        if (isPro) { row.pros += 1; if (recent) row.pros30 += 1; } else { row.clients += 1; if (recent) row.clients30 += 1; }
        rows.set(key, row);
        const campaign = (profile.acquisition_campaign as string | null) ?? null;
        if (campaign) {
          const ck = `${source}|${campaign}`;
          const c = campaigns.get(ck) ?? { label: campaign, source: SOURCE_NAMES[source] ?? source, pros: 0, clients: 0 };
          if (isPro) c.pros += 1; else c.clients += 1;
          campaigns.set(ck, c);
        }
      }
      empty.acquisition.since = since;
      empty.acquisition.rows = [...rows.values()].sort((a, b) => (b.pros + b.clients) - (a.pros + a.clients));
      empty.acquisition.campaigns = [...campaigns.values()].sort((a, b) => (b.pros + b.clients) - (a.pros + a.clients));
    } catch { /* columns missing until migration 177 runs */ }
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
    requestCreated = [...bRows.map((b) => b.created_at as string), ...pRows.map((p) => p.created_at as string)];
    projectRowsForDemand = pRows.map((p) => ({ created_at: p.created_at as string, category_id: (p.category_id as string | null) ?? null }));

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

  // ── Support tickets ──
  try {
    const { data: tickets } = await admin.from("support_tickets").select("status, created_at");
    const tRows = tickets ?? [];
    empty.support.total = tRows.length;
    empty.support.byStatus = tally(tRows.map((t) => t.status as string), { open: "Pendiente", in_progress: "En proceso", resolved: "Resuelto" });
    const tBucket = bucketByDay(tRows.map((t) => t.created_at as string), days30);
    empty.support.series30 = days30.map((d) => ({ date: d, tickets: tBucket[d] }));
  } catch (e) { console.error("[reports] support", e); }

  // ── Plain-language insights: this week vs the previous one, the funnel,
  // demand vs supply per service and web vs app. Interaction rows of the last
  // 14 days are read directly; everything else reuses the rows above.
  try {
    const since14 = new Date(now - 14 * DAY).toISOString();
    const since30 = new Date(now - 30 * DAY).toISOString();
    const [{ data: recent }, { data: demandEvents }, { data: oldest }] = await Promise.all([
      admin.from("interaction_events").select("event_type, created_at, category_id, metadata").gte("created_at", since14),
      admin.from("interaction_events").select("event_type, category_id").gte("created_at", since30).in("event_type", ["search_performed", "profile_view", "service_request_started"]),
      admin.from("interaction_events").select("created_at").order("created_at", { ascending: true }).limit(1),
    ]);
    const events = (recent ?? []) as Array<{ event_type: string; created_at: string; category_id: string | null; metadata: Record<string, unknown> | null }>;
    const t7 = now - 7 * DAY;
    const inLast7 = (t: string) => new Date(t).getTime() >= t7;
    const inPrev7 = (t: string) => { const v = new Date(t).getTime(); return v < t7 && v >= now - 14 * DAY; };
    const countWeek = (times: string[]): WeekCompare => ({ now: times.filter(inLast7).length, prev: times.filter(inPrev7).length });
    const eventTimes = (types: string[]) => events.filter((e) => types.includes(e.event_type)).map((e) => e.created_at);
    const CONTACT_TYPES = ["whatsapp_click", "phone_click", "service_request_started", "external_link_click"];

    empty.insights.week = {
      pros: countWeek(proCreated),
      clients: countWeek(clientCreated),
      searches: countWeek(eventTimes(["search_performed"])),
      requests: countWeek(requestCreated),
      contacts: countWeek(eventTimes(CONTACT_TYPES)),
      applications: countWeek(eventTimes(["job_application_sent"])),
    };
    empty.insights.funnel = {
      searches: eventTimes(["search_performed"]).filter(inLast7).length,
      profileViews: eventTimes(["profile_view"]).filter(inLast7).length,
      contacts: eventTimes(CONTACT_TYPES).filter(inLast7).length,
      requests: requestCreated.filter(inLast7).length,
    };
    const platform = { web: 0, native: 0 };
    for (const e of events) {
      if (!inLast7(e.created_at)) continue;
      if (e.metadata && e.metadata.platform === "native") platform.native += 1; else platform.web += 1;
    }
    empty.insights.platform = platform;

    const demand = new Map<string, { searches: number; projects: number }>();
    const bump = (id: string | null | undefined, key: "searches" | "projects") => {
      if (!id) return;
      const entry = demand.get(id) ?? { searches: 0, projects: 0 };
      entry[key] += 1;
      demand.set(id, entry);
    };
    for (const e of (demandEvents ?? []) as Array<{ event_type: string; category_id: string | null }>) if (e.event_type === "search_performed") bump(e.category_id, "searches");
    for (const p of projectRowsForDemand) if (new Date(p.created_at).getTime() >= now - 30 * DAY) bump(p.category_id, "projects");
    empty.insights.demand = [...demand.entries()]
      .map(([id, d]) => {
        const supply = supplyByCategory.get(id) ?? 0;
        const total = d.searches + d.projects;
        return { id, label: getCategoryLabel(id, locale), demand: total, searches: d.searches, projects: d.projects, supply, gap: supply === 0 || total >= supply * 3 };
      })
      .sort((a, b) => b.demand - a.demand)
      .slice(0, 10);
    empty.insights.tracking = { since: (oldest?.[0] as { created_at?: string } | undefined)?.created_at ?? null, events14d: events.length };
  } catch (e) { console.error("[reports] insights", e); }

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
      favorite_add: "Perfiles agregados a favoritos",
      favorite_remove: "Perfiles eliminados de favoritos",
      profile_share: "Perfiles compartidos",
      external_link_click: "Enlaces externos",
      service_request_started: "Solicitudes iniciadas",
      service_request_created: "Solicitudes creadas",
      project_published: "Proyectos creados",
      proposal_sent: "Propuestas enviadas",
      proposal_accepted: "Propuestas aceptadas",
      review_created: "Reseñas recibidas",
      search_performed: "Búsquedas",
      job_view: "Vistas de empleos",
      job_application_sent: "Postulaciones enviadas",
      offer_view: "Vistas de ofertas",
      assistant_question: "Preguntas al asistente",
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
        serviceRequestsCreated: Number(item.service_requests_created) || 0,
        proposalsSent: Number(item.proposals_sent) || 0,
        proposalsAccepted: Number(item.proposals_accepted) || 0,
        reviewsReceived: Number(item.reviews_received) || 0,
        uniqueVisitors: Number(item.unique_visitors) || 0,
      };
    });
  } catch (e) { console.error("[reports] interactions", e); }

  return empty;
}
