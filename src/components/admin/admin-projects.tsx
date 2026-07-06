"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardList, Loader2, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { cn, getInitials } from "@/lib/utils";
import { formatId } from "@/lib/cedula";

type AdminProject = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category_label: string | null;
  location_label: string | null;
  budget_min: number | null;
  budget_max: number | null;
  timeline: string | null;
  client_identity_status: string | null;
  created_at: string;
  updated_at: string | null;
  completed_at: string | null;
  work_done_at: string | null;
  archived_by_client: boolean;
  for_someone_else: boolean;
  beneficiary_name: string | null;
  beneficiary_dob: string | null;
  proposals_count: number;
  pending_proposals_count: number;
  accepted_proposals_count: number;
  client: {
    id: string | null;
    name: string | null;
    email: string | null;
    cedula: string | null;
    avatar_url: string | null;
  };
  accepted_professional: {
    id: string;
    profile_id: string | null;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

const FILTERS = [
  { id: "all", label: "Todas" },
  { id: "open", label: "Abiertas" },
  { id: "in_progress", label: "En curso" },
  { id: "awaiting_confirmation", label: "Por confirmar" },
  { id: "completed", label: "Finalizadas" },
  { id: "cancelled", label: "Canceladas" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  open: { label: "Abierta", className: "border-[#bae6fd] bg-[#e0f2fe] text-[#0369a1]" },
  in_progress: { label: "En curso", className: "border-[#c7d2fe] bg-[#eef2ff] text-[#4338ca]" },
  awaiting_confirmation: { label: "Por confirmar", className: "border-[#bae6fd] bg-[#f0f9ff] text-[#0369a1]" },
  completed: { label: "Finalizada", className: "border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]" },
  cancelled: { label: "Cancelada", className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" },
};

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "Sin fecha";
  return new Date(value).toLocaleString("es-CR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(".", "");
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" };
}

function fmtBudget(project: AdminProject) {
  const min = project.budget_min;
  const max = project.budget_max;
  const fmt = (amount: number) => `₡${amount.toLocaleString("es-CR")}`;
  if (min && max) return `${fmt(min)} - ${fmt(max)}`;
  if (min) return `Desde ${fmt(min)}`;
  if (max) return `Hasta ${fmt(max)}`;
  return "A convenir";
}

function identityLabel(status: string | null) {
  if (status === "verified") return "Cliente verificado";
  if (status === "pending") return "Identidad pendiente";
  return "Sin verificar";
}

function identityClass(status: string | null) {
  if (status === "verified") return "bg-[#e0f2fe] text-[#0369a1]";
  if (status === "pending") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#f3f4f6] text-[#6b7280]";
}

function PersonLink({ id, name }: { id: string | null; name: string | null }) {
  if (!id) return <span className="font-semibold text-[#111827]">{name || "Sin cuenta"}</span>;
  return (
    <Link href={`/admin/usuarios/${id}`} className="font-semibold text-[#111827] transition hover:text-[#009FD9]">
      {name || "Sin nombre"}
    </Link>
  );
}

function Avatar({ name, src }: { name: string | null; src?: string | null }) {
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EBF5FB] text-sm font-bold text-[#009FD9]">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        getInitials(name || "?")
      )}
    </div>
  );
}

