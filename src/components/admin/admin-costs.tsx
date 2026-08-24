"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Check, ExternalLink, Loader2, Megaphone, Pencil, Plus, Receipt, Trash2, Wallet, X } from "lucide-react";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { cn } from "@/lib/utils";
import { COST_CATEGORY_LABELS, COST_SERVICES, CONTENT_RATES_CRC, type CostCategory } from "@/lib/admin/cost-catalog";
import type { CostEntry, CostEntryKind, CostCurrency, CostServiceView, CostSummary } from "@/app/api/admin/costs/route";

// Costos — what ContrataCR costs, in one place.
//
//  Resumen      the monthly bill, everything spent since the start, ads and
//               content, and the last twelve months as bars.
//  Tecnologías  every service the product runs on: what it does, what it
//               costs, where its free allowance ends and what happens then,
//               the date it started and a note of this month's usage.
//  Movimientos  the ledger — one-off purchases, ad spend and content pieces —
//               with a form that knows the content rates.
//
// Amounts stay in the currency they were paid in (USD or colones); nothing is
// converted, so the totals are always exact.

type Payload = { services: CostServiceView[]; entries: CostEntry[]; summary: CostSummary };

const TABS = [
  { id: "resumen", label: "Resumen" },
  { id: "tecnologias", label: "Tecnologías y límites" },
  { id: "movimientos", label: "Movimientos" },
] as const;

const KIND_LABELS: Record<CostEntryKind, string> = {
  recurrente: "Suscripción",
  unico: "Pago único",
  publicidad: "Publicidad",
  contenido: "Contenido",
};

const CATEGORY_ORDER: CostCategory[] = ["infraestructura", "datos", "herramientas", "movil", "marketing", "contenido"];

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: value % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const crc = (value: number) => `₡${value.toLocaleString("es-CR", { maximumFractionDigits: 0 })}`;
const money = (value: number, currency: CostCurrency) => (currency === "USD" ? usd(value) : crc(value));
const both = (usdValue: number, crcValue: number) => [usdValue > 0 ? usd(usdValue) : null, crcValue > 0 ? crc(crcValue) : null].filter(Boolean).join(" + ") || "$0";
const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).replace(".", "");
const today = () => new Date().toISOString().slice(0, 10);

