"use client";

import { useEffect, useState, useCallback } from "react";
import { ChevronRight, Search, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCategoryLabel } from "@/lib/data/categories";
import {
  VERIFICATION_STATUSES,
  verificationLabel,
  verificationPillClasses,
  type VerificationStatus,
} from "@/lib/verification";
import { formatId } from "@/lib/cedula";
import { getInitials } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

type IdentityBucket = "cedula" | "juridica" | "dimex" | "nite" | "manual";

type Row = {
  id: string;
  slug: string | null;
  detail_href?: string;
  role_label?: string;
  identity_type?: IdentityBucket;
  identity_type_label?: string;
  verification_status: VerificationStatus;
  whatsapp?: string | null;
  category_id: string | null;
  professions: string[] | null;
  created_at: string;
  profiles: { full_name?: string; email?: string; cedula?: string; avatar_url?: string } | null;
};

// Exception-only by default: the owner reviews flagged cases, not everyone.
// Clean auto-verified pros are tucked behind "Verificados".
const IDENTITY_FILTERS: { id: IdentityBucket; label: string }[] = [
  { id: "cedula", label: "Nacional" },
  { id: "juridica", label: "Jurídica" },
  { id: "dimex", label: "DIMEX" },
  { id: "nite", label: "NITE" },
  { id: "manual", label: "Manual" },
];

const FILTERS: { value: string; label: string }[] = [
  { value: "pending", label: "Pendientes de revisión" },
  { value: "under_appeal", label: "Apelaciones (tickets)" },
  { value: "verified", label: "Verificados" },
  { value: "rejected", label: "Rechazados" },
  { value: "all", label: "Todos" },
];

