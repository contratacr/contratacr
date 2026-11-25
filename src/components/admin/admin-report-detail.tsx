"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, History, Info, Loader2, Lock, MessageSquareText, RefreshCw, UserCheck, UserSearch } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  HISTORY_ACTION_LABEL,
  MAX_RESTRICT_DAYS,
  PLACEHOLDER_RE,
  RESTRICT_DAYS,
  adminProfileHref,
  caseKindLabel,
  contentHref,
  fullDate,
  historyIds,
  ladderPayload,
  ladderTemplate,
  linkedReport,
  publicProfileHref,
  relativeAge,
  reportedProId,
  type LadderId,
  type ModerationPayload,
  type ReportCase,
  type ReportPriority,
} from "@/lib/moderation/report-cases";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, FIELD, FOCUS, KindTag, LINK, PriorityChip, StatusChip } from "@/components/admin/admin-report-ui";

type HistoryRow = { id: string; actor_id: string; report_id?: string | null; target_type?: string; target_id?: string; action: string; reason: string; created_at: string };

// Texto fijo para asignar o cambiar prioridad: la RPC lo guarda como
// decision_reason, que la persona reportada puede ver en sus decisiones.
const REVIEW_NOTE = "Caso en revisión por el equipo de moderación.";
const REASON_LABEL = "Motivo (visible al afectado si se registra como decisión)";

const LADDER: ReadonlyArray<{ id: LadderId; title: string; hint: string; destructive: boolean }> = [
  { id: "warn", title: "Advertencia", hint: "Queda en el expediente de la cuenta. No limita su uso.", destructive: false },
  { id: "hide", title: "Retirar contenido", hint: "Oculta la publicación o reseña; se puede restaurar.", destructive: true },
  { id: "restrict", title: "Restricción temporal", hint: "Impide publicar y enviar mensajes durante el plazo elegido.", destructive: true },
  { id: "block", title: "Bloqueo", hint: "", destructive: true },
  { id: "none", title: "Resolver sin infracción", hint: "Cierra el caso sin sanción.", destructive: false },
];

async function send(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    return r.ok ? null : (d.error as string) || "No se pudo guardar.";
  } catch {
    return "No se pudo guardar. Revise la conexión.";
  }
}