function Tile({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-white p-3", accent ? "border-[#009FD9]/40 bg-[#f0f9ff]" : "border-[#e5e7eb]")}>
      <p className="text-xl font-bold leading-none tabular-nums text-[#0f172a] sm:text-2xl">{value}</p>
      <p className="mt-1.5 text-xs text-[#64748b]">{label}</p>
      {hint && <p className="text-[11px] text-[#94a3b8]">{hint}</p>}
    </div>
  );
}

async function send(method: "POST" | "PATCH" | "DELETE", body?: unknown, query = "") {
  const res = await fetch(`/api/admin/costs${query}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "No se pudo guardar.");
  return json as Payload;
}

export function AdminCosts() {
  const { data, loading, refresh, setData } = useCachedResource<Payload | null>(
    "admin:costs",
    async () => {
      const res = await fetch("/api/admin/costs", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Payload;
    },
    null,
  );
  useAdminAutoRefresh(() => void refresh(), [refresh]);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("resumen");
  const [notice, setNotice] = useState<string | null>(null);

  const apply = useCallback(async (work: () => Promise<Payload>) => {
    setNotice(null);
    try {
      setData(await work());
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo guardar.");
      return false;
    }
  }, [setData]);

  return (
    <div>
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e0f4fb] text-[#009FD9]"><Wallet className="h-5 w-5" /></div>
        <div>
          <h1 className="text-lg font-bold text-[#0f172a]">Costos</h1>
          <p className="text-sm text-[#64748b]">Cuánto cuesta ContrataCR, con qué tecnologías funciona y dónde termina lo gratis de cada una.</p>
        </div>
      </div>

      <AdminFilterTabs tabs={TABS} value={tab} onChange={(id) => setTab(id as typeof tab)} />

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Cerrar" className="text-red-500"><X className="h-4 w-4" /></button>
        </div>
      )}

      {loading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : tab === "resumen" ? (
        <Summary data={data} />
      ) : tab === "tecnologias" ? (
        <Technologies services={data.services} apply={apply} />
      ) : (
        <Ledger entries={data.entries} apply={apply} />
      )}
    </div>
  );
}

function Summary({ data }: { data: Payload }) {
  const { summary, services } = data;
  const recurring = services.filter((s) => !s.variable && (s.monthlyUsd > 0 || s.annualUsd > 0));
  const withoutStart = recurring.filter((s) => !s.since);
  const maxMonth = Math.max(1, ...summary.byMonth.map((m) => m.usd + m.crc / 500));
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Cada mes" value={usd(summary.monthlyRecurringUsd)} hint={summary.annualRecurringUsd > 0 ? `+ ${usd(summary.annualRecurringUsd)} al año en renovaciones` : undefined} accent />
        <Tile label="Gastado desde el inicio" value={both(summary.lifetimeUsd, summary.lifetimeCrc)} hint="suscripciones desde su fecha de inicio + movimientos" />
        <Tile label="Publicidad" value={both(summary.adsUsd, summary.adsCrc)} hint="Meta y otras campañas registradas" />
        <Tile label="Contenido en redes" value={both(summary.contentUsd, summary.contentCrc)} hint="publicaciones, destacadas y videos" />
      </div>

      {withoutStart.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Para calcular lo gastado desde el inicio falta la fecha en que empezó a pagarse: {withoutStart.map((s) => s.name).join(", ")}. Se pone en «Tecnologías y límites».
        </div>
      )}

      <section className="mb-4 rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <h2 className="mb-3 text-sm font-bold text-[#0f172a]">Últimos doce meses</h2>
        <div className="flex h-40 items-end gap-1.5 sm:gap-2">
          {summary.byMonth.map((m) => {
            const value = m.usd + m.crc / 500;
            const height = Math.max(value > 0 ? 6 : 2, Math.round((value / maxMonth) * 100));
            return (
              <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(m.month)}: ${both(m.usd, m.crc)}`}>
                <span className="hidden text-[10px] tabular-nums text-[#64748b] sm:block">{m.usd > 0 || m.crc > 0 ? both(m.usd, m.crc) : ""}</span>
                <div className="w-full rounded-t-md bg-[#009FD9]" style={{ height: `${height}%` }} aria-hidden />
                <span className="text-[10px] text-[#94a3b8]">{monthLabel(m.month)}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-[#94a3b8]">Cada barra suma las suscripciones activas ese mes más los movimientos registrados. Los colones se muestran junto a los dólares, no se convierten.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-[#0f172a]">La factura de cada mes</h2>
          <ul className="divide-y divide-[#f1f5f9]">
            {recurring.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#0f172a]">{s.name}</p>
                  <p className="truncate text-xs text-[#64748b]">{s.plan}</p>
                </div>
                <p className="shrink-0 tabular-nums text-[#0f172a]">
                  {s.monthlyUsd > 0 ? `${usd(s.monthlyUsd)}/mes` : ""}{s.monthlyUsd > 0 && s.annualUsd > 0 ? " · " : ""}{s.annualUsd > 0 ? `${usd(s.annualUsd)}/año` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <h2 className="mb-3 text-sm font-bold text-[#0f172a]">Desde el inicio, por rubro</h2>
          <ul className="divide-y divide-[#f1f5f9]">
            {CATEGORY_ORDER.map((category) => {
              const row = summary.byCategory.find((c) => c.category === category);
              return (
                <li key={category} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-[#0f172a]">{COST_CATEGORY_LABELS[category]}</span>
                  <span className="tabular-nums text-[#0f172a]">{row ? both(row.usd, row.crc) : "$0"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

function Technologies({ services, apply }: { services: CostServiceView[]; apply: (work: () => Promise<Payload>) => Promise<boolean> }) {
  return (
    <div className="space-y-6">
      {CATEGORY_ORDER.map((category) => {
        const list = services.filter((s) => s.category === category);
        if (list.length === 0) return null;
        return (
          <section key={category}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#64748b]">{COST_CATEGORY_LABELS[category]}</h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {list.map((service) => <ServiceCard key={service.id} service={service} apply={apply} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ServiceCard({ service, apply }: { service: CostServiceView; apply: (work: () => Promise<Payload>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ monthlyUsd: String(service.monthlyUsd), annualUsd: String(service.annualUsd), since: service.since ?? "", usageNote: service.usageNote ?? "", notes: service.notes ?? "" });
  const cost = service.variable
    ? "Variable"
    : [service.monthlyUsd > 0 ? `${usd(service.monthlyUsd)}/mes` : null, service.annualUsd > 0 ? `${usd(service.annualUsd)}/año` : null].filter(Boolean).join(" · ") || "Gratis";

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await apply(() => send("PATCH", { serviceId: service.id, monthlyUsd: form.monthlyUsd, annualUsd: form.annualUsd, since: form.since, usageNote: form.usageNote, notes: form.notes }));
    setBusy(false);
    if (ok) setEditing(false);
  }

  return (
    <article className="rounded-2xl border border-[#e5e7eb] bg-white p-4" data-cost-service={service.id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-[#0f172a]">{service.name}</h3>
          <p className="text-xs text-[#64748b]">{service.plan}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums text-[#0f172a]">{cost}</p>
          {service.verify && !service.since && <p className="text-[11px] text-amber-700">Monto por confirmar</p>}
        </div>
      </div>
      <p className="mt-2 text-sm text-[#374151]">{service.role}</p>
      <dl className="mt-3 space-y-2 rounded-xl bg-[#f8fafc] p-3 text-sm">
        <div><dt className="text-xs font-semibold text-[#64748b]">Incluido</dt><dd className="text-[#0f172a]">{service.limit.included}</dd></div>
        <div><dt className="text-xs font-semibold text-[#64748b]">Si se pasa</dt><dd className="text-[#0f172a]">{service.limit.beyond}</dd></div>
      </dl>
      {editing ? (
        <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
          {!service.variable && (
            <>
              <label className="block text-xs font-semibold text-[#374151]">Al mes (USD)
                <input type="number" min="0" step="0.01" value={form.monthlyUsd} onChange={(e) => setForm({ ...form, monthlyUsd: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
              </label>
              <label className="block text-xs font-semibold text-[#374151]">Al año (USD)
                <input type="number" min="0" step="0.01" value={form.annualUsd} onChange={(e) => setForm({ ...form, annualUsd: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
              </label>
            </>
          )}
          <label className="block text-xs font-semibold text-[#374151]">Se paga desde
            <input type="date" value={form.since} onChange={(e) => setForm({ ...form, since: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151]">Uso de este mes
            <input value={form.usageNote} onChange={(e) => setForm({ ...form, usageNote: e.target.value })} placeholder="p. ej. 1 240 de 2 000 minutos" className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151] sm:col-span-2">Notas
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#009FD9] px-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Guardar</button>
            <button type="button" onClick={() => setEditing(false)} className="inline-flex h-9 items-center rounded-lg border border-[#e5e7eb] px-3 text-sm font-semibold text-[#374151]">Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748b]">
          <div className="space-y-0.5">
            <p>{service.since ? `Se paga desde ${dateLabel(service.since)}` : service.variable ? "Se registra por pieza en Movimientos" : "Sin fecha de inicio"}{!service.variable && service.lifetimeUsd > 0 ? ` · ${usd(service.lifetimeUsd)} acumulados` : ""}{service.ledgerUsd > 0 || service.ledgerCrc > 0 ? ` · ${both(service.ledgerUsd, service.ledgerCrc)} en movimientos` : ""}</p>
            <p>{service.usageNote ? <>Uso: <span className="font-semibold text-[#0f172a]">{service.usageNote}</span>{service.usageUpdatedAt ? ` (${dateLabel(service.usageUpdatedAt.slice(0, 10))})` : ""}</> : "Uso de este mes: sin anotar"}</p>
            {service.notes && <p>{service.notes}</p>}
          </div>
          <div className="flex items-center gap-2">
            {service.usageUrl && (
              <a href={service.usageUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e5e7eb] px-2.5 font-semibold text-[#009FD9]">Ver uso <ExternalLink className="h-3.5 w-3.5" /></a>
            )}
            <button type="button" onClick={() => setEditing(true)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#e5e7eb] px-2.5 font-semibold text-[#374151]"><Pencil className="h-3.5 w-3.5" /> Editar</button>
          </div>
        </div>
      )}
    </article>
  );
}

type EntryForm = { kind: CostEntryKind; serviceId: string; vendor: string; description: string; amount: string; currency: CostCurrency; spentOn: string; quantity: string; notes: string };

const EMPTY_FORM: EntryForm = { kind: "publicidad", serviceId: "meta-ads", vendor: "Meta", description: "", amount: "", currency: "USD", spentOn: today(), quantity: "", notes: "" };

function Ledger({ entries, apply }: { entries: CostEntry[]; apply: (work: () => Promise<Payload>) => Promise<boolean> }) {
  const [filter, setFilter] = useState<"todos" | CostEntryKind>("todos");
  const [form, setForm] = useState<EntryForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const filtered = useMemo(() => (filter === "todos" ? entries : entries.filter((e) => e.kind === filter)), [entries, filter]);
  const counts = useMemo(() => ({ todos: entries.length, ...Object.fromEntries((Object.keys(KIND_LABELS) as CostEntryKind[]).map((k) => [k, entries.filter((e) => e.kind === k).length])) }), [entries]);

  function preset(kind: "publicacion" | "video") {
    const count = Math.max(1, Number(form.quantity) || 1);
    setForm({
      ...form,
      kind: "contenido",
      serviceId: "sharon-content",
      vendor: "Sharon Velásquez",
      description: kind === "video" ? `Video${count > 1 ? `s (${count})` : ""}` : `Publicación${count > 1 ? `es (${count})` : ""}`,
      amount: String(CONTENT_RATES_CRC[kind] * count),
      currency: "CRC",
      quantity: String(count),
    });
  }

  function pickService(serviceId: string) {
    const service = COST_SERVICES.find((s) => s.id === serviceId);
    setForm({
      ...form,
      serviceId,
      vendor: service ? service.name.replace(/\s*\(.*\)$/, "") : form.vendor,
      currency: service?.currency ?? form.currency,
      kind: service?.category === "marketing" ? "publicidad" : service?.category === "contenido" ? "contenido" : form.kind === "publicidad" || form.kind === "contenido" ? "unico" : form.kind,
    });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const ok = await apply(() => send("POST", { ...form, serviceId: form.serviceId || null, quantity: form.quantity || null }));
    setBusy(false);
    if (ok) setForm({ ...EMPTY_FORM, kind: form.kind, serviceId: form.serviceId, vendor: form.vendor, currency: form.currency, spentOn: form.spentOn });
  }

  async function remove(entry: CostEntry) {
    if (!window.confirm(`¿Eliminar «${entry.description}» (${money(entry.amount, entry.currency)})?`)) return;
    setDeleting(entry.id);
    await apply(() => send("DELETE", undefined, `?id=${encodeURIComponent(entry.id)}`));
    setDeleting(null);
  }

  const totals = { usd: filtered.filter((e) => e.currency === "USD").reduce((s, e) => s + e.amount, 0), crc: filtered.filter((e) => e.currency === "CRC").reduce((s, e) => s + e.amount, 0) };

  return (
    <>
      <section className="mb-4 rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4 text-[#009FD9]" />
          <h2 className="text-sm font-bold text-[#0f172a]">Registrar un gasto</h2>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => preset("publicacion")} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 text-xs font-semibold text-[#374151]"><Receipt className="h-3.5 w-3.5" /> Publicación o destacada · ₡10 000</button>
          <button type="button" onClick={() => preset("video")} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 text-xs font-semibold text-[#374151]"><Receipt className="h-3.5 w-3.5" /> Video · ₡20 000</button>
          <button type="button" onClick={() => pickService("meta-ads")} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-[#f8fafc] px-3 text-xs font-semibold text-[#374151]"><Megaphone className="h-3.5 w-3.5" /> Gasto en Meta Ads</button>
        </div>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-xs font-semibold text-[#374151]">Tipo
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as CostEntryKind })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm">
              {(Object.keys(KIND_LABELS) as CostEntryKind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[#374151]">Servicio
            <select value={form.serviceId} onChange={(e) => pickService(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm">
              <option value="">Otro</option>
              {COST_SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[#374151]">A quién se pagó
            <input required value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151]">Fecha
            <input required type="date" value={form.spentOn} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151] sm:col-span-2">Descripción
            <input required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="p. ej. Campaña Clientes - Registro, del 23 al 31 de agosto" className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151]">Monto
            <div className="mt-1 flex gap-2">
              <select aria-label="Moneda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as CostCurrency })} className="h-10 rounded-lg border border-[#e5e7eb] bg-white px-2 text-sm">
                <option value="USD">$</option>
                <option value="CRC">₡</option>
              </select>
              <input required type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
            </div>
          </label>
          <label className="block text-xs font-semibold text-[#374151]">Cantidad (opcional)
            <input type="number" min="1" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="piezas" className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <label className="block text-xs font-semibold text-[#374151] sm:col-span-2 lg:col-span-3">Notas (opcional)
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1 h-10 w-full rounded-lg border border-[#e5e7eb] px-3 text-sm" />
          </label>
          <div className="flex items-end">
            <button type="submit" disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-[#009FD9] px-4 text-sm font-semibold text-white disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Guardar gasto</button>
          </div>
        </form>
      </section>

      <AdminFilterTabs tabs={[{ id: "todos", label: "Todos" }, ...(Object.keys(KIND_LABELS) as CostEntryKind[]).map((k) => ({ id: k, label: KIND_LABELS[k] }))]} value={filter} onChange={(id) => setFilter(id as typeof filter)} counts={counts} />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#e5e7eb] px-4 py-10 text-center text-sm text-[#64748b]">Todavía no hay movimientos registrados{filter !== "todos" ? " de este tipo" : ""}.</div>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
          <div className="flex items-center justify-between border-b border-[#f1f5f9] px-4 py-2.5 text-sm">
            <p className="font-bold text-[#0f172a]">{filtered.length} movimiento{filtered.length === 1 ? "" : "s"}</p>
            <p className="tabular-nums text-[#0f172a]">{both(totals.usd, totals.crc)}</p>
          </div>
          <ul className="divide-y divide-[#f1f5f9]">
            {filtered.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#0f172a]">{entry.description}</p>
                  <p className="truncate text-xs text-[#64748b]">{dateLabel(entry.spentOn)} · {entry.vendor} · {KIND_LABELS[entry.kind]}{entry.quantity ? ` · ${entry.quantity} pieza${entry.quantity === 1 ? "" : "s"}` : ""}{entry.notes ? ` · ${entry.notes}` : ""}</p>
                </div>
                <p className="shrink-0 tabular-nums font-semibold text-[#0f172a]">{money(entry.amount, entry.currency)}</p>
                <button type="button" onClick={() => remove(entry)} disabled={deleting === entry.id} aria-label={`Eliminar ${entry.description}`} className="shrink-0 rounded-lg p-1.5 text-[#94a3b8] hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                  {deleting === entry.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
