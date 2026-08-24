"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, Search, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { cn, getInitials } from "@/lib/utils";
import { formatId } from "@/lib/cedula";

type AdminBooking = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  preferred_date_text: string | null;
  service_description: string | null;
  category_label: string | null;
  slot_location_label: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  archived_by_client: boolean;
  archived_by_professional: boolean;
  client: {
    id: string | null;
    name: string | null;
    email: string | null;
    cedula: string | null;
    avatar_url: string | null;
    phone: string | null;
  };
  professional: {
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
  { id: "active", label: "Activas" },
  { id: "awaiting_confirmation", label: "Por confirmar" },
  { id: "completed", label: "Finalizadas" },
  { id: "cancelled", label: "Canceladas" },
] as const;

const STATUS_META: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendiente", className: "border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]" },
  confirmed: { label: "Confirmada", className: "border-[#bae6fd] bg-[#e0f2fe] text-[#0369a1]" },
  rescheduled: { label: "Reprogramada", className: "border-[#fde68a] bg-[#fffbeb] text-[#b45309]" },
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

function fmtAppointment(booking: AdminBooking) {
  if (booking.scheduled_date && booking.scheduled_time) {
    const [year, month, day] = booking.scheduled_date.split("-").map(Number);
    const date = new Date(year, (month ?? 1) - 1, day ?? 1);
    const label = date.toLocaleDateString("es-CR", { weekday: "short", day: "numeric", month: "short" }).replace(".", "");
    return `${label} · ${String(booking.scheduled_time).slice(0, 5)}`;
  }
  return booking.preferred_date_text || "Sin horario elegido";
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, className: "border-[#e5e7eb] bg-[#f9fafb] text-[#6b7280]" };
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

type Listing = { items: AdminBooking[]; counts: Record<string, number>; pagination: Pagination };
const EMPTY_LISTING: Listing = { items: [], counts: {}, pagination: { page: 1, pageSize: 25, total: 0, pages: 1 } };

export function AdminBookings() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  // The listing for these filters lives in the shared cache: coming back to a
  // page already seen paints it at once and refreshes quietly.
  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ filter, page: String(page), pageSize: "25" });
    if (debouncedQ) params.set("q", debouncedQ);
    return params.toString();
  }, [debouncedQ, filter, page]);
  const { data: listing, loading, refresh, setData: setListing } = useCachedResource<Listing>(
    `admin:bookings:${listQuery}`,
    async () => {
      try {
        const res = await fetch(`/api/admin/bookings?${listQuery}`, { cache: "no-store" });
        const data = await res.json();
        return {
          items: data.bookings ?? [],
          counts: data.counts ?? {},
          pagination: data.pagination ?? { page, pageSize: 25, total: 0, pages: 1 },
        };
      } catch {
        return { items: [], counts: {}, pagination: { page, pageSize: 25, total: 0, pages: 1 } };
      }
    },
    EMPTY_LISTING,
  );
  const { items, counts, pagination } = listing;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [q]);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  async function removeBooking(id: string) {
    if (!window.confirm("Esta eliminación es permanente: la solicitud desaparece para el cliente y el profesional. ¿Deseas continuar?")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/bookings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "No se pudo eliminar.");
      setListing((current) => ({ ...current, items: current.items.filter((item) => item.id !== id) }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "No se pudo eliminar.");
    } finally {
      setDeletingId(null);
    }
  }

  const load = useCallback(async () => {
    await refresh();
  }, [refresh]);
  useAdminAutoRefresh(() => void load(), [load]);

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
          <CalendarCheck className="h-5 w-5 text-[#009FD9]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Solicitudes</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">Reservas directas hechas desde perfiles profesionales.</p>
          </div>
        </div>
        {!loading && (
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-semibold text-[#6b7280]">
            {pagination.total.toLocaleString("es-CR")} en esta vista
          </span>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
        <label className="text-xs font-semibold text-[#6b7280]" htmlFor="admin-bookings-search">
          Buscar solicitud
        </label>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
          <input
            id="admin-bookings-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Cliente, profesional, servicio, identificacion o ubicacion"
            className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-3 text-sm text-[#111827] outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff]"
          />
        </div>
        <p className="mt-2 text-xs text-[#9ca3af]">Incluye solicitudes activas, finalizadas, canceladas y archivadas por usuarios.</p>
      </div>

      <AdminFilterTabs tabs={FILTERS} value={filter} onChange={changeFilter} counts={filterCounts} />

      <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <CalendarCheck className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
            <p className="text-sm text-[#6b7280]">No hay solicitudes en esta vista.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {items.map((booking) => {
              const meta = statusMeta(booking.status);
              return (
                <li key={booking.id} className="px-4 py-4 transition-colors hover:bg-[#f9fafb]">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]">
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start gap-3">
                        <Avatar name={booking.client.name} src={booking.client.avatar_url} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 truncate text-sm font-semibold text-[#111827]">
                              {booking.category_label || "Servicio"} · {fmtAppointment(booking)}
                            </p>
                            <span className={cn("shrink-0 rounded-md border px-2 py-1 text-xs font-semibold", meta.className)}>
                              {meta.label}
                            </span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-sm text-[#4b5563]">{booking.service_description || "Sin descripcion."}</p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6b7280]">
                            <span>Creada: {fmtDateTime(booking.created_at)}</span>
                            {booking.slot_location_label && <span>{booking.slot_location_label}</span>}
                            {(booking.archived_by_client || booking.archived_by_professional) && (
                              <span>Archivada por {[
                                booking.archived_by_client ? "cliente" : "",
                                booking.archived_by_professional ? "profesional" : "",
                              ].filter(Boolean).join(" y ")}</span>
                            )}
                          </div>
                          {booking.cancel_reason && (
                            <p className="mt-2 rounded-lg bg-[#f9fafb] px-3 py-2 text-xs text-[#6b7280]">
                              Cancelada por {booking.cancelled_by === "professional" ? "profesional" : "cliente"}: {booking.cancel_reason}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 rounded-xl border border-[#eef0f2] bg-[#fbfdff] p-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Cliente</p>
                        <p className="mt-0.5 truncate"><PersonLink id={booking.client.id} name={booking.client.name} /></p>
                        <p className="mt-0.5 truncate text-xs text-[#6b7280]">{booking.client.email || "Sin correo"}</p>
                        {booking.client.cedula && <p className="mt-0.5 text-xs text-[#6b7280]">{formatId(booking.client.cedula)}</p>}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Profesional</p>
                        <p className="mt-0.5 truncate">
                          <PersonLink id={booking.professional?.profile_id ?? null} name={booking.professional?.name ?? "Sin profesional"} />
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[#6b7280]">{booking.professional?.email || "Sin correo"}</p>
                        <p className="mt-0.5 text-xs text-[#9ca3af]">ID: {booking.id.slice(0, 8)}</p>
                      </div>
                      <div className="sm:col-span-2 lg:col-span-1 xl:col-span-2">
                        <button
                          type="button"
                          disabled={deletingId === booking.id}
                          onClick={() => void removeBooking(booking.id)}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-60"
                        >
                          {deletingId === booking.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Eliminar solicitud
                        </button>
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
