"use client";

import { useEffect, useState, useCallback } from "react";
import { Flag, ExternalLink, Check, RotateCcw, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

type Report = {
  id: string;
  professional_id: string | null;
  professional_slug: string | null;
  professional_name: string | null;
  reason: string;
  reporter_email: string | null;
  status: "open" | "resolved";
  created_at: string;
};

const FILTERS = [
  { value: "open", label: "Abiertos" },
  { value: "resolved", label: "Resueltos" },
  { value: "all", label: "Todos" },
];

export function AdminReports() {
  const [status, setStatus] = useState("open");
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (s: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/reports?status=${s}`);
      const data = await res.json();
      setReports(data.reports ?? []);
    } catch {
      setReports([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(status); }, [status, load]);
  useAdminAutoRefresh(() => {
    if (busyId) return;
    void load(status, true);
  }, [busyId, load, status]);

  async function setReportStatus(id: string, next: "open" | "resolved") {
    setBusyId(id);
    await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: next }),
    });
    setBusyId(null);
    load(status);
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-5">
        <Flag className="h-5 w-5 text-[#dc2626]" />
        <h1 className="text-xl font-bold text-[#111827]">Reportes y moderación</h1>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              status === f.value
                ? "bg-[#009FD9] text-white border-[#009FD9]"
                : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : reports.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#6b7280]">No hay reportes en esta vista.</div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {reports.map((r) => (
              <li key={r.id} className="p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-[#111827] text-sm">{r.professional_name ?? "Perfil"}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-md ${r.status === "open" ? "bg-[#fef3c7] text-[#b45309]" : "bg-[#dcfce7] text-[#15803d]"}`}>
                        {r.status === "open" ? "Abierto" : "Resuelto"}
                      </span>
                      <span className="text-xs text-[#9ca3af]">{new Date(r.created_at).toLocaleString("es-CR")}</span>
                    </div>
                    <p className="text-sm text-[#374151] mt-1 whitespace-pre-wrap">{r.reason}</p>
                    <p className="text-xs text-[#9ca3af] mt-1">Reportado por: {r.reporter_email ?? "Anónimo"}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {r.professional_slug && (
                        <a href={`/es/profesionales/${r.professional_slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#009FD9] hover:underline">
                          Ver perfil <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {r.professional_id && (
                        <>
                          <Link href={`/admin/proveedores/${r.professional_id}`} className="text-xs text-[#009FD9] hover:underline">
                            Abrir caso (moderar)
                          </Link>
                          <Link href={`/admin/usuarios/${r.professional_id}`} className="text-xs text-[#009FD9] hover:underline">
                            Ver perfil del usuario
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {r.status === "open" ? (
                      <button
                        onClick={() => setReportStatus(r.id, "resolved")}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-semibold px-3 py-2 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" /> Marcar resuelto
                      </button>
                    ) : (
                      <button
                        onClick={() => setReportStatus(r.id, "open")}
                        disabled={busyId === r.id}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] text-[#374151] text-xs font-medium px-3 py-2 disabled:opacity-60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Reabrir
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
