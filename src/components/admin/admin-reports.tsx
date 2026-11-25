"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  HISTORY_ACTION_LABEL,
  KIND_LABEL,
  UUID_RE,
  caseKindLabel,
  fullDate,
  groupReports,
  relativeAge,
  type AdminReport,
  type ReportCase,
} from "@/lib/moderation/report-cases";
import { AdminReportDetail } from "@/components/admin/admin-report-detail";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, FIELD, FOCUS, KindTag, PriorityChip, Segmented, StatusChip } from "@/components/admin/admin-report-ui";

const PAGE = 50;
const DESKTOP_QUERY = "(min-width: 1024px)";

// Móvil primero: un solo panel; en escritorio, cola y detalle lado a lado.
// Se decide en JS (no solo con CSS) para no duplicar controles en el DOM.
function useIsDesktop() {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", notify);
      return () => media.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

type Signal = { kind: string; id: string; reason: string; total: number };
type HistoryRow = { id: string; actor_id: string; action: string; reason: string; created_at: string };

export function AdminReports() {
  const isDesktop = useIsDesktop();
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"open" | "resolved" | "all">("open");
  const [priority, setPriority] = useState<"" | "urgent" | "high" | "normal">("");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<ReportCase | null>(null);
  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [manual, setManual] = useState<{ kind: string; id: string; open: boolean }>({ kind: "professional", id: "", open: false });

  // Enlaces "Historial y restauración" desde publicaciones y proyectos.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search), kind = q.get("targetType"), id = q.get("targetId");
    if (kind && id && kind in KIND_LABEL) queueMicrotask(() => setManual({ kind, id, open: true }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`/api/admin/reports?status=${status}&priority=${priority}&offset=${offset}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRows(d.reports); setTotal(d.total);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo cargar la cola.");
    } finally {
      setLoading(false);
    }
  }, [status, priority, offset]);
  useEffect(() => { let alive = true; queueMicrotask(() => { if (alive) void load(); }); return () => { alive = false; }; }, [load]);

  async function loadSignals() {
    setSignalsLoading(true); setError("");
    try {
      const r = await fetch("/api/admin/moderacion?signals=1", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setSignals(d.rows ?? []);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudieron cargar señales.");
    } finally {
      setSignalsLoading(false);
    }
  }

  const cases = groupReports(rows);
  const live = selectedId ? cases.find((c) => c.reports.some((r) => r.id === selectedId)) ?? null : null;
  const current = live ?? (selectedId ? snapshot : null);
  const grouped = rows.length - cases.length;

  function open(c: ReportCase) {
    setSelectedId(c.id);
    setSnapshot(c);
    if (!isDesktop) window.scrollTo({ top: 0 });
  }
  function back() {
    const id = selectedId;
    setSelectedId(null);
    setSnapshot(null);
    if (id) queueMicrotask(() => document.getElementById(`caso-${id}`)?.focus());
  }

  const showQueue = isDesktop || !current;
  const showDetailColumn = isDesktop || !!current;

  const manualTool = (
    <ManualAction
      key={`${manual.kind}:${manual.id}`}
      initialKind={manual.kind}
      initialId={manual.id}
      open={manual.open}
      onToggle={() => setManual((m) => ({ ...m, open: !m.open }))}
      onChanged={load}
    />
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-[#162543]">Reportes y moderación</h1>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#64748b]">
          Priorice riesgos, verifique la evidencia y registre una decisión proporcional. Reportar, recibir varios reportes o tardar en contestar no demuestran una infracción.
        </p>
      </div>

      {showQueue && (
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            label="Estado"
            value={status}
            onChange={(v) => { setStatus(v); setOffset(0); }}
            options={[{ value: "open", label: "Abiertos" }, { value: "resolved", label: "Resueltos" }, { value: "all", label: "Todos" }]}
          />
          <Segmented
            label="Prioridad"
            value={priority}
            onChange={(v) => { setPriority(v); setOffset(0); }}
            options={[{ value: "", label: "Todas" }, { value: "urgent", label: "Urgente" }, { value: "high", label: "Alta" }, { value: "normal", label: "Normal" }]}
          />
          <button type="button" className={BTN_SECONDARY} disabled={loading} onClick={() => void load()}>
            <RefreshCw aria-hidden className={cn("h-4 w-4", loading && "animate-spin")} /> Actualizar
          </button>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>}

      <div className={cn("grid gap-4", isDesktop && "grid-cols-[minmax(0,380px)_minmax(0,1fr)] items-start")}>
        {showQueue && (
          <div className="min-w-0 space-y-3">
            {loading ? (
              <p role="status" className="flex items-center gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-4 text-sm text-[#64748b]"><Loader2 aria-hidden className="h-4 w-4 animate-spin text-[#087ca3]" />Cargando casos…</p>
            ) : (
              <>
                <p className="text-sm text-[#475569]">
                  <span className="font-bold text-[#162543]">{total} {total === 1 ? "caso" : "casos"}</span> · ordenados del más antiguo al más reciente
                  {grouped > 0 && <span className="block text-xs text-[#64748b]">En esta página, {rows.length} reportes se muestran como {cases.length} casos al agrupar los relacionados.</span>}
                </p>
                {!cases.length && (
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#d7e1ea] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
                    <ClipboardList aria-hidden className="h-6 w-6 text-[#94a3b8]" />No hay casos en esta vista.
                  </div>
                )}
                <ul className="space-y-2">
                  {cases.map((c) => <QueueCard key={c.id} item={c} selected={current?.id === c.id || (!!selectedId && c.reports.some((r) => r.id === selectedId))} onOpen={() => open(c)} />)}
                </ul>
                {total > PAGE && (
                  <nav aria-label="Paginación de casos" className="flex items-center justify-between gap-3">
                    <button type="button" className={BTN_SECONDARY} disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Anterior</button>
                    <span className="text-xs text-[#64748b]">{offset + 1}–{Math.min(offset + PAGE, total)} de {total}</span>
                    <button type="button" className={BTN_SECONDARY} disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Siguiente</button>
                  </nav>
                )}
              </>
            )}

            <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
              <button type="button" className={cn(BTN_SECONDARY, "w-full justify-start border-0")} disabled={signalsLoading} onClick={() => void loadSignals()}>
                {signalsLoading ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : <ShieldAlert aria-hidden className="h-4 w-4 text-[#087ca3]" />}Consultar señales de spam o reincidencia
              </button>
              {signals && (signals.length === 0 ? (
                <p className="px-3 pb-1 text-xs text-[#64748b]">No hay señales en este momento.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {signals.map((s) => (
                    <li key={`${s.kind}-${s.id}`} className="rounded-xl border border-[#eef2f6] bg-[#f8fafc] p-3 text-sm">
                      <p className="text-[#162543]">{s.reason} · {s.total} registros.</p>
                      <p className="text-xs text-[#64748b]">Es una señal para revisar, no una prueba de abuso.</p>
                      <button type="button" className={cn(BTN_SECONDARY, "mt-2")} onClick={() => { setSelectedId(null); setSnapshot(null); setManual({ kind: s.kind, id: s.id, open: true }); }}>Revisar contenido identificado</button>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
            {!isDesktop && !current && manualTool}
          </div>
        )}

        {showDetailColumn && (
          <div className={cn("min-w-0 space-y-4", isDesktop && "sticky top-4")}>
            {current ? (
              <AdminReportDetail key={selectedId!} item={current} stale={!live && !loading} showBack={!isDesktop} onBack={back} onChanged={load} />
            ) : (
              <>
                <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[#d7e1ea] bg-white px-4 py-12 text-center">
                  <ChevronRight aria-hidden className="h-6 w-6 rotate-180 text-[#94a3b8]" />
                  <p className="text-sm font-semibold text-[#162543]">Seleccione un caso de la cola</p>
                  <p className="max-w-sm text-xs text-[#64748b]">Verá el contenido reportado, quién lo reportó, el historial y las acciones disponibles.</p>
                </div>
                {manualTool}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ item, selected, onOpen }: { item: ReportCase; selected: boolean; onOpen: () => void }) {
  const count = item.reports.length;
  return (
    <li>
      <article className={cn("relative rounded-2xl border bg-white p-3.5 transition", selected ? "border-[#087ca3] ring-1 ring-[#087ca3]" : "border-[#e5e7eb] hover:border-[#cbd5e1]")}>
        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityChip priority={item.priority} />
          <KindTag kind={item.primary.target_type} label={caseKindLabel(item)} />
          {count > 1 && <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[11px] font-bold text-[#5b21b6]">{count} reportes relacionados</span>}
        </div>
        <h3 className="mt-2 break-words text-sm font-bold text-[#162543]">{item.primary.subject_name}</h3>
        <p className="mt-0.5 line-clamp-2 break-words text-sm text-[#475569]">{item.primary.reason}</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748b]">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <time dateTime={item.createdAt} title={fullDate(item.createdAt)}>{relativeAge(item.createdAt)}</time>
            <span aria-hidden>·</span>
            <span>{item.assignedName ? `Responsable: ${item.assignedName}` : "Sin asignar"}</span>
            <StatusChip status={item.status} />
          </span>
          {/* Botón extendido: toda la tarjeta abre el caso. */}
          <button
            id={`caso-${item.id}`}
            type="button"
            aria-current={selected ? "true" : undefined}
            onClick={onOpen}
            className={cn("inline-flex min-h-10 items-center gap-0.5 rounded-lg px-2 text-xs font-semibold text-[#087ca3] after:absolute after:inset-0 after:rounded-2xl after:content-['']", FOCUS)}
          >
            Atender y ver historial<ChevronRight aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </article>
    </li>
  );
}

// Herramienta para contenido sin caso (señales o enlaces "Historial y restauración").
// Usa el mismo POST /api/admin/moderacion y la misma acción de fotos de siempre.
function ManualAction({ initialKind, initialId, open, onToggle, onChanged }: {
  initialKind: string;
  initialId: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [kind, setKind] = useState(initialKind);
  const [id, setId] = useState(initialId);
  const [report, setReport] = useState("");
  const [reason, setReason] = useState("");
  const [action, setAction] = useState<"hide" | "restore" | "warn" | "restrict" | "unrestrict">("warn");
  const [days, setDays] = useState(7);
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const idOk = UUID_RE.test(id.trim());
  const reportOk = !report.trim() || UUID_RE.test(report.trim());
  const reasonOk = reason.trim().length >= 5 && reason.trim().length <= 1000;
  const destructive = action === "hide" || action === "restrict";

  async function loadHistory() {
    if (!idOk) return;
    setHistoryLoading(true); setError("");
    try {
      const r = await fetch(`/api/admin/moderacion?id=${encodeURIComponent(id.trim())}`, { cache: "no-store" });
      if (!r.ok) throw Error();
      setHistory((await r.json()).rows ?? []);
    } catch {
      setError("No se pudo leer el historial.");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function post(url: string, body: unknown, message: string) {
    setBusy(true); setError(""); setNotice(""); setConfirming(false);
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(d.error || "No se pudo guardar.");
      setNotice(message);
      await onChanged();
      if (history) void loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  const save = () => void post("/api/admin/moderacion", { kind, id: id.trim(), action, reason, report: report.trim() || null, days }, "Acción registrada en la auditoría.");

  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white">
      <button type="button" aria-expanded={open} onClick={onToggle} className={cn("flex min-h-12 w-full items-center justify-between gap-2 rounded-2xl px-4 text-left text-sm font-bold text-[#162543]", FOCUS)}>
        Acción sobre contenido identificado
        <ChevronDown aria-hidden className={cn("h-4 w-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#eef2f6] p-4">
          <p className="text-xs leading-relaxed text-[#64748b]">Retirar oculta la publicación y permite restaurarla. Una restricción de cuenta impide nuevas publicaciones y mensajes por el plazo elegido; no elimina la cuenta. Una advertencia se registra en el expediente.</p>
          <label className="block text-xs font-semibold text-[#475569]">Tipo
            <select className={cn(FIELD, "mt-1 min-h-10")} value={kind} onChange={(e) => setKind(e.target.value)}>
              {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-[#475569]">ID del contenido o cuenta
            <input className={cn(FIELD, "mt-1 min-h-10")} value={id} onChange={(e) => { setId(e.target.value); setHistory(null); }} />
          </label>
          <button type="button" className={BTN_SECONDARY} disabled={!idOk || historyLoading} onClick={() => void loadHistory()}>
            {historyLoading && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}Consultar historial de este contenido
          </button>
          {history && (
            history.length === 0 ? <p className="text-sm text-[#64748b]">Sin decisiones previas.</p> : (
              <ol className="space-y-2 border-l-2 border-[#e2e8f0] pl-3">
                {history.map((h) => (
                  <li key={h.id} className="text-sm">
                    <span className="font-semibold text-[#162543]">{HISTORY_ACTION_LABEL[h.action] ?? h.action}</span>
                    <span className="block text-xs text-[#64748b]">{fullDate(h.created_at)} · Administrador {(h.actor_id ?? "").slice(0, 8)}</span>
                    <span className="block whitespace-pre-wrap break-words text-[#334155]">{h.reason}</span>
                  </li>
                ))}
              </ol>
            )
          )}
          <label className="block text-xs font-semibold text-[#475569]">ID del reporte relacionado (opcional)
            <input className={cn(FIELD, "mt-1 min-h-10")} value={report} onChange={(e) => setReport(e.target.value)} />
          </label>
          <label className="block text-xs font-semibold text-[#475569]">Motivo de la acción (visible al afectado)
            <textarea className={cn(FIELD, "mt-1 min-h-24")} minLength={5} maxLength={1000} value={reason} onChange={(e) => { setReason(e.target.value); setConfirming(false); }} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-[#475569]">Acción de moderación
              <select className={cn(FIELD, "mt-1 min-h-10 w-auto")} value={action} onChange={(e) => { setAction(e.target.value as typeof action); setConfirming(false); }}>
                <option value="warn">Registrar advertencia</option>
                <option value="hide">Retirar de publicación</option>
                <option value="restore">Restaurar</option>
                <option value="restrict">Restringir cuenta temporalmente</option>
                <option value="unrestrict">Quitar restricción de cuenta</option>
              </select>
            </label>
            {action === "restrict" && (
              <label className="text-xs font-semibold text-[#475569]">Días
                <input className={cn(FIELD, "mt-1 min-h-10 w-24")} type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} />
              </label>
            )}
            <button type="button" className={destructive ? BTN_DANGER : BTN_PRIMARY} disabled={busy || !idOk || !reportOk || !reasonOk || confirming || (action === "restrict" && !(days >= 1 && days <= 30))} onClick={() => (destructive ? setConfirming(true) : save())}>
              Guardar acción manual
            </button>
          </div>
          {confirming && (
            <div role="group" aria-label="Confirmar acción manual" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-3">
              <p className="text-sm font-semibold text-[#7f1d1d]">¿Confirma esta acción? Queda registrada en la auditoría con el motivo escrito.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className={BTN_DANGER} disabled={busy} onClick={save}>Confirmar y guardar</button>
                <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
              </div>
            </div>
          )}
          {kind === "professional" && (
            <div className="space-y-2 border-t border-[#eef2f6] pt-3">
              <label className="block text-xs font-semibold text-[#475569]">URL pública de la foto de casos de éxito
                <input className={cn(FIELD, "mt-1 min-h-10")} value={photo} onChange={(e) => setPhoto(e.target.value)} />
              </label>
              <div className="flex flex-wrap gap-2">
                {[false, true].map((restore) => (
                  <button key={String(restore)} type="button" className={BTN_SECONDARY} disabled={busy || !photo || !idOk || !reasonOk} onClick={() => void post(`/api/admin/providers/${encodeURIComponent(id.trim())}/moderate`, { action: restore ? "restore_photo" : "remove_photo", url: photo, reason }, restore ? "Foto restaurada." : "Foto retirada.")}>
                    {restore ? "Restaurar foto de casos de éxito" : "Retirar foto de casos de éxito"}
                  </button>
                ))}
              </div>
            </div>
          )}
          {error && <p role="alert" className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm text-[#166534]">{notice}</p>}
        </div>
      )}
    </section>
  );
}
