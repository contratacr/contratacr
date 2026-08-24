import { NextResponse } from "next/server";
import { getApiAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { COST_SERVICES, findCostService, type CostService } from "@/lib/admin/cost-catalog";

// /api/admin/costs — what ContrataCR costs.
//
//  GET    the catalogue merged with the admin's overrides, the ledger, and the
//         totals the section shows (monthly recurring, lifetime, by category,
//         by month for the last twelve months).
//  POST   add a ledger entry.
//  DELETE ?id=  remove a ledger entry.
//  PATCH  update a service: real amounts, start date, usage note, notes.
//
// Lifetime spend of a recurring service = its monthly amount × the months
// since it started (+ annual amount × the years), plus every ledger entry.

export type CostEntryKind = "recurrente" | "unico" | "publicidad" | "contenido";
export type CostCurrency = "USD" | "CRC";

export type CostEntry = {
  id: string;
  kind: CostEntryKind;
  serviceId: string | null;
  vendor: string;
  description: string;
  amount: number;
  currency: CostCurrency;
  spentOn: string;
  quantity: number | null;
  notes: string | null;
  createdAt: string;
};

export type CostServiceView = CostService & {
  since: string | null;
  usageNote: string | null;
  usageUpdatedAt: string | null;
  notes: string | null;
  /** Recurring spend since `since` (USD), 0 for variable or dateless services. */
  lifetimeUsd: number;
  /** Money recorded in the ledger against this service, per currency. */
  ledgerUsd: number;
  ledgerCrc: number;
};

export type CostSummary = {
  monthlyRecurringUsd: number;
  annualRecurringUsd: number;
  lifetimeUsd: number;
  lifetimeCrc: number;
  adsUsd: number;
  adsCrc: number;
  contentCrc: number;
  contentUsd: number;
  byCategory: Array<{ category: string; usd: number; crc: number }>;
  byMonth: Array<{ month: string; usd: number; crc: number }>;
};

type ServiceRow = {
  service_id: string;
  monthly_usd: number | string | null;
  annual_usd: number | string | null;
  since: string | null;
  usage_note: string | null;
  usage_updated_at: string | null;
  notes: string | null;
};

type EntryRow = {
  id: string;
  kind: CostEntryKind;
  service_id: string | null;
  vendor: string;
  description: string;
  amount: number | string;
  currency: CostCurrency;
  spent_on: string;
  quantity: number | null;
  notes: string | null;
  created_at: string;
};

const KINDS = new Set<CostEntryKind>(["recurrente", "unico", "publicidad", "contenido"]);
const CURRENCIES = new Set<CostCurrency>(["USD", "CRC"]);

function num(value: number | string | null | undefined) {
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(n) ? (n as number) : 0;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

/** Whole months from `since` to today, counting the starting month. */
function monthsSince(since: string | null, today: Date) {
  if (!since) return 0;
  const start = new Date(`${since}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start > today) return 0;
  return (today.getUTCFullYear() - start.getUTCFullYear()) * 12 + (today.getUTCMonth() - start.getUTCMonth()) + 1;
}

function yearsSince(since: string | null, today: Date) {
  if (!since) return 0;
  const start = new Date(`${since}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start > today) return 0;
  return Math.floor(monthsSince(since, today) / 12) + 1;
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function lastMonths(count: number, today: Date) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function isoDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function payload() {
  const db = createAdminClient();
  const [servicesResult, entriesResult] = await Promise.all([
    db.from("admin_cost_services").select("service_id, monthly_usd, annual_usd, since, usage_note, usage_updated_at, notes"),
    db.from("admin_cost_entries").select("id, kind, service_id, vendor, description, amount, currency, spent_on, quantity, notes, created_at").order("spent_on", { ascending: false }).order("created_at", { ascending: false }),
  ]);
  if (servicesResult.error) throw servicesResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const overrides = new Map<string, ServiceRow>((servicesResult.data ?? []).map((row) => [row.service_id, row as ServiceRow]));
  const entries: CostEntry[] = ((entriesResult.data ?? []) as EntryRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    serviceId: row.service_id,
    vendor: row.vendor,
    description: row.description,
    amount: num(row.amount),
    currency: row.currency,
    spentOn: row.spent_on,
    quantity: row.quantity,
    notes: row.notes,
    createdAt: row.created_at,
  }));

  const today = new Date();
  const services: CostServiceView[] = COST_SERVICES.map((service) => {
    const row = overrides.get(service.id);
    const monthlyUsd = row && row.monthly_usd !== null ? num(row.monthly_usd) : service.monthlyUsd;
    const annualUsd = row && row.annual_usd !== null ? num(row.annual_usd) : service.annualUsd;
    const since = row?.since ?? null;
    const own = entries.filter((entry) => entry.serviceId === service.id);
    return {
      ...service,
      monthlyUsd,
      annualUsd,
      since,
      usageNote: row?.usage_note ?? null,
      usageUpdatedAt: row?.usage_updated_at ?? null,
      notes: row?.notes ?? null,
      lifetimeUsd: service.variable ? 0 : round(monthlyUsd * monthsSince(since, today) + annualUsd * yearsSince(since, today)),
      ledgerUsd: round(own.filter((e) => e.currency === "USD").reduce((sum, e) => sum + e.amount, 0)),
      ledgerCrc: round(own.filter((e) => e.currency === "CRC").reduce((sum, e) => sum + e.amount, 0)),
    };
  });

  const sum = (list: CostEntry[], currency: CostCurrency) => round(list.filter((e) => e.currency === currency).reduce((s, e) => s + e.amount, 0));
  const ads = entries.filter((e) => e.kind === "publicidad");
  const content = entries.filter((e) => e.kind === "contenido");

  // By category: recurring lifetime per service plus ledger entries (an entry
  // without a service counts under the kind's natural category).
  const categoryTotals = new Map<string, { usd: number; crc: number }>();
  const add = (category: string, usd: number, crc: number) => {
    const current = categoryTotals.get(category) ?? { usd: 0, crc: 0 };
    categoryTotals.set(category, { usd: round(current.usd + usd), crc: round(current.crc + crc) });
  };
  for (const service of services) add(service.category, service.lifetimeUsd, 0);
  for (const entry of entries) {
    const category = (entry.serviceId && findCostService(entry.serviceId)?.category)
      || (entry.kind === "publicidad" ? "marketing" : entry.kind === "contenido" ? "contenido" : "herramientas");
    add(category, entry.currency === "USD" ? entry.amount : 0, entry.currency === "CRC" ? entry.amount : 0);
  }

  // By month (last twelve): recurring services active that month plus ledger.
  const months = lastMonths(12, today);
  const byMonth = months.map((month) => {
    let usd = 0;
    let crc = 0;
    for (const service of services) {
      if (service.variable || !service.since) continue;
      if (monthKey(service.since) <= month) usd += service.monthlyUsd;
      if (service.annualUsd > 0 && monthKey(service.since).slice(5) === month.slice(5) && monthKey(service.since) <= month) usd += service.annualUsd;
    }
    for (const entry of entries) {
      if (monthKey(entry.spentOn) !== month) continue;
      if (entry.currency === "USD") usd += entry.amount;
      else crc += entry.amount;
    }
    return { month, usd: round(usd), crc: round(crc) };
  });

  const summary: CostSummary = {
    monthlyRecurringUsd: round(services.filter((s) => !s.variable).reduce((s, x) => s + x.monthlyUsd, 0)),
    annualRecurringUsd: round(services.filter((s) => !s.variable).reduce((s, x) => s + x.annualUsd, 0)),
    lifetimeUsd: round(services.reduce((s, x) => s + x.lifetimeUsd, 0) + sum(entries, "USD")),
    lifetimeCrc: sum(entries, "CRC"),
    adsUsd: sum(ads, "USD"),
    adsCrc: sum(ads, "CRC"),
    contentUsd: sum(content, "USD"),
    contentCrc: sum(content, "CRC"),
    byCategory: [...categoryTotals.entries()].map(([category, totals]) => ({ category, ...totals })),
    byMonth,
  };

  return { services, entries, summary };
}

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  try {
    return NextResponse.json(await payload());
  } catch (error) {
    console.error("[admin/costs] load failed", error);
    return NextResponse.json({ error: "No se pudieron cargar los costos." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const kind = body.kind as CostEntryKind;
  const currency = body.currency as CostCurrency;
  const amount = Number(body.amount);
  const spentOn = isoDate(body.spentOn);
  const vendor = text(body.vendor, 120);
  const description = text(body.description, 240);
  const quantity = body.quantity === null || body.quantity === undefined || body.quantity === "" ? null : Number(body.quantity);
  const serviceId = typeof body.serviceId === "string" && findCostService(body.serviceId) ? body.serviceId : null;
  if (!KINDS.has(kind)) return NextResponse.json({ error: "Tipo de gasto inválido." }, { status: 400 });
  if (!CURRENCIES.has(currency)) return NextResponse.json({ error: "Moneda inválida." }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: "El monto debe ser un número mayor o igual a cero." }, { status: 400 });
  if (!spentOn) return NextResponse.json({ error: "La fecha es obligatoria." }, { status: 400 });
  if (!vendor || !description) return NextResponse.json({ error: "Proveedor y descripción son obligatorios." }, { status: 400 });
  if (quantity !== null && (!Number.isInteger(quantity) || quantity <= 0)) return NextResponse.json({ error: "La cantidad debe ser un entero mayor que cero." }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("admin_cost_entries").insert({
    kind,
    service_id: serviceId,
    vendor,
    description,
    amount: round(amount),
    currency,
    spent_on: spentOn,
    quantity,
    notes: text(body.notes, 500) || null,
    created_by: admin.id,
  });
  if (error) {
    console.error("[admin/costs] insert failed", error);
    return NextResponse.json({ error: "No se pudo guardar el gasto." }, { status: 500 });
  }
  return NextResponse.json(await payload());
}

export async function DELETE(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta el identificador." }, { status: 400 });
  const db = createAdminClient();
  const { error } = await db.from("admin_cost_entries").delete().eq("id", id);
  if (error) {
    console.error("[admin/costs] delete failed", error);
    return NextResponse.json({ error: "No se pudo eliminar el gasto." }, { status: 500 });
  }
  return NextResponse.json(await payload());
}

export async function PATCH(request: Request) {
  const admin = await getApiAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const serviceId = typeof body.serviceId === "string" ? body.serviceId : "";
  if (!findCostService(serviceId)) return NextResponse.json({ error: "Servicio desconocido." }, { status: 400 });
  const update: Record<string, unknown> = { service_id: serviceId, updated_at: new Date().toISOString() };
  if ("monthlyUsd" in body) {
    const v = body.monthlyUsd === null || body.monthlyUsd === "" ? null : Number(body.monthlyUsd);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: "Monto mensual inválido." }, { status: 400 });
    update.monthly_usd = v;
  }
  if ("annualUsd" in body) {
    const v = body.annualUsd === null || body.annualUsd === "" ? null : Number(body.annualUsd);
    if (v !== null && (!Number.isFinite(v) || v < 0)) return NextResponse.json({ error: "Monto anual inválido." }, { status: 400 });
    update.annual_usd = v;
  }
  if ("since" in body) {
    if (body.since !== null && body.since !== "" && !isoDate(body.since)) return NextResponse.json({ error: "Fecha de inicio inválida." }, { status: 400 });
    update.since = body.since ? body.since : null;
  }
  if ("usageNote" in body) {
    update.usage_note = text(body.usageNote, 300) || null;
    update.usage_updated_at = new Date().toISOString();
  }
  if ("notes" in body) update.notes = text(body.notes, 1000) || null;
  const db = createAdminClient();
  const { error } = await db.from("admin_cost_services").upsert(update, { onConflict: "service_id" });
  if (error) {
    console.error("[admin/costs] service update failed", error);
    return NextResponse.json({ error: "No se pudo guardar el servicio." }, { status: 500 });
  }
  return NextResponse.json(await payload());
}