export function AdminProjects() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<AdminProject[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 25, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

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
      const params = new URLSearchParams({ filter, page: String(page), pageSize: "25" });
      if (debouncedQ) params.set("q", debouncedQ);
      const res = await fetch(`/api/admin/projects?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      setItems(data.projects ?? []);
      setCounts(data.counts ?? {});
      setPagination(data.pagination ?? { page, pageSize: 25, total: 0, pages: 1 });
    } catch {
      setItems([]);
      setPagination({ page, pageSize: 25, total: 0, pages: 1 });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [debouncedQ, filter, page]);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useAdminAutoRefresh(() => void load(true), [load]);

  const filterCounts = useMemo(
    () => Object.fromEntries(FILTERS.map((tab) => [tab.id, counts[tab.id] ?? 0])),
    [counts],
  );

  function changeFilter(next: string) {
    setFilter(next);
    setPage(1);
  }

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const showingTo = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-[#009FD9]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Publicaciones</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">Solicitudes publicadas para recibir propuestas de profesionales.</p>
          </div>
        </div>
        {!loading && (
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-semibold text-[#6b7280]">
            {pagination.total.toLocaleString("es-CR")} en esta vista
          </span>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
        <label className="text-xs font-semibold text-[#6b7280]" htmlFor="admin-projects-search">
          Buscar publicacion
        </label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            id="admin-projects-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Titulo, cliente, profesional, servicio, identificacion o ubicacion"
            className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-3 text-sm text-[#111827] outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff]"
          />
        </div>
        <p className="mt-2 text-xs text-[#9ca3af]">Incluye publicaciones activas, finalizadas, canceladas y archivadas.</p>
      </div>

      <AdminFilterTabs tabs={FILTERS} value={filter} onChange={changeFilter} counts={filterCounts} />

      <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
            <p className="text-sm text-[#6b7280]">No hay publicaciones en esta vista.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {items.map((project) => {
              const meta = statusMeta(project.status);
              return (
                <li key={project.id} className="px-4 py-4 transition-colors hover:bg-[#f9fafb]">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={project.client.name} src={project.client.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">{project.title}</p>
                            <span className={cn("shrink-0 rounded-md border px-2 py-1 text-xs font-semibold", meta.className)}>
                              {meta.label}
                            </span>
                            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", identityClass(project.client_identity_status))}>
                              {identityLabel(project.client_identity_status)}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-[#4b5563]">{project.description || "Sin descripcion."}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b7280]">
                            <span>{project.category_label || "Sin servicio"}</span>
                            <span>{project.location_label || "Sin ubicacion"}</span>
                            <span>{fmtBudget(project)}</span>
                            {project.timeline && <span>{project.timeline}</span>}
                            {project.archived_by_client && <span>Archivada por cliente</span>}
                          </div>
                          {project.for_someone_else && (
                            <p className="mt-2 rounded-lg bg-[#f9fafb] px-3 py-2 text-xs text-[#6b7280]">
                              Para otra persona: {project.beneficiary_name || "sin nombre"}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-xl border border-[#eef0f2] bg-[#fbfdff] p-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Cliente</p>
                        <p className="mt-0.5 truncate"><PersonLink id={project.client.id} name={project.client.name} /></p>
                        <p className="mt-0.5 truncate text-xs text-[#6b7280]">{project.client.email || "Sin correo"}</p>
                        {project.client.cedula && <p className="mt-0.5 text-xs text-[#6b7280]">{formatId(project.client.cedula)}</p>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Propuestas</p>
                        <p className="mt-0.5 text-sm font-semibold text-[#111827]">
                          {project.proposals_count} total
                          {project.pending_proposals_count > 0 ? ` · ${project.pending_proposals_count} pendiente${project.pending_proposals_count === 1 ? "" : "s"}` : ""}
                        </p>
                        {project.accepted_professional ? (
                          <>
                            <p className="mt-1 truncate text-xs text-[#6b7280]">Aceptada:</p>
                            <p className="truncate text-xs">
                              <PersonLink id={project.accepted_professional.profile_id} name={project.accepted_professional.name} />
                            </p>
                          </>
                        ) : (
                          <p className="mt-1 text-xs text-[#9ca3af]">Sin profesional aceptado</p>
                        )}
                        <p className="mt-1 text-xs text-[#9ca3af]">Creada: {fmtDateTime(project.created_at)} · ID: {project.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {!loading && pagination.pages > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-[#6b7280]">
            Mostrando {showingFrom.toLocaleString("es-CR")}-{showingTo.toLocaleString("es-CR")} de {pagination.total.toLocaleString("es-CR")}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={pagination.page <= 1}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#dbe2ea] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>
            <span className="text-xs font-semibold text-[#6b7280]">
              Pagina {pagination.page} de {pagination.pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(pagination.pages, current + 1))}
              disabled={pagination.page >= pagination.pages}
              className="inline-flex h-9 items-center gap-1 rounded-lg border border-[#dbe2ea] bg-white px-3 text-sm font-semibold text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
