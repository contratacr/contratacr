"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, MapPinned, Search, Tag } from "lucide-react";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";
import { cn } from "@/lib/utils";

type Service = { id: string; label: string; groupId: string; groupLabel: string; source: "base" | "custom"; professionals: number; verified: number };
type Group = { id: string; label: string; services: number; withProfessionals: number; professionals: number };
type Canton = { id: string; name: string; based: number; serving: number };
type Province = { id: string; name: string; based: number; serving: number; cantons: Canton[] };
type Coverage = {
  totals: {
    professionals: number;
    verified: number;
    nationwide: number;
    services: number;
    servicesWithProfessionals: number;
    provincesWithSupply: number;
    cantons: number;
    cantonsWithSupply: number;
    cantonsServed: number;
  };
  services: Service[];
  groups: Group[];
  provinces: Province[];
};

const VIEWS = [
  { id: "services", label: "Servicios" },
  { id: "places", label: "Provincias y cantones" },
] as const;

function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <p className="text-2xl font-bold leading-none tabular-nums text-[#0f172a]">{typeof value === "number" ? value.toLocaleString("es-CR") : value}</p>
      <p className="mt-1.5 text-xs text-[#64748b]">{label}</p>
      {hint && <p className="text-[11px] text-[#94a3b8]">{hint}</p>}
    </div>
  );
}

function Bar({ value, max, color = "#009FD9" }: { value: number; max: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
      <div className="h-full rounded-full" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, backgroundColor: color }} />
    </div>
  );
}

