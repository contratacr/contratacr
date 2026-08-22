"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BadgePercent, Briefcase, ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { cn, getInitials } from "@/lib/utils";

type Creator = {
  id: string;
  profileId: string | null;
  slug: string | null;
  name: string;
  personName: string | null;
  email: string | null;
  avatarUrl: string | null;
  verified: boolean;
};

type JobItem = {
  kind: "job";
  id: string;
  title: string;
  status: string;
  category: string | null;
  place: string;
  employmentType: string | null;
  workplaceType: string | null;
  salary: { min: number | null; max: number | null; period: string | null; currency: string } | null;
  openings: number;
  deadline: string | null;
  applications: number;
  createdAt: string;
  updatedAt: string | null;
  creator: Creator | null;
  href: string;
};

type OfferItem = {
  kind: "offer";
  id: string;
  title: string;
  status: string;
  category: string | null;
  place: string;
  offerType: string | null;
  image: string | null;
  price: { now: number | null; before: number | null; unit: string | null; currency: string };
  quantity: number | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string | null;
  creator: Creator | null;
  href: string;
};

type Item = JobItem | OfferItem;
type Pagination = { page: number; pageSize: number; total: number; pages: number };

const JOB_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "published", label: "Publicados" },
  { id: "paused", label: "Pausados" },
  { id: "closed", label: "Cerrados" },
  { id: "draft", label: "Borradores" },
] as const;

