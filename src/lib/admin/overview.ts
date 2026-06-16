import { createAdminClient } from "@/lib/supabase/admin";
import { getProvinceById } from "@/lib/data/cr-geography";
import { getCategoryLabel } from "@/lib/data/categories";

// ── Server-side aggregation for the admin "Resumen" (overview) dashboard. ──
// Real counts + daily series derived from professionals / profiles / bookings.
// Best-effort and resilient: any failure degrades to zeros so /admin never 500s.

export type Kpi = { value: number; deltaPct: number | null; spark: number[] };
export type GrowthPoint = { date: string; pros: number; clients: number };
export type SignupItem = { id: string; name: string; role: "professional" | "client"; meta: string; createdAt: string };
export type PendingItem = { id: string; slug: string | null; name: string; category: string; createdAt: string };
export type RankItem = { label: string; value: number };

export type AdminOverview = {
  newPros: Kpi;
  newClients: Kpi;
  servicios: Kpi;
  verificationRate: Kpi;     // value is a percentage 0–100
  growth: GrowthPoint[];     // last 14 days
  recentSignups: SignupItem[];
  pending: PendingItem[];
  pendingCount: number;
  topCategories: RankItem[];
  byProvince: RankItem[];
};

const DAY = 86400000;

function emptyKpi(): Kpi { return { value: 0, deltaPct: null, spark: [] }; }
function emptyOverview(): AdminOverview {
  return {
    newPros: emptyKpi(), newClients: emptyKpi(), servicios: emptyKpi(), verificationRate: emptyKpi(),
    growth: [], recentSignups: [], pending: [], pendingCount: 0, topCategories: [], byProvince: [],
  };
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function deltaPct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 100);
}
// New rows per local day over the last `n` days (oldest → newest).
function dailyCounts(times: number[], n: number, now: number): number[] {
  const out = new Array(n).fill(0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const startKey = today.getTime() - (n - 1) * DAY;
  for (const t of times) {
    const d = new Date(t); d.setHours(0, 0, 0, 0);
    const idx = Math.round((d.getTime() - startKey) / DAY);
    if (idx >= 0 && idx < n) out[idx] += 1;
  }
  return out;
}

type ProRow = {
  id: string; slug: string | null; created_at: string; verification_status: string | null;
  category_id: string | null; provincia_id: string | null;
  professions: string[] | null; profiles: { full_name?: string } | null;
};
type ClientRow = { id: string; created_at: string; full_name: string | null };
type BookingRow = { created_at: string };

export async function getAdminOverview(locale = "es"): Promise<AdminOverview> {
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const last7 = now - 7 * DAY, prev7 = now - 14 * DAY;
    const last30 = now - 30 * DAY, prev30 = now - 60 * DAY;

    const [prosRes, clientsRes, bookingsRes] = await Promise.all([
      admin.from("professionals").select("id, slug, created_at, verification_status, category_id, provincia_id, professions, profiles(full_name)").order("created_at", { ascending: false }),
      admin.from("profiles").select("id, created_at, full_name").eq("role", "client").order("created_at", { ascending: false }),
      admin.from("bookings").select("created_at").order("created_at", { ascending: false }),
    ]);

    const pros = (prosRes.data ?? []) as unknown as ProRow[];
    const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
    const bookings = (bookingsRes.data ?? []) as unknown as BookingRow[];

    const proTimes = pros.map((p) => new Date(p.created_at).getTime()).filter((n) => !isNaN(n));
    const clientTimes = clients.map((c) => new Date(c.created_at).getTime()).filter((n) => !isNaN(n));
    const bookingTimes = bookings.map((b) => new Date(b.created_at).getTime()).filter((n) => !isNaN(n));

    const inWindow = (times: number[], a: number, b: number) => times.filter((t) => t >= a && t < b).length;

    // KPI 1 — Nuevos profesionales (last 7 vs prior 7)
    const prosNew7 = inWindow(proTimes, last7, now);
    const newPros: Kpi = { value: prosNew7, deltaPct: deltaPct(prosNew7, inWindow(proTimes, prev7, last7)), spark: dailyCounts(proTimes, 7, now) };

    // KPI 2 — Nuevos clientes (last 7 vs prior 7)
    const clientsNew7 = inWindow(clientTimes, last7, now);
    const newClients: Kpi = { value: clientsNew7, deltaPct: deltaPct(clientsNew7, inWindow(clientTimes, prev7, last7)), spark: dailyCounts(clientTimes, 7, now) };

    // KPI 3 — Servicios facilitados (last 30 vs prior 30)
    const serv30 = inWindow(bookingTimes, last30, now);
    const servicios: Kpi = { value: serv30, deltaPct: deltaPct(serv30, inWindow(bookingTimes, prev30, last30)), spark: dailyCounts(bookingTimes, 7, now) };

    // KPI 4 — Tasa de verificación (% verified now; delta = recent cohort vs prior cohort)
    const isVerified = (p: ProRow) => p.verification_status === "verified";
    const totalPros = pros.length;
    const verifiedNow = pros.filter(isVerified).length;
    const rateNow = totalPros > 0 ? Math.round((verifiedNow / totalPros) * 100) : 0;
    const cohortRate = (a: number, b: number) => {
      const cohort = pros.filter((p) => { const t = new Date(p.created_at).getTime(); return t >= a && t < b; });
      if (cohort.length === 0) return null;
      return (cohort.filter(isVerified).length / cohort.length) * 100;
    };
    const rRecent = cohortRate(last30, now), rPrior = cohortRate(prev30, last30);
    const verifDelta = rRecent != null && rPrior != null && rPrior > 0 ? Math.round(rRecent - rPrior) : null;
    // Sparkline: cumulative verification rate over the last 7 days.
    const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
    const verifSpark: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const cutoff = today0.getTime() - i * DAY + DAY; // end of that day
      const upto = pros.filter((p) => new Date(p.created_at).getTime() < cutoff);
      verifSpark.push(upto.length ? Math.round((upto.filter(isVerified).length / upto.length) * 100) : 0);
    }
    const verificationRate: Kpi = { value: rateNow, deltaPct: verifDelta, spark: verifSpark };

    // Growth — last 14 days, two series
    const prosDaily14 = dailyCounts(proTimes, 14, now);
    const clientsDaily14 = dailyCounts(clientTimes, 14, now);
    const growth: GrowthPoint[] = [];
    const start14 = today0.getTime() - 13 * DAY;
    for (let i = 0; i < 14; i++) {
      growth.push({ date: dayKey(new Date(start14 + i * DAY)), pros: prosDaily14[i], clients: clientsDaily14[i] });
    }

    // Altas recientes — merge pros + clients, newest first
    const proSignups: SignupItem[] = pros.map((p) => ({
      id: p.id,
      name: p.profiles?.full_name || "Profesional",
      role: "professional",
      meta: [p.category_id ? getCategoryLabel(p.category_id, locale) : null, p.provincia_id ? getProvinceById(p.provincia_id)?.name : null].filter(Boolean).join(" · "),
      createdAt: p.created_at,
    }));
    const clientSignups: SignupItem[] = clients.map((c) => ({
      id: c.id, name: c.full_name || "Cliente", role: "client", meta: "", createdAt: c.created_at,
    }));
    const recentSignups = [...proSignups, ...clientSignups]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);

    // Verificación pendiente — not verified / not rejected
    const pendingPros = pros.filter((p) => p.verification_status && p.verification_status !== "verified" && p.verification_status !== "rejected");
    const pending: PendingItem[] = pendingPros.slice(0, 3).map((p) => ({
      id: p.id, slug: p.slug, name: p.profiles?.full_name || "Profesional",
      category: p.category_id ? getCategoryLabel(p.category_id, locale) : "", createdAt: p.created_at,
    }));

    // Rankings (real data): categories by # of professionals, provinces by # of professionals
    const catCounts = new Map<string, number>();
    for (const p of pros) {
      const ids = new Set<string>();
      if (p.category_id) ids.add(p.category_id);
      for (const c of p.professions ?? []) if (c) ids.add(c);
      for (const id of ids) catCounts.set(id, (catCounts.get(id) ?? 0) + 1);
    }
    const topCategories: RankItem[] = [...catCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, value]) => ({ label: getCategoryLabel(id, locale), value }));

    const provCounts = new Map<string, number>();
    for (const p of pros) if (p.provincia_id) provCounts.set(p.provincia_id, (provCounts.get(p.provincia_id) ?? 0) + 1);
    const byProvince: RankItem[] = [...provCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([id, value]) => ({ label: getProvinceById(id)?.name ?? id, value }));

    return {
      newPros, newClients, servicios, verificationRate,
      growth, recentSignups, pending, pendingCount: pendingPros.length, topCategories, byProvince,
    };
  } catch (err) {
    console.error("[getAdminOverview]", err);
    return emptyOverview();
  }
}