// The verification message asks for what the account does not already hold:
// a selfie with the ID, proof of the trade and a recent job. Never the data
// already on file (name, cédula, phone).
function verificationWhatsAppHref(row: Row) {
  const digits = String(row.whatsapp ?? "").replace(/\D/g, "");
  const phone = digits.length === 8 ? `506${digits}` : digits;
  const firstName = (row.profiles?.full_name ?? "").trim().split(/\s+/)[0] || "";
  const service = row.category_id ? getCategoryLabel(row.category_id) : "tu servicio";
  const idLabel = row.identity_type_label && row.identity_type !== "manual" ? ` (${row.identity_type_label})` : "";
  const text = `Hola${firstName ? ` ${firstName}` : ""}, te escribimos de ContrataCR para verificar tu perfil de ${service}. Para marcarte como verificado necesitamos: 1) una foto tuya sosteniendo tu identificación${idLabel} junto a tu rostro, 2) una foto o documento que respalde tu oficio (título, carné, patente o certificado) y 3) una foto de un trabajo reciente. Con eso activamos tu insignia de verificado. ¡Gracias!`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

export function AdminQueue() {
  const [status, setStatus] = useState<string>("pending");
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [identityCounts, setIdentityCounts] = useState<Record<IdentityBucket, number>>({} as Record<IdentityBucket, number>);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [outreachBusy, setOutreachBusy] = useState(false);
  const [outreachResult, setOutreachResult] = useState<string | null>(null);
  async function contactPending() {
    setOutreachBusy(true);
    setOutreachResult(null);
    try {
      const res = await fetch("/api/admin/providers/outreach", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo contactar.");
      setOutreachResult(`${data.pending} pendientes · ${data.notified} avisados por app y correo por primera vez · WhatsApp: ${data.whatsappConfigured ? `${data.whatsapp} enviados, ${data.alreadyWhatsApp} ya contactados antes` : "plantilla no configurada todavía"}.`);
    } catch (error) {
      setOutreachResult(error instanceof Error ? error.message : "No se pudo contactar.");
    } finally {
      setOutreachBusy(false);
    }
  }

  const load = useCallback(async (s: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/admin/providers?status=${s}`);
      const data = await res.json();
      setRows(data.providers ?? []);
      setCounts(data.counts ?? {});
      setIdentityCounts(data.identityCounts ?? {});
    } catch {
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => load(status));
  }, [status, load]);
  useAdminAutoRefresh(() => void load(status, true), [load, status]);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const hay = `${r.profiles?.full_name ?? ""} ${r.profiles?.email ?? ""} ${r.profiles?.cedula ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });
  const filterCounts = Object.fromEntries(
    FILTERS.map((f) => [
      f.value,
      f.value === "all"
        ? VERIFICATION_STATUSES.reduce((sum, s) => sum + (counts[s] ?? 0), 0)
        : f.value === "pending"
          ? (counts.pending ?? 0) + (counts.under_appeal ?? 0)
          : counts[f.value] ?? 0,
    ]),
  );

  return (
    <div>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h1 className="text-xl font-bold text-[#111827]">Verificación de identidad</h1>
        <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void contactPending()}
          disabled={outreachBusy}
          title="Envía a cada pendiente, una sola vez por canal, el aviso con lo que necesitamos para verificarlo (app + correo, y WhatsApp si la plantilla está aprobada)"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 text-xs font-semibold text-[#15803d] hover:bg-[#dcfce7] disabled:opacity-60"
        >
          {outreachBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />} Contactar pendientes
        </button>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre, correo o cédula"
            className="h-9 w-72 rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
          />
        </div>
        </div>
      </div>
      {outreachResult && <p className="mb-4 rounded-xl border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">{outreachResult}</p>}

      <AdminFilterTabs tabs={FILTERS.map((f) => ({ id: f.value, label: f.label }))} value={status} onChange={setStatus} counts={filterCounts} />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {IDENTITY_FILTERS.map((item) => (
          <div key={item.id} className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">{item.label}</p>
            <p className="mt-0.5 text-lg font-bold text-[#0A2540]">{identityCounts[item.id] ?? 0}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-[#6b7280]">No hay cuentas en esta vista.</div>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {filtered.map((r) => (
              <li key={r.id} className="flex items-center gap-3 pr-4 transition-colors hover:bg-[#f9fafb]">
                <Link
                  href={r.detail_href ?? `/admin/proveedores/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3"
                >
                  <div className="h-10 w-10 rounded-full bg-[#EBF5FB] text-[#009FD9] font-semibold flex items-center justify-center overflow-hidden shrink-0">
                    {r.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      getInitials(r.profiles?.full_name ?? "?")
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium leading-snug text-[#111827] sm:truncate">
                      {r.profiles?.full_name ?? "Sin nombre"}
                    </p>
                    <p className="line-clamp-2 text-xs text-[#6b7280] sm:truncate">
                      {r.profiles?.cedula ? `${formatId(r.profiles.cedula)} · ` : ""}
                      {r.role_label ?? "Cuenta"}
                      {r.category_id ? ` · ${getCategoryLabel(r.category_id)}` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {r.identity_type_label && (
                        <span className="inline-flex rounded-md bg-[#eef2f6] px-2 py-0.5 text-[11px] font-semibold text-[#374151]">{r.identity_type_label}</span>
                      )}
                      <span className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium sm:hidden ${verificationPillClasses(r.verification_status)}`}>
                        {verificationLabel(r.verification_status)}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`hidden shrink-0 rounded-md border px-2 py-1 text-xs font-medium sm:inline-flex ${verificationPillClasses(
                      r.verification_status
                    )}`}
                  >
                    {verificationLabel(r.verification_status)}
                  </span>
                </Link>
                {r.whatsapp && (
                  <a
                    href={verificationWhatsAppHref(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Escribir por WhatsApp para verificar"
                    title="Escribir por WhatsApp para verificar"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 text-xs font-semibold text-[#15803d] hover:bg-[#dcfce7]"
                  >
                    <MessageCircle className="h-4 w-4" /><span className="hidden md:inline">WhatsApp</span>
                  </a>
                )}
                <Link href={r.detail_href ?? `/admin/proveedores/${r.id}`} aria-label="Abrir" className="shrink-0 text-[#9ca3af] hover:text-[#0f172a]"><ChevronRight className="h-4 w-4" /></Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
