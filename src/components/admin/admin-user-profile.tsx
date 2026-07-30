"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft, Loader2, ExternalLink, ShieldCheck, Headset, Flag, FolderOpen,
  CalendarDays, Ban, ShieldOff, Mail, Phone, IdCard, BadgeCheck, History,
  CheckCircle2, RotateCcw, XCircle, Clock3, MousePointerClick,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { verificationLabel, verificationPillClasses, type VerificationStatus } from "@/lib/verification";
import { supportTicketRef } from "@/lib/support-ticket";

type Profile = {
  id: string; full_name: string | null; email: string | null; cedula: string | null;
  phone: string | null; role: string | null; avatar_url: string | null;
  is_disabled: boolean; disabled_reason: string | null; disabled_at: string | null;
  client_identity_status: string | null; client_identity_verified_at: string | null;
  client_identity_provider: string | null; created_at: string;
};
type Professional = {
  id: string; slug: string; verification_status: VerificationStatus; verification_reason: string | null;
  verification_updated_at: string | null; is_banned: boolean; banned_reason: string | null;
  category_id: string | null; professions: string[] | null; business_name: string | null;
  whatsapp: string | null; call_phone: string | null; allow_phone_call: boolean | null; created_at: string;
};
type Ticket = { id: string; subject: string; status: string; topic?: string | null; case_number?: number | null; created_at: string; last_reply_role?: string | null };
type Project = { id: string; title: string; status: string; category_id: string | null; created_at: string };
type Booking = { id: string; service_description: string; status: string; preferred_date: string | null; created_at: string };
type LogRow = { id: string; action?: string; decision?: string; status?: string; note?: string; reason?: string; admin_name?: string; created_at: string };
type Appeal = { id: string; message?: string; status?: string; created_at: string };
type Report = { id: string; reason: string; status: string; reporter_email: string | null; created_at: string };
type ActionState = "verify" | "reject" | "revert_pending";
type Analytics = {
  total: number;
  uniqueVisitors: number;
  profileViews: number;
  whatsappClicks: number;
  phoneClicks: number;
  availabilityActions: number;
  favorites: number;
  serviceRequestsStarted: number;
  serviceRequestsCreated: number;
  proposalsSent: number;
  proposalsAccepted: number;
  reviewsReceived: number;
  shares: number;
  lastInteractionAt: string | null;
  bySource: { label: string; value: number }[];
};
type FollowNetworkItem = {
  id: string;
  created_at: string;
  professional?: {
    id: string;
    slug: string;
    business_name: string | null;
    profiles?: { full_name: string | null; avatar_url: string | null } | Array<{ full_name: string | null; avatar_url: string | null }>;
  } | null;
  profile?: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    professionals?: { id: string; slug: string; business_name: string | null } | Array<{ id: string; slug: string; business_name: string | null }>;
  } | null;
};

type Data = {
  profile: Profile;
  professional: Professional | null;
  professionalSignupIncomplete?: boolean;
  tickets: Ticket[];
  projects: Project[];
  bookings: Booking[];
  verificationLog: LogRow[];
  appeals: Appeal[];
  reports: Report[];
  analytics: Analytics | null;
  followNetwork?: { following: FollowNetworkItem[]; followers: FollowNetworkItem[] };
};