export function AdminReportDetail({ item, stale, showBack, onBack, onChanged }: {
  item: ReportCase;
  /** El caso ya no aparece en la vista filtrada (por ejemplo, tras resolverlo). */
  stale: boolean;
  showBack: boolean;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const uid = useId();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [ladder, setLadder] = useState<LadderId>("warn");
  const [days, setDays] = useState<number>(7);
  const [priority, setPriority] = useState<ReportPriority>(item.priority);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [photo, setPhoto] = useState("");
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyState, setHistoryState] = useState<"loading" | "ready" | "error">("loading");
  const [historyTick, setHistoryTick] = useState(0);

  const ids = historyIds(item);
  const idsKey = ids.join(",");
  const count = item.reports.length;
  const r0 = item.primary;
  const payload = ladderPayload(ladder, item, days);
  const trimmed = reason.trim();
  const hasPlaceholder = PLACEHOLDER_RE.test(reason);
  const reasonOk = trimmed.length >= 5 && trimmed.length <= 1000 && !hasPlaceholder;
  const step = LADDER.find((s) => s.id === ladder)!;
  const isPro = item.reports.some((r) => reportedProId(r));
  const accountId = item.reports.find((r) => r.subject_user_id)?.subject_user_id ?? null;
  const proId = item.reports.map(reportedProId).find(Boolean) ?? null;
  const adminHref = adminProfileHref(item);
  const publicHref = publicProfileHref(item);
  const conversations = [...new Map(item.reports.filter((r) => r.conversation_id).map((r) => [r.conversation_id!, r])).values()];
  const appeals = item.reports.filter((r) => r.appeal_reason);

  useEffect(() => { headingRef.current?.focus(); }, []);
  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  // El historial se carga solo al abrir el caso (y tras cada decisión).
  useEffect(() => {
    let alive = true;
    const list = idsKey ? idsKey.split(",") : [];
    queueMicrotask(async () => {
      if (!alive) return;
      setHistoryState("loading");
      if (!list.length) { setHistory([]); setHistoryState("ready"); return; }
      try {
        const batches = await Promise.all(list.map(async (id) => {
          const r = await fetch(`/api/admin/moderacion?id=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (!r.ok) throw Error();
          return ((await r.json()).rows ?? []) as HistoryRow[];
        }));
        if (!alive) return;
        const merged = [...new Map(batches.flat().map((row) => [row.id, row])).values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
        setHistory(merged);
        setHistoryState("ready");
      } catch {
        if (alive) setHistoryState("error");
      }
    });
    return () => { alive = false; };
  }, [idsKey, historyTick]);

  function chooseLadder(next: LadderId) {
    const previousTemplate = ladderTemplate(ladder, item, days);
    setLadder(next);
    setConfirming(false);
    if (!trimmed || reason === previousTemplate) setReason(ladderTemplate(next, item, days));
  }

  function chooseDays(next: number) {
    if (reason === ladderTemplate("restrict", item, days)) setReason(ladderTemplate("restrict", item, next));
    setDays(next);
  }

  async function finish(message: string, failures: string[]) {
    if (failures.length) setError(failures.length === 1 ? failures[0] : `Algunos reportes no se actualizaron (${failures.length} de ${count}). ${failures[0]}`);
    else setNotice(message);
    await onChanged();
    setHistoryTick((t) => t + 1);
  }

  // Cambios del caso (estado, prioridad, responsable): mismo PATCH de siempre, uno por reporte del grupo.
  async function updateCase(change: { status?: "open" | "resolved"; priority?: ReportPriority; assign?: boolean }, text: string, message: string) {
    setBusy(true); setError(""); setNotice("");
    const failures: string[] = [];
    for (const r of item.reports) {
      const failure = await send("/api/admin/reports", "PATCH", {
        id: r.id,
        status: change.status ?? r.status,
        priority: change.priority ?? r.priority,
        reason: text,
        assign: change.assign ?? false,
      });
      if (failure) failures.push(failure);
    }
    await finish(message, failures);
    setBusy(false);
  }

  async function moderate(p: ModerationPayload, message: string) {
    setBusy(true); setError(""); setNotice(""); setConfirming(false);
    const failure = await send("/api/admin/moderacion", "POST", { kind: p.kind, id: p.id, action: p.action, reason, report: linkedReport(item, p), days: p.days });
    await finish(`${message} Si el caso queda atendido, resuélvalo con motivo.`, failure ? [failure] : []);
    setBusy(false);
  }

  async function other(url: string, body: unknown, message: string) {
    setBusy(true); setError(""); setNotice("");
    const failure = await send(url, "POST", body);
    await finish(message, failure ? [failure] : []);
    setBusy(false);
  }

  function saveLadder() {
    if (!payload || !reasonOk) return;
    if (step.destructive) setConfirming(true);
    else void moderate(payload, `${step.title} registrada.`);
  }

  const blockHint = isPro
    ? "Retira el perfil profesional de la búsqueda hasta que se restaure."
    : `No existe bloqueo permanente: se aplica la restricción máxima de ${MAX_RESTRICT_DAYS} días.`;
  const unavailable: Partial<Record<LadderId, string>> = {
    hide: isPro ? "Para retirar el perfil profesional use Bloqueo." : "Este caso no tiene una publicación que retirar.",
    restrict: "Este caso no identifica una cuenta.",
    block: "Este caso no identifica una cuenta.",
    warn: "Este caso no identifica una cuenta ni contenido.",
  };

  const timeline = [
    ...history.map((h) => ({ id: h.id, at: h.created_at, title: HISTORY_ACTION_LABEL[h.action] ?? h.action, body: h.reason, meta: `Administrador ${(h.actor_id ?? "").slice(0, 8)}` })),
    ...appeals.map((r) => ({ id: `appeal-${r.id}`, at: r.appealed_at ?? r.created_at, title: "Solicitud de revisión del afectado", body: r.appeal_reason ?? "", meta: "Apelación única" })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section aria-labelledby={`${uid}-title`} className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white">
      {/* Cabecera */}
      <div className="border-b border-[#eef2f6] p-4 sm:p-5">
        {showBack && (
          <button type="button" onClick={onBack} className={cn("mb-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg pr-2 text-sm font-semibold text-[#374151] hover:text-[#0f172a]", FOCUS)}>
            <ArrowLeft aria-hidden className="h-4 w-4" /> Volver a la cola
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          <KindTag kind={r0.target_type} label={caseKindLabel(item)} />
          <PriorityChip priority={item.priority} />
          <StatusChip status={item.status} />
          {count > 1 && <span className="rounded-full bg-[#ede9fe] px-2 py-0.5 text-[11px] font-bold text-[#5b21b6]">{count} reportes relacionados</span>}
        </div>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className="mt-2 break-words text-lg font-bold text-[#162543] focus:outline-none">{r0.subject_name}</h2>
        <p className="mt-0.5 text-xs text-[#64748b]">
          Recibido <time dateTime={item.createdAt} title={fullDate(item.createdAt)}>{relativeAge(item.createdAt)}</time> · Responsable: {item.assignedName || "Sin asignar"}
        </p>
        {stale && <p role="status" className="mt-2 rounded-lg bg-[#f1f5f9] px-3 py-2 text-xs text-[#475569]">Este caso ya no aparece en el filtro actual. Se muestra la última información cargada.</p>}
        <div className="mt-2 flex flex-wrap gap-x-4">
          {item.reports.map((r) => contentHref(r)).filter((href, i, all): href is string => !!href && all.indexOf(href) === i).map((href) => (
            <Link key={href} className={LINK} href={href}><ExternalLink aria-hidden className="h-4 w-4" />Abrir contenido</Link>
          ))}
          {adminHref && !item.reports.some((r) => contentHref(r) === adminHref) && (
            <Link className={LINK} href={adminHref}><UserSearch aria-hidden className="h-4 w-4" />Ver perfil en administración</Link>
          )}
          {publicHref && <Link className={LINK} href={publicHref}><ExternalLink aria-hidden className="h-4 w-4" />Ver perfil público</Link>}
          {conversations.map((r) => (
            <Link key={r.conversation_id} className={LINK} href={`/admin/conversaciones?conversation=${r.conversation_id}&report=${r.id}`}><MessageSquareText aria-hidden className="h-4 w-4" />Revisión restringida del chat</Link>
          ))}
        </div>
      </div>

      {/* Reportes del caso */}
      <div className="space-y-3 border-b border-[#eef2f6] p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[#0f172a]">{count > 1 ? `Reportes de este caso (${count})` : "Reporte"}</h3>
        <p className="flex items-start gap-2 rounded-lg border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs leading-relaxed text-[#78350f]">
          <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          La identidad de quien reporta es confidencial. Nunca la muestre ni la insinúe a la persona reportada, tampoco en los motivos.
        </p>
        <ul className="space-y-2">
          {item.reports.map((r) => (
            <li key={r.id} className="rounded-xl border border-[#eef2f6] bg-[#f8fafc] p-3">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#64748b]">
                <span className="font-semibold text-[#334155]">{r.kind === "block" || /^Bloqueo de usuario/.test(r.reason) ? "Bloqueo de usuario" : "Reporte"}</span>
                <time dateTime={r.created_at}>{fullDate(r.created_at)}</time>
                {count > 1 && <PriorityChip priority={r.priority} />}
              </p>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-[#162543]">{r.reason}</p>
              <p className="mt-1.5 text-xs text-[#64748b]">Reportado por: <span className="font-medium text-[#334155]">{r.reporter_name || "Visitante o registro anterior"}</span> · Caso {r.id}</p>
              {r.decision_reason && <p className="mt-1 text-xs text-[#475569]">Última decisión: {r.decision_reason}</p>}
            </li>
          ))}
        </ul>
      </div>

      {/* Apelación (una sola por decisión, ya modelada) */}
      {appeals.length > 0 && (
        <div className="border-b border-[#eef2f6] p-4 sm:p-5">
          <h3 className="text-sm font-bold text-[#0f172a]">Solicitud de revisión</h3>
          {appeals.map((r) => (
            <p key={r.id} className="mt-2 whitespace-pre-wrap break-words rounded-lg border border-[#c7d2fe] bg-[#eef2ff] px-3 py-2 text-sm text-[#312e81]">{r.appeal_reason}</p>
          ))}
          <p className="mt-1 text-xs text-[#64748b]">La persona afectada puede pedir una sola revisión por decisión. Revise el caso con otra mirada antes de mantener o revertir.</p>
        </div>
      )}

      {/* Acciones del caso */}
      <div className="space-y-4 border-b border-[#eef2f6] p-4 sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          {item.status === "open" && (
            <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void updateCase({ assign: true }, REVIEW_NOTE, "Caso asignado a usted y marcado en revisión.")}>
              <UserCheck aria-hidden className="h-4 w-4" /> Asignarme el caso
            </button>
          )}
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-[#475569]">
              Prioridad del caso
              <select className={cn(FIELD, "mt-1 min-h-10 w-auto")} value={priority} onChange={(e) => setPriority(e.target.value as ReportPriority)}>
                <option value="normal">Normal</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>
            <button type="button" className={BTN_SECONDARY} disabled={busy || item.reports.every((r) => r.priority === priority)} onClick={() => void updateCase({ priority }, REVIEW_NOTE, "Prioridad actualizada.")}>Aplicar prioridad</button>
          </div>
        </div>
        <p className="text-xs text-[#64748b]">Asignar o cambiar la prioridad registra el texto «{REVIEW_NOTE}»{count > 1 ? ` en los ${count} reportes del caso` : ""}.</p>
      </div>

      {/* Decisión */}
      <div className="space-y-4 p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[#0f172a]">Decisión</h3>
        <ul className="space-y-1 rounded-xl border border-[#e0f2fe] bg-[#f0f9ff] px-4 py-3 text-xs leading-relaxed text-[#0c4a6e]">
          <li className="flex gap-2"><Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />Un reporte no prueba una infracción: verifique la evidencia y decida de forma proporcional.</li>
          <li className="flex gap-2"><Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />Un reporte falso o abusivo puede recibir advertencia.</li>
          <li className="flex gap-2"><Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />No copie mensajes privados en los motivos.</li>
        </ul>

        <fieldset>
          <legend className="text-xs font-semibold text-[#475569]">Escala de acciones</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {LADDER.map((s) => {
              const available = s.id === "none" || !!ladderPayload(s.id, item, days);
              const hint = s.id === "block" ? blockHint : s.hint;
              return (
                <label
                  key={s.id}
                  className={cn(
                    "flex min-h-10 cursor-pointer gap-2.5 rounded-xl border p-3 transition focus-within:ring-2 focus-within:ring-[#009FD9]",
                    ladder === s.id ? "border-[#087ca3] bg-[#f0f9ff]" : "border-[#e5e7eb] bg-white hover:border-[#cbd5e1]",
                    !available && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input type="radio" name={`${uid}-ladder`} className="mt-0.5 h-4 w-4 accent-[#087ca3] focus:outline-none" checked={ladder === s.id} disabled={!available || busy} onChange={() => chooseLadder(s.id)} />
                  <span className="min-w-0">
                    <span className={cn("block text-sm font-semibold", s.destructive ? "text-[#991b1b]" : "text-[#162543]")}>{s.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[#64748b]">{available ? hint : unavailable[s.id]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {ladder === "restrict" && (
          <label className="block text-xs font-semibold text-[#475569]">
            Plazo de la restricción
            <select className={cn(FIELD, "mt-1 min-h-10 w-auto")} value={days} onChange={(e) => chooseDays(Number(e.target.value))}>
              {RESTRICT_DAYS.map((d) => <option key={d} value={d}>{d} {d === 1 ? "día" : "días"}</option>)}
            </select>
          </label>
        )}

        <div>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <label htmlFor={`${uid}-reason`} className="text-xs font-semibold text-[#475569]">{REASON_LABEL}</label>
            <button type="button" className={cn(LINK, "min-h-10 text-xs")} disabled={busy} onClick={() => { setReason(ladderTemplate(ladder, item, days)); setConfirming(false); }}>Usar plantilla</button>
          </div>
          <textarea
            id={`${uid}-reason`}
            aria-describedby={`${uid}-reason-hint`}
            className={cn(FIELD, "mt-1 min-h-28")}
            minLength={5}
            maxLength={1000}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setConfirming(false); }}
          />
          <p id={`${uid}-reason-hint`} className={cn("mt-1 text-xs", hasPlaceholder ? "text-[#92400e]" : "text-[#64748b]")}>
            {hasPlaceholder ? "Complete o borre el texto entre corchetes antes de confirmar." : "Obligatorio: entre 5 y 1000 caracteres. La persona afectada puede leerlo."} {trimmed.length}/1000
          </p>
        </div>

        {confirming && payload && (
          <div role="group" aria-labelledby={`${uid}-confirm`} className="rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
            <p id={`${uid}-confirm`} className="text-sm font-semibold text-[#7f1d1d]">
              ¿Confirma «{step.title}» sobre «{r0.subject_name}»{ladder === "restrict" ? ` por ${days} ${days === 1 ? "día" : "días"}` : ""}?
            </p>
            <p className="mt-1 text-xs text-[#7f1d1d]">El motivo queda registrado en la auditoría y es visible para la persona afectada.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button ref={confirmRef} type="button" className={BTN_DANGER} disabled={busy} onClick={() => void moderate(payload, `${step.title}: acción registrada.`)}>Confirmar y guardar</button>
              <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setConfirming(false)}>Cancelar</button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {ladder !== "none" && (
            <button type="button" className={step.destructive ? BTN_DANGER : BTN_PRIMARY} disabled={busy || !payload || !reasonOk || confirming} onClick={saveLadder}>
              {busy && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}Guardar acción y auditoría
            </button>
          )}
          <button
            type="button"
            className={ladder === "none" ? BTN_PRIMARY : BTN_SECONDARY}
            disabled={busy || !reasonOk}
            onClick={() => void updateCase({ status: item.status === "open" ? "resolved" : "open" }, reason, item.status === "open" ? "Caso resuelto. El expediente se conserva." : "Caso reabierto.")}
          >
            {item.status === "open" ? "Resolver con motivo" : "Reabrir con motivo"}
          </button>
          {count > 1 && <span className="text-xs text-[#64748b]">Resolver o reabrir se aplica a los {count} reportes.</span>}
        </div>

        {error && <p role="alert" className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{error}</p>}
        <p role="status" className={cn("text-sm text-[#166534]", notice ? "rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2" : "sr-only")}>{notice}</p>

        <details className="rounded-xl border border-[#e5e7eb] bg-white">
          <summary className={cn("flex min-h-10 cursor-pointer items-center rounded-xl px-3 text-sm font-semibold text-[#162543]", FOCUS)}>Revertir decisiones y otras herramientas</summary>
          <div className="space-y-4 border-t border-[#eef2f6] p-3">
            <p className="text-xs text-[#64748b]">Estas acciones usan el motivo escrito arriba.</p>
            <div className="flex flex-wrap gap-2">
              {item.reports.filter((r) => r.target_id && r.target_type && ["project", "job", "offer", "review"].includes(r.target_type)).slice(0, 1).map((r) => (
                <button key={r.id} type="button" className={BTN_SECONDARY} disabled={busy || !reasonOk} onClick={() => void moderate({ kind: r.target_type!, id: r.target_id!, action: "restore", days: 7 }, "Contenido restaurado.")}>Restaurar contenido retirado</button>
              ))}
              {proId && <button type="button" className={BTN_SECONDARY} disabled={busy || !reasonOk} onClick={() => void moderate({ kind: "professional", id: proId, action: "restore", days: 7 }, "Perfil profesional restaurado.")}>Restaurar perfil profesional</button>}
              {accountId && <button type="button" className={BTN_SECONDARY} disabled={busy || !reasonOk} onClick={() => void moderate({ kind: "account", id: accountId, action: "unrestrict", days: 7 }, "Restricción de cuenta retirada.")}>Quitar restricción de cuenta</button>}
            </div>
            {proId && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#475569]">URL pública de la foto de casos de éxito
                  <input className={cn(FIELD, "mt-1 min-h-10")} value={photo} onChange={(e) => setPhoto(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {[false, true].map((restore) => (
                    <button key={String(restore)} type="button" className={BTN_SECONDARY} disabled={busy || !photo || !reasonOk} onClick={() => void other(`/api/admin/providers/${encodeURIComponent(proId)}/moderate`, { action: restore ? "restore_photo" : "remove_photo", url: photo, reason }, restore ? "Foto restaurada." : "Foto retirada.")}>
                      {restore ? "Restaurar foto de casos de éxito" : "Retirar foto de casos de éxito"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {conversations.map((r) => (
              <div key={r.id} className="space-y-2">
                <label className="block text-xs font-semibold text-[#475569]">Ruta del adjunto denunciado
                  <input className={cn(FIELD, "mt-1 min-h-10")} value={paths[r.id] ?? ""} onChange={(e) => setPaths((p) => ({ ...p, [r.id]: e.target.value }))} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={BTN_SECONDARY} disabled={busy || !paths[r.id] || !reasonOk} onClick={() => void other("/api/admin/moderacion/archivos", { report: r.id, path: paths[r.id], action: "quarantine", reason }, "Adjunto en cuarentena.")}>Poner adjunto en cuarentena</button>
                  <button type="button" className={BTN_SECONDARY} disabled={busy || !paths[r.id] || !reasonOk} onClick={() => void other("/api/admin/moderacion/archivos", { report: r.id, path: paths[r.id], action: "release", reason }, "Adjunto liberado.")}>Liberar adjunto tras revisión</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* Historial */}
      <div className="border-t border-[#eef2f6] p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-[#0f172a]"><History aria-hidden className="h-4 w-4" />Historial y decisiones previas</h3>
          <button type="button" aria-label="Actualizar historial" className={cn(BTN_SECONDARY, "w-10 px-0")} disabled={historyState === "loading"} onClick={() => setHistoryTick((t) => t + 1)}>
            <RefreshCw aria-hidden className="h-4 w-4" />
          </button>
        </div>
        {historyState === "loading" ? (
          <p role="status" className="mt-3 flex items-center gap-2 text-sm text-[#64748b]"><Loader2 aria-hidden className="h-4 w-4 animate-spin" />Cargando historial…</p>
        ) : historyState === "error" ? (
          <p role="alert" className="mt-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">No se pudo leer el historial. Intente actualizarlo.</p>
        ) : timeline.length === 0 ? (
          <p className="mt-3 text-sm text-[#64748b]">Sin decisiones previas.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-[#e2e8f0] pl-4">
            {timeline.map((t) => (
              <li key={t.id} className="relative">
                <span aria-hidden className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-[#087ca3]" />
                <p className="text-sm font-semibold text-[#162543]">{t.title}</p>
                <p className="text-xs text-[#64748b]"><time dateTime={t.at}>{fullDate(t.at)}</time> · {t.meta}</p>
                {t.body && <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[#334155]">{t.body}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
