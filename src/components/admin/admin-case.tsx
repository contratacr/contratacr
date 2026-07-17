"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowLeft, CheckCircle2, XCircle, RotateCcw, AlertCircle, ExternalLink,
  ShieldCheck, IdCard, Loader2, ShieldAlert, Trash2,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getCategoryLabel } from "@/lib/data/categories";
import {
  verificationLabel, verificationPillClasses, caseRef, type VerificationStatus,
} from "@/lib/verification";
import { formatId } from "@/lib/cedula";
import { useAppDialog } from "@/hooks/use-app-dialog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

export function AdminCase({ providerId }: { providerId: string }) {
  const [data, setData] = useState<Any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<"reject" | "revert_pending" | null>(null);
  const [reason, setReason] = useState("");
  const { dialogNode, confirm } = useAppDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}`);
      if (!res.ok) throw new Error();
      setData(await res.json());
    } catch {
      setError("No se pudo cargar el caso.");
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  async function decide(action: "verify" | "reject" | "revert_pending", reasonText?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reasonText ?? "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setReasonAction(null);
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la decisión.");
    } finally {
      setBusy(false);
    }
  }

  // Moderation: ban/unban a professional or remove a fake/inappropriate caso de éxito.
  async function moderate(action: "ban" | "unban" | "remove_photo", opts: { reason?: string; url?: string } = {}) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/providers/${providerId}/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...opts }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la acción de moderación.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemovePhoto(url: string) {
    const result = await confirm({
      title: "Eliminar foto por moderación",
      description: "Esta foto se quitará de los casos de éxito del profesional.",
      detail: "Úsalo solo si la imagen no corresponde, es inapropiada o afecta la confianza del perfil.",
      confirmLabel: "Eliminar foto",
      cancelLabel: "Cancelar",
      tone: "danger",
    });
    if (result.confirmed) void moderate("remove_photo", { url });
  }

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" />
      </div>
    );
  }
  if (error && !data) {
    return <div className="py-20 text-center text-sm text-red-600">{error}</div>;
  }

  const pro = data!.provider as Any;
  const profile = pro.profiles as Any;
  const status = pro.verification_status as VerificationStatus;
  const log = (data!.log as Any[]) ?? [];
  const appeals = (data!.appeals as Any[]) ?? [];
  const idAssist = data!.idAssist as Any;
  const padron = data!.padron as Any;
  const portfolio = (pro.portfolio_urls as string[]) ?? [];
  const isBanned = !!pro.is_banned;

  const waDigits = String(pro.whatsapp ?? "").replace(/\D/g, "");
  const waTo = waDigits.length === 8 ? `506${waDigits}` : waDigits;
  const waMsg = encodeURIComponent(
    `Hola ${(profile?.full_name ?? "").split(" ")[0]}, te contactamos de ContrataCR sobre tu verificación de identidad (Caso #${caseRef(pro.id)}).`
  );

  return (
    <>
    {/* Width/centering is owned by AdminShell's shared container — this page must NOT
        re-apply its own max-width (it would drift from every other admin page). */}
    <div>
      <Link href="/admin/verificacion" className="inline-flex items-center gap-1.5 text-sm text-[#6b7280] hover:text-[#009FD9] mb-4">
        <ArrowLeft className="h-4 w-4" /> Volver a la cola
      </Link>

      {error && (
        <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Two-column: flexible review content on the left, a fixed ~340px decision rail
          on the right. Stacks to a single column below `lg`. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        {/* ── Left: case file ─────────────────────────────── */}
        <div className="space-y-5 min-w-0">
          {/* Header card */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <div className="flex items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] overflow-hidden shrink-0 flex items-center justify-center">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[#009FD9] font-bold text-xl">{(profile?.full_name ?? "?")[0]}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-lg font-bold text-[#111827]">{profile?.full_name ?? "Sin nombre"}</h1>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-md border ${verificationPillClasses(status)}`}>
                    {verificationLabel(status)}
                  </span>
                </div>
                {pro.business_name && <p className="text-sm text-[#009FD9] font-medium">{pro.business_name}</p>}
                <p className="text-xs text-[#6b7280] mt-1">
                  Caso #{caseRef(pro.id)} · {pro.category_id ? getCategoryLabel(pro.category_id) : "Sin categoría"}
                </p>
                {pro.slug && (
                  <a
                    href={`/es/profesionales/${pro.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#009FD9] hover:underline mt-1"
                  >
                    Ver perfil público <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Meta fields as filled cells in a 2-column grid — fills the card width
                neatly instead of leaving sparse empty space to the right. */}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-4 text-sm">
              <Field label="Correo" value={profile?.email} />
              <Field label="Número de contacto" value={pro.whatsapp} />
              <Field label="Provincia/Cantón" value={[pro.address].filter(Boolean).join(" · ") || "—"} />
              <Field label="Modalidad" value={pro.service_type === "fixed" ? "Lugar fijo" : "Se desplaza"} />
            </dl>
            {pro.bio && <p className="text-sm text-[#374151] mt-3 whitespace-pre-wrap">{pro.bio}</p>}
          </div>

          {/* ID / automatic assist */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="flex items-center gap-2 font-semibold text-[#111827] text-sm mb-3">
              <IdCard className="h-4 w-4 text-[#009FD9]" /> Identidad (asistencia automática)
            </h2>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <span className="font-mono text-[#111827]">{idAssist.value ? formatId(idAssist.value) : "Sin documento"}</span>
              {idAssist.typeLabel && (
                <span className="text-xs bg-[#EBF5FB] text-[#0089bb] px-2 py-0.5 rounded-md">{idAssist.typeLabel}</span>
              )}
              {idAssist.value && (
                <span className={`text-xs px-2 py-0.5 rounded-md ${idAssist.valid ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fee2e2] text-[#b91c1c]"}`}>
                  {idAssist.valid ? "Formato válido" : "Formato inválido"}
                </span>
              )}
            </div>
            {pro.no_cr_id && (
              <div className="mt-3 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-3 text-xs text-[#92400e]">
                <p className="font-semibold">Sin identificación costarricense (revisión manual)</p>
                <p className="mt-1">{pro.id_document_note || "El proveedor no adjuntó una nota de documento."}</p>
              </div>
            )}
            <p className="text-[11px] text-[#9ca3af] mt-3">
              La validación de formato y la confirmación de identidad contra el padrón (TSE) son automáticas. Revisa la comparación con el padrón más abajo. Las fotos de trabajo NO son criterio de verificación.
            </p>
          </div>

          {/* Padrón comparison — entered vs official, side by side. Work photos
              are NOT a verification criterion and are intentionally not shown. */}
          {padron && (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
              <h2 className="font-semibold text-[#111827] text-sm mb-3">Comparación con el padrón (TSE)</h2>
              {!padron.found ? (
                <p className="text-sm text-[#b45309]">La cédula no se encontró en el padrón cargado.</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2.5 text-sm">
                  <div className="rounded-lg border border-[#f1f3f5] bg-[#f9fafb] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-[#9ca3af]">Nombre ingresado</p>
                    <p className="text-[#374151] font-medium mt-0.5">{profile?.full_name}</p>
                  </div>
                  <div className="rounded-lg border border-[#f1f3f5] bg-[#f9fafb] px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-[#9ca3af]">Nombre en el padrón</p>
                    <p className="text-[#374151] font-medium mt-0.5">{padron.name || "—"}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${padron.matched ? "bg-[#dcfce7] text-[#15803d]" : "bg-[#fef3c7] text-[#b45309]"}`}>
                      {padron.matched ? "✓ Coincide" : "⚠ Revisar"} · similitud {(padron.score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Appeals */}
          {appeals.length > 0 && (
            <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
              <h2 className="font-semibold text-[#111827] text-sm mb-3">Apelaciones</h2>
              <ul className="space-y-3">
                {appeals.map((a) => (
                  <li key={a.id} className="text-sm border-l-2 border-[#fde68a] pl-3">
                    <p className="text-[#374151] whitespace-pre-wrap">{a.message}</p>
                    <p className="text-xs text-[#9ca3af] mt-1">
                      {new Date(a.created_at).toLocaleString("es-CR")} · {a.status === "open" ? "Abierta" : "Resuelta"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* ── Moderación: casos de éxito + ban ─────────────────── */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="flex items-center gap-2 font-semibold text-[#111827] text-sm mb-3">
              <ShieldAlert className="h-4 w-4 text-[#dc2626]" /> Moderación
            </h2>

            {/* Casos de éxito — remove fake/inappropriate photos */}
            <p className="text-xs text-[#6b7280] mb-2">Casos de éxito (fotos de trabajos)</p>
            {portfolio.length === 0 ? (
              <p className="text-xs text-[#9ca3af] mb-4">Sin fotos.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {portfolio.map((url) => (
                  <div key={url} className="relative group aspect-square rounded-lg overflow-hidden border border-[#e5e7eb]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      onClick={() => confirmRemovePhoto(url)}
                      disabled={busy}
                      className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      aria-label="Eliminar foto"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Visibility in /buscar is determined SOLELY by verification status:
                verified → visible; pending/rejected → not visible. There is no
                manual block toggle. To hide a profile, use "Rechazar" on the right. */}
            <div className="border-t border-[#f3f4f6] pt-3">
              <p className="text-xs text-[#6b7280]">
                La visibilidad en <strong>los resultados de búsqueda</strong> depende del estado de verificación
                (verificado → visible; pendiente o rechazado → no visible). Para quitar un perfil,
                usa <strong>Rechazar</strong>.
              </p>
              {isBanned && (
                <button
                  onClick={() => moderate("unban")}
                  disabled={busy}
                  className="mt-2 w-full h-9 rounded-xl border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb] text-sm font-medium disabled:opacity-60"
                >
                  Restaurar perfil (quitar bloqueo heredado)
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: actions + audit ─────────────────────────────── */}
        <div className="space-y-5">
          {/* Actions */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="flex items-center gap-2 font-semibold text-[#111827] text-sm mb-3">
              <ShieldCheck className="h-4 w-4 text-[#009FD9]" /> Decisión
            </h2>

            {!reasonAction ? (
              <div className="space-y-2">
                {status !== "verified" && (
                  <button
                    onClick={() => decide("verify")}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#16a34a] hover:bg-[#15803d] text-white text-sm font-bold disabled:opacity-60"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Marcar verificado
                  </button>
                )}
                {/* Rechazar (con motivo → oculta el perfil) — solo para una cuenta
                    PENDIENTE/no verificada. Una cuenta YA VERIFICADA usa "Revocar
                    verificación" en su lugar, así nunca se muestran dos acciones que
                    se solapan. */}
                {status !== "verified" && status !== "rejected" && (
                  <button
                    onClick={() => setReasonAction("reject")}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-bold disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" /> Rechazar
                  </button>
                )}
                {/* Revocar — SOLO para una cuenta ya verificada → la devuelve a
                    pendiente/sin verificar (no se oculta; sin motivo). Estilo del
                    botón de rechazo. */}
                {status === "verified" && (
                  <button
                    onClick={() => setReasonAction("revert_pending")}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-bold disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" /> Revocar verificación
                  </button>
                )}
                {/* Volver a pendiente — para des-rechazar una cuenta RECHAZADA. No se
                    muestra para verificada (Revocar ya la devuelve a pendiente). */}
                {status === "rejected" && (
                  <button
                    onClick={() => decide("revert_pending")}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-[#e5e7eb] text-[#374151] hover:bg-[#f9fafb] text-sm font-medium disabled:opacity-60"
                  >
                    <RotateCcw className="h-4 w-4" /> Volver a pendiente
                  </button>
                )}
                <p className="text-[11px] text-[#9ca3af] pt-1">
                  Las decisiones nunca quedan bloqueadas: puedes cambiarlas en cualquier momento.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#374151]">
                  {reasonAction === "reject" ? "Motivo del rechazo (requerido)" : "Motivo para quitar la verificación (requerido)"}
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  placeholder={
                    reasonAction === "reject"
                      ? "Explica por qué no pasa la verificación. El proveedor verá este motivo y podrá apelar."
                      : "Explica por qué se quita la verificación. El profesional verá este motivo en su panel."
                  }
                  className="w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#dc2626]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => decide(reasonAction, reason)}
                    disabled={busy || reason.trim().length === 0}
                    className="flex-1 h-10 rounded-xl bg-[#dc2626] hover:bg-[#b91c1c] text-white text-sm font-bold disabled:opacity-50"
                  >
                    {reasonAction === "reject" ? "Confirmar rechazo" : "Quitar verificación"}
                  </button>
                  <button
                    onClick={() => { setReasonAction(null); setReason(""); }}
                    className="px-3 h-10 rounded-xl border border-[#e5e7eb] text-sm text-[#374151]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* WhatsApp contact */}
            {waTo && (
              <a
                href={`https://wa.me/${waTo}?text=${waMsg}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#25D366] hover:bg-[#1eb456] text-white text-sm font-bold"
              >
                <ExternalLink className="h-4 w-4" /> Contacto externo
              </a>
            )}
          </div>

          {/* Current reason */}
          {status === "rejected" && pro.verification_reason && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm">
              <p className="font-medium text-red-700 mb-1">Motivo de rechazo actual</p>
              <p className="text-red-600">{pro.verification_reason}</p>
            </div>
          )}

          {/* Audit trail */}
          <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
            <h2 className="font-semibold text-[#111827] text-sm mb-3">Historial de decisiones</h2>
            {log.length === 0 ? (
              <p className="text-sm text-[#6b7280]">Sin decisiones registradas.</p>
            ) : (
              <ol className="space-y-3">
                {log.map((l) => (
                  <li key={l.id} className="text-xs border-l-2 border-[#e5e7eb] pl-3">
                    <p className="font-medium text-[#111827]">{auditLabel(l.action)}</p>
                    <p className="text-[#6b7280]">
                      {l.admin_name ?? "Sistema"} · {new Date(l.created_at).toLocaleString("es-CR")}
                    </p>
                    {l.reason && <p className="text-[#374151] mt-0.5 italic">&quot;{l.reason}&quot;</p>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
    {dialogNode}
    </>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-[#f1f3f5] bg-[#f9fafb] px-3 py-2">
      <dt className="text-[11px] uppercase tracking-wide text-[#9ca3af]">{label}</dt>
      <dd className="text-[#374151] break-words text-sm mt-0.5">{value || "—"}</dd>
    </div>
  );
}

function auditLabel(action: string): string {
  switch (action) {
    case "verified": return "Verificado (manual)";
    case "auto_verified": return "Verificado (automático)";
    case "auto_pending": return "Pendiente (automático)";
    case "rejected": return "Rechazado";
    case "reverted_pending": return "Devuelto a pendiente";
    case "appeal_received": return "Apelación recibida";
    case "appeal_failed": return "Apelación falló (re-ejecución)";
    case "banned": return "Perfil bloqueado (moderación)";
    case "unbanned": return "Perfil restaurado";
    case "photo_removed": return "Caso de éxito eliminado (moderación)";
    default: return action;
  }
}