const OFFER_FILTERS = [
  { id: "all", label: "Todas" },
  { id: "published", label: "Publicadas" },
  { id: "paused", label: "Pausadas" },
  { id: "expired", label: "Vencidas" },
  { id: "sold_out", label: "Agotadas" },
  { id: "draft", label: "Borradores" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  published: { label: "Publicada", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" },
  paused: { label: "Pausada", className: "border-[#fed7aa] bg-[#fff7ed] text-[#c2410c]" },
  closed: { label: "Cerrada", className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" },
  expired: { label: "Vencida", className: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]" },
  sold_out: { label: "Agotada", className: "border-[#fecdd3] bg-[#fff1f2] text-[#be123c]" },
  draft: { label: "Borrador", className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" },
};

const JOB_STATUS_LABEL: Record<string, string> = { published: "Publicado", paused: "Pausado", closed: "Cerrado", draft: "Borrador" };

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: "Tiempo completo",
  part_time: "Medio tiempo",
  contract: "Por contrato",
  temporary: "Temporal",
  internship: "Práctica",
  freelance: "Freelance",
};

const WORKPLACE_LABEL: Record<string, string> = { onsite: "Presencial", remote: "Remoto", hybrid: "Híbrido" };

function money(amount: number | null | undefined, currency: string) {
  if (amount == null) return null;
  return `${currency === "USD" ? "$" : "₡"}${amount.toLocaleString("es-CR")}`;
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

function salaryLabel(item: JobItem) {
  if (!item.salary) return "Salario no visible";
  const min = money(item.salary.min, item.salary.currency);
  const max = money(item.salary.max, item.salary.currency);
  const period = item.salary.period === "hour" ? "por hora" : item.salary.period === "year" ? "por año" : item.salary.period === "project" ? "por proyecto" : "por mes";
  if (min && max) return `${min} - ${max} ${period}`;
  if (min) return `Desde ${min} ${period}`;
  if (max) return `Hasta ${max} ${period}`;
  return "A convenir";
}

function StatusPill({ item }: { item: Item }) {
  const meta = STATUS_META[item.status] ?? { label: item.status, className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" };
  const label = item.kind === "job" ? JOB_STATUS_LABEL[item.status] ?? meta.label : meta.label;
  return <span className={cn("inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-semibold", meta.className)}>{label}</span>;
}

function CreatorCard({ creator }: { creator: Creator | null }) {
  if (!creator) return <p className="text-sm text-[#6b7280]">Cuenta eliminada</p>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EBF5FB] text-xs font-bold text-[#009FD9]">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          getInitials(creator.name)
        )}
      </div>
      <div className="min-w-0">
        {creator.profileId ? (
          <Link href={`/admin/usuarios/${creator.profileId}`} className="block truncate text-sm font-semibold text-[#111827] hover:text-[#009FD9]">
            {creator.name}
          </Link>
        ) : (
          <p className="truncate text-sm font-semibold text-[#111827]">{creator.name}</p>
        )}
        <p className="truncate text-xs text-[#6b7280]">
          {creator.personName && creator.personName !== creator.name ? `${creator.personName} · ` : ""}
          {creator.email ?? "Sin correo"}
          {creator.verified ? " · Verificado" : ""}
        </p>
      </div>
    </div>
  );
}

export function AdminMarketplace({ kind }: { kind: "jobs" | "offers" }) {
  const isJobs = kind === "jobs";
  const filters = isJobs ? JOB_FILTERS : OFFER_FILTERS;
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ kind, filter, page: String(page) });
      if (debouncedQ) params.set("q", debouncedQ);
      const res = await fetch(`/api/admin/marketplace?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(data.items ?? []);
      setCounts(data.counts ?? {});
      setPagination(data.pagination ?? { page, pageSize: 25, total: 0, pages: 1 });
    } catch {
      setItems([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [debouncedQ, filter, kind, page]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useAdminAutoRefresh(() => void load(true), [load]);

  const filterCounts = useMemo(() => Object.fromEntries(filters.map((tab) => [tab.id, counts[tab.id] ?? 0])), [counts, filters]);

  async function setStatus(item: Item, status: string) {
    setBusy(item.id);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/marketplace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id: item.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo actualizar.");
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, status } : entry)));
      setCounts((current) => ({ ...current, [item.status]: Math.max(0, (current[item.status] ?? 1) - 1), [status]: (current[status] ?? 0) + 1 }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo actualizar.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Esta eliminación es permanente: se borra "${item.title}" con sus postulaciones y avisos. ¿Deseas continuar?`)) return;
    setBusy(item.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/marketplace?kind=${kind}&id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "No se pudo eliminar.");
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setCounts((current) => ({ ...current, all: Math.max(0, (current.all ?? 1) - 1), [item.status]: Math.max(0, (current[item.status] ?? 1) - 1) }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "No se pudo eliminar.");
    } finally {
      setBusy(null);
    }
  }

  const actionsFor = (item: Item): { label: string; status: string; tone?: "danger" }[] => {
    if (item.kind === "job") {
      if (item.status === "published") return [{ label: "Pausar", status: "paused" }, { label: "Cerrar vacante", status: "closed", tone: "danger" }];
      if (item.status === "paused") return [{ label: "Publicar", status: "published" }, { label: "Cerrar vacante", status: "closed", tone: "danger" }];
      return [{ label: "Publicar", status: "published" }];
    }
    if (item.status === "published") return [{ label: "Pausar", status: "paused" }, { label: "Marcar vencida", status: "expired", tone: "danger" }];
    if (item.status === "paused") return [{ label: "Publicar", status: "published" }, { label: "Marcar vencida", status: "expired", tone: "danger" }];
    return [{ label: "Publicar", status: "published" }];
  };

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const showingTo = Math.min(pagination.total, pagination.page * pagination.pageSize);
  const Icon = isJobs ? Briefcase : BadgePercent;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-[#009FD9]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">{isJobs ? "Empleos" : "Ofertas"}</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">
              {isJobs ? "Vacantes publicadas por profesionales y empresas, con quién las creó y cuántas postulaciones reciben." : "Promociones, paquetes y productos publicados por profesionales, con quién los creó."}
            </p>
          </div>
        </div>
        {!loading && (
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-semibold text-[#6b7280]">{pagination.total.toLocaleString("es-CR")} en esta vista</span>
        )}
      </div>

      <div className="mb-4 rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <label className="mb-1.5 block text-xs font-semibold text-[#374151]">{isJobs ? "Buscar empleo" : "Buscar oferta"}</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Título, servicio, ubicación, creador o correo"
            className="h-11 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
          />
        </div>
      </div>

      <AdminFilterTabs tabs={filters} value={filter} onChange={(next) => { setFilter(next); setPage(1); }} counts={filterCounts} />

      {notice && <p className="mb-3 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]">{notice}</p>}

      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#6b7280]">{isJobs ? "No hay empleos en esta vista." : "No hay ofertas en esta vista."}</div>
        ) : (
          <ul className="divide-y divide-[#f1f5f9]">
            {items.map((item) => (
              <li key={item.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-start">
                <div className="flex min-w-0 gap-3">
                  {item.kind === "offer" && item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#64748b]"><Icon className="h-5 w-5" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={item.href} className="line-clamp-2 text-sm font-bold text-[#111827] hover:text-[#009FD9]">{item.title}</Link>
                      <StatusPill item={item} />
                    </div>
                    <p className="mt-0.5 text-xs text-[#6b7280]">
                      {[item.category, item.place].filter(Boolean).join(" · ")}
                    </p>
                    {item.kind === "job" ? (
                      <p className="mt-1 text-xs text-[#374151]">
                        {[WORKPLACE_LABEL[item.workplaceType ?? ""] ?? item.workplaceType, EMPLOYMENT_LABEL[item.employmentType ?? ""] ?? item.employmentType, salaryLabel(item), `${item.openings} ${item.openings === 1 ? "vacante" : "vacantes"}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-[#374151]">
                        {[money(item.price.now, item.price.currency), item.price.before ? `antes ${money(item.price.before, item.price.currency)}` : null, item.quantity != null ? `${item.quantity} disponibles` : null, item.validUntil ? `vence ${fmtDate(item.validUntil)}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-[#9ca3af]">
                      Creada {fmtDate(item.createdAt)}{item.updatedAt && item.updatedAt !== item.createdAt ? ` · actualizada ${fmtDate(item.updatedAt)}` : ""} · ID {item.id.slice(0, 8)}
                      {item.kind === "job" ? ` · ${item.applications} ${item.applications === 1 ? "postulación" : "postulaciones"}` : ""}
                    </p>
                  </div>
                </div>
                <div className="min-w-0 rounded-xl bg-[#f8fafc] p-3">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#94a3b8]">{isJobs ? "Publicado por" : "Publicada por"}</p>
                  <CreatorCard creator={item.creator} />
                </div>
                <div className="flex flex-wrap gap-2 lg:flex-col lg:items-stretch">
                  <Link href={item.href} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
                    <ExternalLink className="h-3.5 w-3.5" /> Ver publicación
                  </Link>
                  {actionsFor(item).map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      disabled={busy === item.id}
                      onClick={() => void setStatus(item, action.status)}
                      className={cn(
                        "inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition disabled:opacity-60",
                        action.tone === "danger" ? "border border-[#fecaca] text-[#b91c1c] hover:bg-[#fef2f2]" : "bg-[#009FD9] text-white hover:bg-[#0089bb]",
                      )}
                    >
                      {busy === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : action.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy === item.id}
                    onClick={() => void remove(item)}
                    className="inline-flex h-9 items-center justify-center gap-1 rounded-lg px-3 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {pagination.pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#6b7280]">
          <span>Mostrando {showingFrom}-{showingTo} de {pagination.total.toLocaleString("es-CR")}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={pagination.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 font-semibold disabled:opacity-50">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <span className="text-xs">Página {pagination.page} de {pagination.pages}</span>
            <button type="button" disabled={pagination.page >= pagination.pages} onClick={() => setPage((p) => p + 1)} className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-3 font-semibold disabled:opacity-50">
              Siguiente <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
