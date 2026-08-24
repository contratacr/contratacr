"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, ShieldOff, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { formatId } from "@/lib/cedula";
import { getInitials } from "@/lib/utils";
import { verificationLabel, verificationPillClasses, type VerificationStatus } from "@/lib/verification";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { cn } from "@/lib/utils";

type UserKind = "professional" | "incomplete" | "client" | "admin";

type ListedUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  cedula: string | null;
  role: string | null;
  avatar_url: string | null;
  created_at: string;
  is_disabled: boolean;
  isPro: boolean;
  business_name?: string | null;
  professionalSignupIncomplete?: boolean;
  kind: UserKind;
  verification_status: VerificationStatus | null;
  is_banned: boolean;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

const FILTERS = [
  { id: "all", label: "Todos" },
  { id: "professional", label: "Profesionales" },
  { id: "incomplete", label: "Registros incompletos" },
  { id: "client", label: "Clientes" },
  { id: "admin", label: "Administradores" },
  { id: "disabled", label: "Deshabilitados" },
] as const;

const KIND_LABEL: Record<UserKind, string> = {
  professional: "Profesional",
  incomplete: "Profesional incompleto",
  client: "Cliente",
  admin: "Admin",
};

const KIND_CLASS: Record<UserKind, string> = {
  professional: "bg-[#e0f2fe] text-[#0369a1]",
  incomplete: "bg-[#fff7ed] text-[#c2410c]",
  client: "bg-[#dcfce7] text-[#15803d]",
  admin: "bg-[#f3f4f6] text-[#374151]",
};

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

function statusLabel(user: ListedUser) {
  if (user.kind === "admin") return "No aplica";
  if (user.professionalSignupIncomplete) return "Pendiente de completar";
  if (user.verification_status) return verificationLabel(user.verification_status);
  return "Sin verificar";
}

function statusClass(user: ListedUser) {
  if (user.professionalSignupIncomplete) return "border-[#fed7aa] bg-[#fff7ed] text-[#9a3412]";
  if (user.verification_status) return verificationPillClasses(user.verification_status);
  return "border-[#e5e7eb] bg-[#f8fafc] text-[#64748b]";
}

type Listing = { items: ListedUser[]; counts: Record<string, number>; pagination: Pagination };
const EMPTY_LISTING: Listing = { items: [], counts: {}, pagination: { page: 1, pageSize: 25, total: 0, pages: 1 } };

export function AdminUsers() {
  const [filter, setFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [verification, setVerification] = useState("all");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  // The listing for these filters lives in the shared cache: coming back to a
  // page already seen paints it at once and refreshes quietly.
  const listQuery = useMemo(() => {
    const params = new URLSearchParams({
      mode: "list",
      filter,
      page: String(page),
      pageSize: "25",
    });
    if (debouncedQ) params.set("q", debouncedQ);
    if (verification !== "all") params.set("verification", verification);
    return params.toString();
  }, [debouncedQ, filter, page, verification]);
  const { data: listing, loading, refresh } = useCachedResource<Listing>(
    `admin:users:${listQuery}`,
    async () => {
      try {
        const res = await fetch(`/api/admin/users?${listQuery}`, { cache: "no-store" });
        const data = await res.json();
        return {
          items: data.users ?? [],
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
    if (next !== "professional") setVerification("all");
    setPage(1);
  }

  const showingFrom = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const showingTo = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-[#009FD9]" />
          <div>
            <h1 className="text-xl font-bold text-[#111827]">Usuarios</h1>
            <p className="mt-0.5 text-sm text-[#6b7280]">Todas las cuentas registradas en ContrataCR.</p>
          </div>
        </div>
        {!loading && (
          <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-semibold text-[#6b7280]">
            {pagination.total.toLocaleString("es-CR")} en esta vista
          </span>
        )}
      </div>

      <div className="mb-4 rounded-xl border border-[#e5e7eb] bg-white p-4">
        <label className="text-xs font-semibold text-[#6b7280]" htmlFor="admin-users-search">
          Buscar usuario
        </label>
        <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              id="admin-users-search"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Nombre, nombre comercial, correo, teléfono o identificación"
              className="h-11 w-full rounded-xl border border-[#dbe2ea] bg-white pl-10 pr-3 text-sm text-[#111827] outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff]"
            />
          </div>
          <select
            aria-label="Estado de verificación"
            value={verification}
            onChange={(event) => { setVerification(event.target.value); setFilter("professional"); setPage(1); }}
            className="h-11 rounded-xl border border-[#dbe2ea] bg-white px-3 text-sm text-[#374151] outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff]"
          >
            <option value="all">Cualquier verificación</option>
            <option value="verified">Verificados</option>
            <option value="pending">Pendientes</option>
            <option value="under_appeal">En apelación</option>
            <option value="rejected">No aprobados</option>
            <option value="unverified">Sin verificar</option>
            <option value="banned">Profesionales bloqueados</option>
          </select>
        </div>
        <p className="mt-2 text-xs text-[#9ca3af]">Los resultados están paginados; puedes consultar todas las cuentas, no solo las primeras 100.</p>
      </div>

      <AdminFilterTabs tabs={FILTERS} value={filter} onChange={changeFilter} counts={filterCounts} />

      <div className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="mx-auto mb-2 h-10 w-10 text-[#cbd5e1]" />
            <p className="text-sm text-[#6b7280]">No hay usuarios en esta vista.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {items.map((user) => (
              <li key={user.id}>
                <Link
                  href={`/admin/usuarios/${user.id}`}
                  className="grid gap-3 px-4 py-3 transition-colors hover:bg-[#f9fafb] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EBF5FB] text-sm font-bold text-[#009FD9]">
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        getInitials(user.full_name ?? "?")
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-[#111827]">{user.full_name ?? "Sin nombre"}</p>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", KIND_CLASS[user.kind])}>
                          {KIND_LABEL[user.kind]}
                        </span>
                        {user.is_disabled && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[11px] font-semibold text-[#b45309]">
                            <ShieldOff className="h-3 w-3" />
                            Deshabilitada
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#6b7280]">
                        {user.business_name ? `${user.business_name} · ` : ""}
                        {user.cedula ? `${formatId(user.cedula)} · ` : ""}
                        {user.email ?? "Sin correo"}
                      </p>
                    </div>
                  </div>
                  <span className={cn("w-fit rounded-md border px-2 py-1 text-xs font-medium", statusClass(user))}>
                    {statusLabel(user)}
                  </span>
                  <div className="flex items-center justify-between gap-3 text-xs text-[#9ca3af] sm:justify-end">
                    <span>Registro: {fmtDate(user.created_at)}</span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </div>
                </Link>
              </li>
            ))}
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
              Página {pagination.page} de {pagination.pages}
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
