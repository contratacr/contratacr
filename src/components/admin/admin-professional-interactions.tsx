"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";

type Item = {
  professional_id: string;
  profile_id: string;
  slug: string;
  professional_name: string;
  total: number;
  profile_views: number;
  whatsapp_clicks: number;
  phone_clicks: number;
  availability_actions: number;
  favorites: number;
  unique_visitors: number;
};

type Pagination = { page: number; pageSize: number; total: number; pages: number };

export function AdminProfessionalInteractions() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 20, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (debouncedQuery) params.set("q", debouncedQuery);
      const response = await fetch(`/api/admin/analytics/professionals?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error("request failed");
      const data = await response.json();
      setItems(data.items ?? []);
      setPagination(data.pagination ?? { page, pageSize: 20, total: 0, pages: 1 });
    } catch {
      setItems([]);
      setPagination({ page, pageSize: 20, total: 0, pages: 1 });
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, page]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const to = Math.min(pagination.total, pagination.page * pagination.pageSize);

  return (
    <div className="mt-5">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#334155]">Rendimiento por profesional</p>
          <p className="text-[11px] text-[#94a3b8]">Clics y visitantes desde que comenzó la medición.</p>
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar profesional"
            aria-label="Buscar profesional en analítica"
            className="h-10 w-full rounded-lg border border-[#dbe2ea] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff]"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#e5e7eb]">
        {loading ? (
          <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div>
        ) : items.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center text-sm text-[#94a3b8]">
            {debouncedQuery ? "No hay profesionales con ese nombre." : "Aún no hay interacciones registradas."}
          </div>
        ) : (
          <table className="w-full min-w-[900px] text-left text-xs">
            <thead className="bg-[#f8fafc] text-[#64748b]">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Profesional</th>
                <th className="px-3 py-2.5 text-right font-semibold">Únicos</th>
                <th className="px-3 py-2.5 text-right font-semibold">Vistas</th>
                <th className="px-3 py-2.5 text-right font-semibold">WhatsApp</th>
                <th className="px-3 py-2.5 text-right font-semibold">Llamadas</th>
                <th className="px-3 py-2.5 text-right font-semibold">Disponibilidad</th>
                <th className="px-3 py-2.5 text-right font-semibold">Guardados</th>
                <th className="px-3 py-2.5 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f7] text-[#334155]">
              {items.map((item) => (
                <tr key={item.professional_id} className="hover:bg-[#f8fafc]">
                  <td className="max-w-[260px] px-3 py-2.5">
                    <Link href={`/admin/usuarios/${item.profile_id}`} className="block truncate font-semibold text-[#0f172a] hover:text-[#009FD9] hover:underline">
                      {item.professional_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.unique_visitors}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.profile_views}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.whatsapp_clicks}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.phone_clicks}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.availability_actions}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{item.favorites}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-[#009FD9]">{item.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && pagination.pages > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#64748b]">
          <span>Mostrando {from}-{to} de {pagination.total.toLocaleString("es-CR")}</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} aria-label="Página anterior" className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe2ea] bg-white disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span className="font-semibold">Página {pagination.page} de {pagination.pages}</span>
            <button type="button" onClick={() => setPage((value) => Math.min(pagination.pages, value + 1))} disabled={page >= pagination.pages} aria-label="Página siguiente" className="grid h-9 w-9 place-items-center rounded-lg border border-[#dbe2ea] bg-white disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