export function AdminCoverage() {
  const [view, setView] = useState<string>("services");
  const [data, setData] = useState<Coverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [openProvinces, setOpenProvinces] = useState<Record<string, boolean>>({});
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch("/api/admin/coverage", { cache: "no-store" });
      const payload = (await res.json()) as Coverage;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useAdminAutoRefresh(() => void load(true), [load]);

  const query = normalize(q.trim());
  const services = useMemo(() => {
    if (!data) return [];
    return data.services.filter((service) => {
      if (groupFilter !== "all" && service.groupId !== groupFilter) return false;
      if (onlyEmpty && service.professionals > 0) return false;
      if (!query) return true;
      return normalize(`${service.label} ${service.groupLabel} ${service.id}`).includes(query);
    });
  }, [data, groupFilter, onlyEmpty, query]);
  const maxService = Math.max(1, ...services.map((service) => service.professionals));
  // Every category and every service stays on screen (the owner filters by
  // eye); a search or a category filter shows the matching rows flat.
  const flatServices = !!query || onlyEmpty || groupFilter !== "all";
  const serviceSections = useMemo(() => {
    if (!data) return [];
    if (flatServices) return [{ id: "all", label: "", items: services }];
    const order = new Map(data.groups.map((group, index) => [group.id, index]));
    const sections = new Map<string, { id: string; label: string; items: Service[] }>();
    for (const service of services) {
      const section = sections.get(service.groupId) ?? { id: service.groupId, label: service.groupLabel, items: [] };
      section.items.push(service);
      sections.set(service.groupId, section);
    }
    return [...sections.values()].sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
  }, [data, flatServices, services]);

  const provinces = useMemo(() => {
    if (!data) return [];
    return data.provinces
      .map((province) => ({
        ...province,
        cantons: province.cantons.filter((canton) => {
          if (onlyEmpty && canton.based > 0) return false;
          if (!query) return true;
          return normalize(`${canton.name} ${province.name}`).includes(query);
        }),
      }))
      .filter((province) => (!query && !onlyEmpty) || province.cantons.length > 0 || (!!query && normalize(province.name).includes(query)));
  }, [data, onlyEmpty, query]);
  const maxProvince = Math.max(1, ...(data?.provinces.map((province) => province.based) ?? [1]));

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <MapPinned className="h-5 w-5 text-[#009FD9]" />
        <div>
          <h1 className="text-xl font-bold text-[#111827]">Cobertura</h1>
          <p className="mt-0.5 text-sm text-[#6b7280]">Dónde está la oferta real: profesionales por servicio, por provincia y por cantón — incluidos los lugares y servicios sin nadie todavía.</p>
        </div>
      </div>

      {loading || !data ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Tile label="Profesionales activos" value={data.totals.professionals} hint={`${data.totals.verified.toLocaleString("es-CR")} verificados`} />
            <Tile label="Servicios con oferta" value={`${data.totals.servicesWithProfessionals}/${data.totals.services}`} hint="del catálogo" />
            <Tile label="Provincias con sede" value={`${data.totals.provincesWithSupply}/7`} />
            <Tile label="Cantones con sede" value={`${data.totals.cantonsWithSupply}/${data.totals.cantons}`} />
            <Tile label="Cantones atendidos" value={`${data.totals.cantonsServed}/${data.totals.cantons}`} hint="por cobertura declarada" />
            <Tile label="Cubren todo el país" value={data.totals.nationwide} />
          </div>

          <AdminFilterTabs tabs={VIEWS} value={view} onChange={setView} />

          <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder={view === "services" ? "Buscar servicio o categoría" : "Buscar provincia o cantón"}
                className="h-10 w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
              />
            </div>
            {view === "services" && (
              <select
                value={groupFilter}
                onChange={(event) => setGroupFilter(event.target.value)}
                aria-label="Filtrar por categoría"
                className="h-10 shrink-0 rounded-lg border border-[#e5e7eb] bg-white px-3 text-sm font-semibold text-[#374151] outline-none focus:border-[#009FD9]"
              >
                <option value="all">Todas las categorías</option>
                {data.groups.map((group) => <option key={group.id} value={group.id}>{group.label} ({group.services})</option>)}
              </select>
            )}
            <button
              type="button"
              onClick={() => setOnlyEmpty((value) => !value)}
              className={cn("h-10 shrink-0 rounded-lg border px-3 text-sm font-semibold", onlyEmpty ? "border-[#009FD9] bg-[#EBF5FB] text-[#0077a3]" : "border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb]")}
            >
              Solo sin profesionales
            </button>
          </div>

          {view === "services" ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
              <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
                <div className="flex items-center justify-between border-b border-[#f1f5f9] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">
                  <span>Servicio</span>
                  <span>Profesionales · verificados</span>
                </div>
                {services.length === 0 ? (
                  <div className="py-14 text-center text-sm text-[#9ca3af]">No hay servicios con ese filtro.</div>
                ) : (
                  <>
                  {serviceSections.map((section) => {
                    const open = flatServices || (openGroups[section.id] ?? true);
                    const withSupply = section.items.filter((service) => service.professionals > 0).length;
                    return (
                  <div key={section.id} className="border-b border-[#f1f5f9] last:border-b-0">
                    {!flatServices && (
                      <button
                        type="button"
                        onClick={() => setOpenGroups((current) => ({ ...current, [section.id]: !open }))}
                        aria-expanded={open}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f9fafb]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-[#111827]">{section.label}</span>
                          <span className="block text-xs text-[#6b7280]">{withSupply}/{section.items.length} servicios con profesionales</span>
                        </span>
                        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform", open && "rotate-180")} />
                      </button>
                    )}
                  {open && (
                  <ul className="divide-y divide-[#f1f5f9]">
                    {section.items.map((service) => (
                      <li key={service.id} className="px-4 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#111827]">
                              {service.label}
                              {service.source === "custom" && <span className="ml-1.5 rounded bg-[#f1f5f9] px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]">agregado</span>}
                            </p>
                            <p className="truncate text-xs text-[#6b7280]">{service.groupLabel}</p>
                          </div>
                          <p className={cn("shrink-0 text-sm font-bold tabular-nums", service.professionals === 0 ? "text-[#b91c1c]" : "text-[#0f172a]")}>
                            {service.professionals.toLocaleString("es-CR")} <span className="text-xs font-semibold text-[#6b7280]">· {service.verified.toLocaleString("es-CR")}</span>
                          </p>
                        </div>
                        <div className="mt-1"><Bar value={service.professionals} max={maxService} /></div>
                      </li>
                    ))}
                  </ul>
                  )}
                  </div>
                    );
                  })}
                  </>
                )}
              </div>
              <div className="self-start rounded-2xl border border-[#e5e7eb] bg-white p-4">
                <div className="mb-3 flex items-center gap-2"><Tag className="h-4 w-4 text-[#009FD9]" /><h2 className="text-sm font-bold text-[#0f172a]">Por categoría</h2></div>
                <ul className="space-y-3">
                  {data.groups.map((group) => (
                    <li key={group.id}>
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate text-[#334155]">{group.label}</span>
                        <span className="shrink-0 text-xs font-semibold text-[#6b7280]">{group.withProfessionals}/{group.services} servicios · <span className="text-[#0f172a]">{group.professionals.toLocaleString("es-CR")}</span></span>
                      </div>
                      <div className="mt-1"><Bar value={group.withProfessionals} max={Math.max(1, group.services)} color="#16a34a" /></div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {provinces.map((province) => {
                const open = openProvinces[province.id] ?? true;
                const maxCanton = Math.max(1, ...province.cantons.map((canton) => canton.based));
                return (
                  <section key={province.id} className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
                    <button
                      type="button"
                      onClick={() => setOpenProvinces((current) => ({ ...current, [province.id]: !open }))}
                      aria-expanded={open}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#f9fafb]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-bold text-[#111827]">{province.name}</p>
                          <p className="shrink-0 text-xs font-semibold text-[#6b7280]">
                            <span className={cn("text-sm font-bold tabular-nums", province.based === 0 ? "text-[#b91c1c]" : "text-[#0f172a]")}>{province.based.toLocaleString("es-CR")}</span> con sede · {province.serving.toLocaleString("es-CR")} atienden · {province.cantons.filter((canton) => canton.based > 0).length}/{province.cantons.length} cantones con sede
                          </p>
                        </div>
                        <div className="mt-1.5"><Bar value={province.based} max={maxProvince} color="#16a34a" /></div>
                      </div>
                      <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform", open && "rotate-180")} />
                    </button>
                    {open && (
                      <ul className="divide-y divide-[#f1f5f9] border-t border-[#f1f5f9]">
                        {province.cantons.length === 0 && <li className="px-4 py-3 text-sm text-[#9ca3af]">Sin cantones con ese filtro.</li>}
                        {province.cantons.map((canton) => (
                          <li key={canton.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_120px_auto]">
                            <p className="truncate text-sm text-[#334155]">{canton.name}</p>
                            <div className="hidden sm:block"><Bar value={canton.based} max={maxCanton} /></div>
                            <p className="shrink-0 text-xs font-semibold text-[#6b7280]">
                              <span className={cn("text-sm font-bold tabular-nums", canton.based === 0 ? "text-[#b91c1c]" : "text-[#0f172a]")}>{canton.based}</span> con sede · {canton.serving} atienden
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
