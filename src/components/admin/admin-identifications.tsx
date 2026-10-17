"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { IdCard, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminPadronLookup } from "./admin-padron-lookup";
import { formatId, idTypeLabel } from "@/lib/cedula";
import type { PendingIdentity, IdentityReview } from "@/lib/verification/admin-review";
import { olvidarDashboardCachePrefix } from "@/lib/dashboard-prefetch-cache";
import { ADMIN_REFRESH_EVENT, ADMIN_COUNTS_REFRESH_EVENT } from "@/hooks/use-admin-auto-refresh";

const labels: Record<IdentityReview["kind"], string> = {
  match: "Datos coincidentes", not_found: "No encontrada en Hacienda",
  unavailable: "Consulta no disponible", manual: "Revisión manual",
};
const explanations: Record<IdentityReview["kind"], string> = {
  match: "Hacienda encontró el número, tipo y nombre oficial. Puedes verificar el cotejo de datos.",
  not_found: "No significa que sea inválida. La cuenta puede apelar y adjuntar documentos.",
  unavailable: "No hubo una respuesta válida. Reintenta más tarde; no se rechazó la identificación.",
  manual: "Revisar los documentos o la decisión previa antes de aprobar.",
};
export function AdminIdentifications() {
  const [rows, setRows] = useState<PendingIdentity[]>([]);
  const [reviews, setReviews] = useState<Record<string, IdentityReview>>({});
  const [loading, setLoading] = useState(true);
  const [operation, setOperation] = useState<"inspect" | "verify" | null>(null);
  const busy = operation !== null;
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stop = useRef(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/identificaciones", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setRows(data.rows); setReviews({});
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la revisión."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); return () => { stop.current = true; }; }, [load]);
  async function inspect(targets: PendingIdentity[]) {
    if (busy || !targets.length) return;
    stop.current = false; setOperation("inspect"); setError(""); setNote(""); setProgress({ done: 0, total: targets.length });
    try {
      for (let index = 0; index < targets.length && !stop.current; index += 3) {
        const response = await fetch("/api/admin/identificaciones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: targets.slice(index, index + 3).map(row => row.accountId) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "No se pudo continuar. Puedes retomar la consulta.");
        setReviews(previous => ({ ...previous, ...Object.fromEntries((data.reviews as IdentityReview[]).map(review => [review.accountId, review])) }));
        setProgress({ done: Math.min(index + 3, targets.length), total: targets.length });
        if (index + 3 < targets.length) await new Promise(resolve => setTimeout(resolve, 1200));
      }
      setNote(stop.current ? "Consulta detenida. Los resultados obtenidos se conservan en esta vista." : "Revisión terminada. Consultar no cambia verificaciones ni envía correos.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo continuar la consulta."); }
    finally { setOperation(null); }
  }
  async function verify(targets: PendingIdentity[]) {
    if (busy || !targets.length) return;
    setOperation("verify"); setError(""); setNote(""); setProgress({ done: 0, total: targets.length });
    let verified = 0;
    try {
      for (const [index, row] of targets.entries()) {
        const response = await fetch("/api/admin/identificaciones/verificar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountId: row.accountId, cedula: row.cedula }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (data.outcome === "verified") { verified++; setRows(previous => previous.filter(candidate => candidate.accountId !== row.accountId)); }
        else if (data.review) setReviews(previous => ({ ...previous, [row.accountId]: data.review }));
        else setReviews(previous => { const next = { ...previous }; delete next[row.accountId]; return next; });
        setProgress({ done: index + 1, total: targets.length });
      }
      setNote(`${verified} ${verified === 1 ? "cuenta verificada" : "cuentas verificadas"}. Las demás mantienen su revisión. No se enviaron correos.`);
    } catch (cause) { setError(`${verified} verificadas. ${cause instanceof Error ? cause.message : "Recarga para comprobar el resultado."}`); }
    finally { setOperation(null); olvidarDashboardCachePrefix("admin:users:"); window.dispatchEvent(new Event(ADMIN_REFRESH_EVENT)); window.dispatchEvent(new Event(ADMIN_COUNTS_REFRESH_EVENT)); }
  }
  const eligible = rows.filter(row => reviews[row.accountId]?.canVerify);
  const filtered = rows.filter(row => {
    const review = reviews[row.accountId];
    if (filter === "with-id" && !row.cedula) return false;
    if (filter === "no-id" && row.cedula) return false;
    if (filter === "match" && !review?.canVerify) return false;
    if (filter === "manual" && !(row.manualReason || review?.kind === "manual")) return false;
    if (filter === "not_found" && review?.kind !== "not_found") return false;
    return `${row.name} ${row.cedula ?? ""} ${review?.officialName ?? ""}`.toLowerCase().includes(q.trim().toLowerCase());
  });
  return <div className="space-y-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold text-[#162543]"><IdCard className="h-6 w-6 text-[#009FD9]" />Identificaciones</h1><p className="mt-2 text-sm leading-6 text-[#68778d]">Consulta nacionales, jurídicas, DIMEX y NITE con Hacienda, aunque no tengan cuenta en ContrataCR. El resultado muestra solo nombre y tipo; no información tributaria.</p></div>
    <AdminPadronLookup standalone />
    <section id="pendientes" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[#162543]">Pendientes de verificación</h2><p className="mt-1 text-sm leading-6 text-[#68778d]">Consultar no aprueba cuentas. Las apelaciones y decisiones administrativas previas conservan la revisión manual.</p></div><button onClick={load} disabled={busy || loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold disabled:opacity-50"><RefreshCw className="h-4 w-4" />Actualizar</button></div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
        ["Pendientes", rows.length], ["Con identificación", rows.filter(row => row.cedula).length], ["Sin identificación", rows.filter(row => !row.cedula).length], ["Coincidencias para verificar", eligible.length],
      ].map(([label, value]) => <div key={label} className="rounded-xl border border-[#e5e7eb] bg-white p-4"><p className="text-xs text-[#68778d]">{label}</p><p className="mt-1 text-2xl font-bold text-[#162543]">{loading ? "—" : value}</p></div>)}</div>
      <div className="flex flex-wrap gap-2"><button disabled={busy || loading || !rows.length} onClick={() => inspect(rows.filter(row => !reviews[row.accountId] || reviews[row.accountId].kind === "unavailable").length ? rows.filter(row => !reviews[row.accountId] || reviews[row.accountId].kind === "unavailable") : rows)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#009FD9] px-4 text-sm font-bold text-white disabled:opacity-50">{operation === "inspect" && <Loader2 className="h-4 w-4 animate-spin" />}Revisar pendientes con Hacienda</button>{eligible.length > 0 && <button disabled={busy} onClick={() => verify(eligible)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#087ca3] px-4 text-sm font-bold text-white disabled:opacity-50">{operation === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Verificar {eligible.length} {eligible.length === 1 ? "coincidencia" : "coincidencias"}</button>}{busy && <p role="status" className="self-center text-sm text-[#526277]">{operation === "verify" ? "Verificando" : "Consultando"} {progress.done} de {progress.total}</p>}</div>
      {note && <p role="status" className="rounded-xl bg-[#f1fbfe] p-3 text-sm text-[#0f6380]">{note}</p>}{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-col gap-3 sm:flex-row"><input aria-label="Buscar pendiente" value={q} onChange={event => setQ(event.target.value)} placeholder="Buscar por nombre o identificación" className="h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" /><select aria-label="Filtrar pendientes" value={filter} onChange={event => setFilter(event.target.value)} className="h-11 rounded-xl border bg-white px-3 text-sm"><option value="all">Todos</option><option value="with-id">Con identificación</option><option value="no-id">Sin identificación</option><option value="match">Coincidencias</option><option value="manual">Revisión manual</option><option value="not_found">No encontrados</option></select></div>
      {loading ? <p className="py-6 text-sm text-[#68778d]">Cargando pendientes…</p> : !filtered.length ? <p className="rounded-xl border p-6 text-sm text-[#68778d]">No hay pendientes en esta vista.</p> : <div className="divide-y divide-[#eef2f6] rounded-xl border border-[#e5e7eb]">{filtered.map(row => {
        const review = reviews[row.accountId];
        return <article key={row.accountId} data-testid="identity-review-row" className="space-y-3 bg-white p-4 first:rounded-t-xl last:rounded-b-xl sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-[#162543]">{row.name}</h3><p className="mt-1 break-all text-sm text-[#526277]">{row.cedula ? formatId(row.cedula) : "Sin identificación registrada"} · {review?.type ? idTypeLabel(review.type) : row.type ? idTypeLabel(row.type) : "Revisión manual"} · {row.professionalId ? "Profesional" : "Cliente"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${review?.canVerify ? "bg-green-50 text-green-800" : "bg-[#f5f8fb] text-[#526277]"}`}>{review ? labels[review.kind] : "Sin consultar"}</span></div>
          {review?.officialName && <p className="break-words text-sm text-[#162543]"><span className="font-semibold">Nombre en Hacienda: </span>{review.officialName}</p>}
          {(row.manualReason || review) && <p className="text-sm leading-6 text-[#68778d]">{row.manualReason || (review ? explanations[review.kind] : "")}</p>}
          <div className="flex flex-wrap gap-3"><button onClick={() => inspect([row])} disabled={busy} className="min-h-10 rounded-lg border border-[#d7e1ea] px-3 text-sm font-semibold text-[#087ca3] disabled:opacity-50">Consultar</button>{review?.canVerify && <button onClick={() => verify([row])} disabled={busy} className="min-h-10 rounded-lg bg-[#087ca3] px-3 text-sm font-bold text-white disabled:opacity-50">Verificar coincidencia</button>}<Link className="inline-flex min-h-10 items-center text-sm font-semibold text-[#087ca3]" href={`/admin/usuarios/${row.accountId}?from=verificacion`}>Ver caso →</Link></div>
        </article>;
      })}</div>}
    </section>
  </div>;
}