function fmt(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString("es-CR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(d?: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}
// Pretty CR phone: drop the +506 prefix if present and group as 8888-8888.
function fmtPhone(v?: string | null): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  const local = d.length > 8 && d.startsWith("506") ? d.slice(-8) : d;
  return local.length === 8 ? `${local.slice(0, 4)}-${local.slice(4)}` : v;
}

const STATUS_PILL: Record<string, string> = {
  open: "bg-amber-100 text-amber-700", pending: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700", confirmed: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700", completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600", declined: "bg-gray-100 text-gray-600",
};
function statusPill(s: string) { return STATUS_PILL[s] ?? "bg-gray-100 text-gray-600"; }

function accountVerificationStatus(profile: Profile, pro: Professional | null): VerificationStatus {
  if (pro) return pro.verification_status;
  if (profile.client_identity_status === "verified") return "verified";
  if (profile.client_identity_status === "pending") return "pending";
  return "rejected";
}

function Section({ icon: Icon, title, count, children }: { icon: React.ElementType; title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#f3f4f6] flex items-center gap-2">
        <Icon className="h-4 w-4 text-[#009FD9]" />
        <h2 className="text-sm font-semibold text-[#111827]">{title}</h2>
        {count != null && <span className="text-xs text-[#9ca3af]">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function AnalyticsTile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
      <p className="text-xl font-bold tabular-nums text-[#0f172a]">{typeof value === "number" ? value.toLocaleString("es-CR") : value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#6b7280]">{label}</p>
    </div>
  );
}

export function AdminUserProfile({
  userId,
  backHref = "/admin/usuarios",
  backLabel = "Búsqueda de usuarios",
}: {
  userId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [identityBusy, setIdentityBusy] = useState<ActionState | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityReasonAction, setIdentityReasonAction] = useState<"reject" | "revert_pending" | null>(null);
  const [identityReason, setIdentityReason] = useState("");

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) setLoading(true); });
    fetch(`/api/admin/users?id=${userId}`)
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d.error) setError(d.error); else { setError(null); setData(d); } })
      .catch(() => alive && setError("No se pudo cargar el usuario."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [userId]);

  async function refreshUser() {
    const res = await fetch(`/api/admin/users?id=${userId}`);
    const json = await res.json();
    if (!res.ok || json.error) throw new Error(json.error ?? "No se pudo cargar el usuario.");
    setData(json);
  }

  async function updateIdentity(action: ActionState, reason?: string) {
    setIdentityBusy(action);
    setIdentityError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason ?? "" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? "No se pudo actualizar la verificación.");
      setIdentityReasonAction(null);
      setIdentityReason("");
      await refreshUser();
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "No se pudo actualizar la verificación.");
    } finally {
      setIdentityBusy(null);
    }
  }

  if (loading) {
    return <div className="py-20 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>;
  }
  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-[#6b7280]">{error ?? "Usuario no encontrado."}</p>
        <Link href={backHref} className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline"><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>
      </div>
    );
  }

  const { profile, professional: pro, professionalSignupIncomplete, tickets, projects, bookings, verificationLog, appeals, reports, analytics, followNetwork } = data;
  const identityStatus = accountVerificationStatus(profile, pro);
  const isIdentityVerified = identityStatus === "verified";
  const isIdentityPending = identityStatus === "pending";
  const isIdentityRejected = identityStatus === "rejected";
  const accountTypeLabel = pro ? "Profesional" : professionalSignupIncomplete ? "Profesional incompleto" : "Cliente";
  const clientItems = [...projects, ...bookings];
  const clientCompleted = clientItems.filter((item) => item.status === "completed").length;
  const clientActive = clientItems.filter((item) => ["open", "pending", "confirmed", "in_progress", "awaiting_confirmation"].includes(item.status)).length;
  const clientCancelled = clientItems.filter((item) => item.status === "cancelled").length;

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#0f172a] -mb-1"><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>

      {/* ── Identity header ── */}
      <div className="bg-white rounded-xl border border-[#e5e7eb] p-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-16 w-16 rounded-full bg-[#EBF5FB] text-[#009FD9] text-lg font-bold flex items-center justify-center overflow-hidden shrink-0">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : getInitials(profile.full_name ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-[#111827]">{profile.full_name ?? "Sin nombre"}</h1>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${professionalSignupIncomplete ? "bg-[#fff7ed] text-[#c2410c]" : "bg-gray-100 text-gray-600"}`}>
                {accountTypeLabel}
              </span>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${verificationPillClasses(identityStatus)}`}>
                {verificationLabel(identityStatus)}
              </span>
              {pro?.is_banned && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700"><Ban className="h-3 w-3" /> Baneado</span>}
              {profile.is_disabled && <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"><ShieldOff className="h-3 w-3" /> Cuenta deshabilitada</span>}
            </div>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-[#374151]">
              <p className="flex items-center gap-2 min-w-0"><Mail className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" /> <span className="truncate">{profile.email ?? "—"}</span></p>
              <p className="flex items-start gap-2 min-w-0">
                <Phone className="h-3.5 w-3.5 text-[#9ca3af] shrink-0 mt-0.5" />
                {(() => {
                  // Pro numbers live on the professional record (WhatsApp + optional
                  // separate call line); a client's number is on the profile. When a
                  // pro has no separate call line, the WhatsApp number is used for both.
                  const wa = pro?.whatsapp || profile.phone || null;
                  const call = pro?.call_phone || wa;
                  if (pro) {
                    if (!wa && !call) return <span>—</span>;
                    return (
                      <span>
                        {wa && <>Número de contacto: {fmtPhone(wa)}</>}
                        {call && <>{wa ? " · " : ""}Llamada: {fmtPhone(call)}</>}
                      </span>
                    );
                  }
                  return <span>{fmtPhone(profile.phone) || "—"}</span>;
                })()}
              </p>
              <p className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" /> {profile.cedula ?? "Sin identificación"} <span className="text-[10px] text-[#9ca3af]">(guardada)</span></p>
              <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" /> Registro: {fmtDate(profile.created_at)}</p>
            </div>
            {(profile.is_disabled || pro?.is_banned) && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                {profile.is_disabled && <p><strong>Deshabilitada:</strong> {profile.disabled_reason ?? "Sin motivo"}{profile.disabled_at ? ` · ${fmt(profile.disabled_at)}` : ""}</p>}
                {pro?.is_banned && <p><strong>Baneado:</strong> {pro.banned_reason ?? "Sin motivo"}</p>}
              </div>
            )}
            {professionalSignupIncomplete && (
              <div className="mt-3 rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs text-[#9a3412]">
                <p className="inline-flex items-start gap-2">
                  <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>Esta cuenta inició el registro profesional, pero todavía no creó el perfil. Al iniciar sesión debe continuar el registro.</span>
                </p>
              </div>
            )}
            {pro && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <Link href={`/admin/proveedores/${pro.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] text-white text-xs font-semibold px-3 py-2 hover:bg-[#1e293b]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Abrir caso de verificación
                </Link>
                <a href={`/es/profesionales/${pro.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-[#009FD9] hover:underline">
                  Ver perfil público <ExternalLink className="h-3 w-3" />
                </a>
                {pro.business_name && <span className="text-xs text-[#6b7280]">{pro.business_name}</span>}
                {(pro.professions?.length ? pro.professions : pro.category_id ? [pro.category_id] : []).map((c) => (
                  <span key={c} className="text-[11px] px-2 py-0.5 rounded-md bg-[#EBF5FB] text-[#0089bb]">{getCategoryLabel(c)}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Section icon={ShieldCheck} title="Verificación de cuenta">
        <div className="p-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${verificationPillClasses(identityStatus)}`}>
                    {verificationLabel(identityStatus)}
                  </span>
                  <span className="text-xs text-[#6b7280]">
                    {pro ? "Cuenta con panel profesional y cliente" : professionalSignupIncomplete ? "Registro profesional incompleto" : "Cuenta cliente"}
                  </span>
                </div>
                {professionalSignupIncomplete ? (
                  <p className="mt-2 text-sm text-[#374151]">
                    Esta persona ya inició el registro profesional. No se marca como profesional activo hasta que termine el formulario y se cree su perfil.
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[#374151]">
                    La verificación pertenece a la persona. Si se quita, se elimina la identificación guardada y se pedirá de nuevo cuando use una función que la requiera.
                  </p>
                )}
                <div className="mt-3 grid gap-2 text-xs text-[#6b7280] sm:grid-cols-2">
                  <span><strong className="text-[#374151]">Identificación:</strong> {profile.cedula ?? "Sin guardar"}</span>
                  <span><strong className="text-[#374151]">Verificada:</strong> {fmt(profile.client_identity_verified_at) || "—"}</span>
                </div>
                {identityError && (
                  <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                    {identityError}
                  </p>
                )}
              </div>
              <div className="w-full space-y-2 lg:w-64">
                {professionalSignupIncomplete && (
                  <div className="rounded-xl border border-[#fed7aa] bg-white px-3 py-2 text-xs font-medium text-[#9a3412]">
                    Pendiente de completar registro.
                  </div>
                )}
                {!professionalSignupIncomplete && !isIdentityVerified && !isIdentityRejected && (
                  <button
                    type="button"
                    onClick={() => updateIdentity("verify")}
                    disabled={identityBusy != null}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] text-sm font-bold text-white transition hover:bg-[#15803d] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {identityBusy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Marcar verificado
                  </button>
                )}
                {!professionalSignupIncomplete && !isIdentityVerified && !isIdentityRejected && (
                  <button
                    type="button"
                    onClick={() => setIdentityReasonAction("reject")}
                    disabled={identityBusy != null}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] text-sm font-bold text-white transition hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Rechazar verificación
                  </button>
                )}
                {!professionalSignupIncomplete && isIdentityRejected && (
                  <button
                    type="button"
                    onClick={() => updateIdentity("revert_pending")}
                    disabled={identityBusy != null || isIdentityPending}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] transition hover:bg-[#f9fafb] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {identityBusy === "revert_pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Volver a pendiente
                  </button>
                )}
                {!professionalSignupIncomplete && isIdentityVerified && (
                  <button
                    type="button"
                    onClick={() => setIdentityReasonAction("revert_pending")}
                    disabled={identityBusy != null}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] text-sm font-bold text-white transition hover:bg-[#b91c1c] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <XCircle className="h-4 w-4" />
                    Quitar verificación
                  </button>
                )}
              </div>
            </div>
            {identityReasonAction && (
              <div className="mt-4 rounded-xl border border-red-100 bg-white p-3">
                <p className="text-sm font-semibold text-[#111827]">
                  {identityReasonAction === "reject" ? "¿Rechazar verificación?" : "¿Quitar verificación?"}
                </p>
                <p className="mt-1 text-xs text-[#6b7280]">
                  {identityReasonAction === "reject"
                    ? "El profesional verá este motivo y podrá corregir o apelar desde su panel."
                    : "Se quitará la insignia Verificado, se borrará la identificación guardada y se notificará al profesional."}
                </p>
                <textarea
                  value={identityReason}
                  onChange={(event) => setIdentityReason(event.target.value)}
                  rows={3}
                  placeholder={
                    identityReasonAction === "reject"
                      ? "Explica por qué no se aprueba la verificación."
                      : "Explica por qué se quita la verificación."
                  }
                  className="mt-3 w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#dc2626]"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateIdentity(identityReasonAction, identityReason)}
                    disabled={identityBusy != null || identityReason.trim().length === 0}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {identityBusy === identityReasonAction && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {identityReasonAction === "reject" ? "Confirmar rechazo" : "Quitar verificación"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIdentityReasonAction(null); setIdentityReason(""); }}
                    disabled={identityBusy != null}
                    className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#374151] transition hover:bg-[#f3f4f6]"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section icon={FolderOpen} title="Resumen como cliente">
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <AnalyticsTile label="Solicitudes directas" value={bookings.length} />
          <AnalyticsTile label="Publicaciones" value={projects.length} />
          <AnalyticsTile label="Activas o en curso" value={clientActive} />
          <AnalyticsTile label="Completadas" value={clientCompleted} />
          <AnalyticsTile label="Canceladas" value={clientCancelled} />
        </div>
      </Section>

      {pro && (
        <Section icon={MousePointerClick} title="Analíticas del profesional">
          <div className="p-4">
            {!analytics || analytics.total === 0 ? (
              <div className="rounded-xl bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#94a3b8]">
                Aún no hay interacciones registradas para este profesional.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <AnalyticsTile label="Interacciones" value={analytics.total} />
                  <AnalyticsTile label="Visitantes únicos" value={analytics.uniqueVisitors} />
                  <AnalyticsTile label="Vistas de perfil" value={analytics.profileViews} />
                  <AnalyticsTile label="Última interacción" value={fmt(analytics.lastInteractionAt) || "—"} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <AnalyticsTile label="WhatsApp" value={analytics.whatsappClicks} />
                  <AnalyticsTile label="Llamadas" value={analytics.phoneClicks} />
                  <AnalyticsTile label="Disponibilidad" value={analytics.availabilityActions} />
                  <AnalyticsTile label="Guardados" value={analytics.favorites} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <AnalyticsTile label="Solicitudes iniciadas" value={analytics.serviceRequestsStarted} />
                  <AnalyticsTile label="Solicitudes creadas" value={analytics.serviceRequestsCreated} />
                  <AnalyticsTile label="Reseñas recibidas" value={analytics.reviewsReceived} />
                  <AnalyticsTile label="Compartidos" value={analytics.shares} />
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <AnalyticsTile label="Propuestas enviadas" value={analytics.proposalsSent} />
                  <AnalyticsTile label="Propuestas aceptadas" value={analytics.proposalsAccepted} />
                </div>
                {analytics.bySource.length > 0 && (
                  <div className="rounded-xl border border-[#e5e7eb] bg-[#f8fafc] p-3">
                    <p className="mb-2 text-xs font-semibold text-[#334155]">Origen de las interacciones</p>
                    <div className="flex flex-wrap gap-2">
                      {analytics.bySource.map((item) => (
                        <span key={item.label} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#475569] ring-1 ring-[#e5e7eb]">
                          {item.label}: <strong className="text-[#0f172a]">{item.value.toLocaleString("es-CR")}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Section>
      )}

      <Section icon={Users} title="Seguidos y seguidores">
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {([
            { key: "following" as const, label: "Seguidos", items: followNetwork?.following ?? [] },
            { key: "followers" as const, label: "Seguidores", items: followNetwork?.followers ?? [] },
          ]).map((group) => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-[#e5e7eb]">
              <div className="flex items-center justify-between border-b border-[#edf1f4] bg-[#f8fafc] px-3 py-2.5">
                <h3 className="text-sm font-bold text-[#334155]">{group.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#526277] ring-1 ring-[#dce5ec]">
                  {group.items.length}
                </span>
              </div>
              {group.items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-[#94a3b8]">Sin relaciones registradas.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto">
                  {group.items.map((item) => {
                    const followedProfile = item.professional
                      ? (Array.isArray(item.professional.profiles) ? item.professional.profiles[0] : item.professional.profiles)
                      : null;
                    const followerProfessional = item.profile
                      ? (Array.isArray(item.profile.professionals) ? item.profile.professionals[0] : item.profile.professionals)
                      : null;
                    const name = group.key === "following"
                      ? item.professional?.business_name || followedProfile?.full_name || "Profesional"
                      : followerProfessional?.business_name || item.profile?.full_name || "Usuario";
                    const accountId = group.key === "following"
                      ? item.professional?.id
                      : item.profile?.id;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf1f4] px-3 py-2.5 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#162543]">{name}</p>
                          <p className="text-[11px] text-[#8492a5]">Desde {fmtDate(item.created_at)}</p>
                        </div>
                        {accountId && (
                          <Link href={`/admin/usuarios/${accountId}`} className="shrink-0 text-xs font-bold text-[#0089bb] hover:underline">
                            Ver cuenta
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── Support tickets ── */}
      <Section icon={Headset} title="Tickets de soporte" count={tickets.length}>
        {tickets.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[#9ca3af]">Sin tickets.</p>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {tickets.map((t) => (
              <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                      Caso {supportTicketRef(t.id, t.created_at, t.case_number)}
                    </span>
                    <p className="min-w-0 truncate text-sm font-medium text-[#111827]">{t.subject}</p>
                  </div>
                  <p className="text-xs text-[#9ca3af]">{fmt(t.created_at)}{t.topic ? ` · ${t.topic}` : ""}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.last_reply_role === "user" && t.status !== "resolved" && <span className="h-2 w-2 rounded-full bg-red-500" title="Espera respuesta" />}
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusPill(t.status)}`}>{t.status}</span>
                  <Link href={`/admin/soporte?ticket=${t.id}`} className="text-xs text-[#009FD9] hover:underline">Abrir</Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Verification history + appeals (pro only) ── */}
      {pro && (
        <Section icon={History} title="Historial de verificación" count={verificationLog.length + appeals.length}>
          {verificationLog.length === 0 && appeals.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[#9ca3af]">Sin historial de verificación.</p>
          ) : (
            <ul className="divide-y divide-[#f3f4f6]">
              {verificationLog.map((l) => (
                <li key={l.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <BadgeCheck className="h-3.5 w-3.5 text-[#009FD9]" />
                    <p className="text-sm font-medium text-[#111827]">{l.action ?? l.decision ?? l.status ?? "Decisión"}</p>
                    <span className="text-xs text-[#9ca3af]">{fmt(l.created_at)}</span>
                    {l.admin_name && <span className="text-xs text-[#9ca3af]">· {l.admin_name}</span>}
                  </div>
                  {(l.note || l.reason) && <p className="text-xs text-[#6b7280] mt-0.5">{l.note ?? l.reason}</p>}
                </li>
              ))}
              {appeals.map((a) => (
                <li key={a.id} className="px-4 py-3 bg-[#fffbeb]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Apelación</span>
                    {a.status && <span className="text-xs text-[#9ca3af]">{a.status}</span>}
                    <span className="text-xs text-[#9ca3af]">{fmt(a.created_at)}</span>
                  </div>
                  {a.message && <p className="text-xs text-[#6b7280] mt-0.5">{a.message}</p>}
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ── Reports (pro only) ── */}
      {pro && (
        <Section icon={Flag} title="Reportes recibidos" count={reports.length}>
          {reports.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[#9ca3af]">Sin reportes.</p>
          ) : (
            <ul className="divide-y divide-[#f3f4f6]">
              {reports.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${r.status === "open" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>{r.status === "open" ? "Abierto" : "Resuelto"}</span>
                    <span className="text-xs text-[#9ca3af]">{fmt(r.created_at)}</span>
                    <span className="text-xs text-[#9ca3af]">· {r.reporter_email ?? "Anónimo"}</span>
                  </div>
                  <p className="text-sm text-[#374151] mt-1 whitespace-pre-wrap">{r.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* ── Projects (as client) ── */}
      <Section icon={FolderOpen} title="Proyectos publicados" count={projects.length}>
        {projects.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[#9ca3af]">Sin proyectos.</p>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {projects.map((p) => (
              <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[#111827] truncate">{p.title}</p>
                  <p className="text-xs text-[#9ca3af]">{p.category_id ? `${getCategoryLabel(p.category_id)} · ` : ""}{fmt(p.created_at)}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusPill(p.status)}`}>{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ── Requests (bookings as client) ── */}
      <Section icon={CalendarDays} title="Solicitudes enviadas" count={bookings.length}>
        {bookings.length === 0 ? (
          <p className="px-4 py-4 text-sm text-[#9ca3af]">Sin solicitudes.</p>
        ) : (
          <ul className="divide-y divide-[#f3f4f6]">
            {bookings.map((b) => (
              <li key={b.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-[#374151] truncate">{b.service_description}</p>
                  <p className="text-xs text-[#9ca3af]">{b.preferred_date ? `Fecha: ${fmtDate(b.preferred_date)} · ` : ""}{fmt(b.created_at)}</p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${statusPill(b.status)}`}>{b.status}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
