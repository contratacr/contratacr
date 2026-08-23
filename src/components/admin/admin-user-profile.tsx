"use client";

import { useEffect, useState } from "react";
import { cldThumb } from "@/lib/cloudinary";
import {
  ArrowLeft, Loader2, ExternalLink, ShieldCheck, Headset, Flag, FolderOpen,
  CalendarDays, Ban, ShieldOff, Mail, Phone, IdCard, History,
  CheckCircle2, RotateCcw, XCircle, Clock3, MousePointerClick,
  Users, Trash2, Star, MessageCircle, Inbox,
} from "lucide-react";
import { WhatsAppLogo } from "@/components/ui/whatsapp-logo";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { verificationLabel, verificationPillClasses, type VerificationStatus } from "@/lib/verification";
import { supportTicketRef } from "@/lib/support-ticket";

// One page per account, read top to bottom: who they are and how to reach them,
// whether they are verified (and the actions), what they did as a client, what
// they did as a professional (requests received, reviews, vacancies, offers,
// reach), support and reports, their network, and — last — the danger zone.

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
type Booking = { id: string; service_description: string; status: string; preferred_date: string | null; created_at: string; client_name?: string | null };
type Application = { id: string; job_id: string; status: string; created_at: string; job_title: string | null; job_status: string | null };
type Job = { id: string; title: string; status: string; created_at: string; applications: number };
type Offer = { id: string; title: string; status: string; price_now: number | null; currency: string | null; created_at: string };
type Review = { id: string; rating: number; comment: string | null; moderation_status: string | null; created_at: string; client_name_snapshot: string | null };
type ReceivedProject = { id: string; project_id: string | null; title: string; project_status: string | null; proposal_status: string; price: number | null; client_name: string | null; created_at: string };
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
  applications?: Application[];
  jobs?: Job[];
  offers?: Offer[];
  receivedBookings?: Booking[];
  receivedReviews?: Review[];
  receivedProjects?: ReceivedProject[];
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
function fmtPhone(v?: string | null): string {
  if (!v) return "";
  const d = v.replace(/\D/g, "");
  const local = d.length > 8 && d.startsWith("506") ? d.slice(-8) : d;
  return local.length === 8 ? `${local.slice(0, 4)}-${local.slice(4)}` : v;
}
function money(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  return `${currency === "USD" ? "$" : "₡"}${amount.toLocaleString("es-CR")}`;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Abierta", pending: "Pendiente", in_progress: "En curso", confirmed: "Confirmada", awaiting_confirmation: "Por confirmar",
  resolved: "Resuelto", completed: "Completada", cancelled: "Cancelada", declined: "Rechazada", accepted: "Aceptada",
  published: "Publicada", paused: "Pausada", closed: "Cerrada", expired: "Vencida", sold_out: "Agotada", draft: "Borrador",
  reviewed: "Revisada", hidden: "Oculta",
  submitted: "Enviada", reviewing: "En revisión", shortlisted: "Preseleccionada", hired: "Contratada", withdrawn: "Retirada", rejected: "Rechazada",
};
const STATUS_PILL: Record<string, string> = {
  open: "bg-amber-100 text-amber-700", pending: "bg-amber-100 text-amber-700", awaiting_confirmation: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700", confirmed: "bg-blue-100 text-blue-700", published: "bg-emerald-100 text-emerald-700",
  resolved: "bg-emerald-100 text-emerald-700", completed: "bg-emerald-100 text-emerald-700", accepted: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-600", declined: "bg-gray-100 text-gray-600", closed: "bg-gray-100 text-gray-600", draft: "bg-gray-100 text-gray-600",
  paused: "bg-orange-100 text-orange-700", expired: "bg-rose-100 text-rose-700", sold_out: "bg-rose-100 text-rose-700", hidden: "bg-rose-100 text-rose-700",
  submitted: "bg-amber-100 text-amber-700", reviewing: "bg-blue-100 text-blue-700", shortlisted: "bg-blue-100 text-blue-700", hired: "bg-emerald-100 text-emerald-700", withdrawn: "bg-gray-100 text-gray-600", rejected: "bg-gray-100 text-gray-600",
};
function StatusPill({ status }: { status: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_PILL[status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

function accountVerificationStatus(profile: Profile, pro: Professional | null): VerificationStatus {
  if (pro) return pro.verification_status;
  if (profile.client_identity_status === "verified") return "verified";
  if (profile.client_identity_status === "pending") return "pending";
  return "rejected";
}

function Section({ icon: Icon, title, count, sub, children, action }: { icon: React.ElementType; title: string; count?: number; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#f3f4f6] px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-[#009FD9]" />
          <h2 className="truncate text-sm font-semibold text-[#111827]">{title}</h2>
          {count != null && <span className="text-xs text-[#9ca3af]">({count})</span>}
          {sub && <span className="hidden truncate text-xs text-[#9ca3af] sm:inline">· {sub}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
      <p className="text-xl font-bold tabular-nums text-[#0f172a]">{typeof value === "number" ? value.toLocaleString("es-CR") : value}</p>
      <p className="mt-0.5 text-[11px] font-medium text-[#6b7280]">{label}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-4 text-sm text-[#9ca3af]">{text}</p>;
}

function Row({ title, meta, status, href, external }: { title: string; meta?: string; status?: string; href?: string; external?: string }) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        {href ? (
          <Link href={href} className="block truncate text-sm font-medium text-[#111827] hover:text-[#009FD9]">{title}</Link>
        ) : (
          <p className="truncate text-sm font-medium text-[#111827]">{title}</p>
        )}
        {meta && <p className="truncate text-xs text-[#9ca3af]">{meta}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {status && <StatusPill status={status} />}
        {external && <a href={external} target="_blank" rel="noopener noreferrer" aria-label="Abrir" className="text-[#9ca3af] hover:text-[#009FD9]"><ExternalLink className="h-3.5 w-3.5" /></a>}
      </div>
    </li>
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
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  async function deleteAccount() {
    const name = data?.profile?.full_name || data?.profile?.email || "esta cuenta";
    if (!window.confirm(`Vas a eliminar al 100% la cuenta de ${name}. Se borra todo lo que creó y no se puede deshacer. ¿Continuar?`)) return;
    if (window.prompt("Escribe ELIMINAR para confirmar") !== "ELIMINAR") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error ?? "No se pudo eliminar la cuenta.");
      window.location.assign("/es/admin/usuarios?deleted=1");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No se pudo eliminar la cuenta.");
      setDeleting(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>;
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
  const applications = data.applications ?? [];
  const jobs = data.jobs ?? [];
  const offers = data.offers ?? [];
  const receivedBookings = data.receivedBookings ?? [];
  const receivedReviews = data.receivedReviews ?? [];
  const receivedProjects = data.receivedProjects ?? [];
  const identityStatus = accountVerificationStatus(profile, pro);
  const isIdentityVerified = identityStatus === "verified";
  const isIdentityPending = identityStatus === "pending";
  const isIdentityRejected = identityStatus === "rejected";
  const accountTypeLabel = pro ? "Profesional" : professionalSignupIncomplete ? "Profesional incompleto" : "Cliente";
  const wa = pro?.whatsapp || profile.phone || null;
  const call = pro?.call_phone || wa;
  const services = pro ? (pro.professions?.length ? pro.professions : pro.category_id ? [pro.category_id] : []) : [];
  const clientItems = [...projects, ...bookings];
  const clientActive = clientItems.filter((item) => ["open", "pending", "confirmed", "in_progress", "awaiting_confirmation"].includes(item.status)).length;
  const clientCompleted = clientItems.filter((item) => item.status === "completed").length;
  const averageRating = receivedReviews.length ? receivedReviews.reduce((sum, review) => sum + (review.rating ?? 0), 0) / receivedReviews.length : null;
  const waDigits = wa ? wa.replace(/\D/g, "") : "";
  const waHref = waDigits ? `https://wa.me/${waDigits.length === 8 ? `506${waDigits}` : waDigits}` : null;

  return (
    <div className="flex flex-col gap-5">
      <Link href={backHref} className="-mb-1 inline-flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#0f172a]"><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>

      {/* ── 1. Who they are and how to reach them ── */}
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EBF5FB] text-lg font-bold text-[#009FD9]">
            {profile.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cldThumb(profile.avatar_url, 128)} alt="" decoding="async" className="h-full w-full object-cover" />
            ) : getInitials(profile.full_name ?? "?")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-[#111827]">{pro?.business_name || profile.full_name || "Sin nombre"}</h1>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${professionalSignupIncomplete ? "bg-[#fff7ed] text-[#c2410c]" : "bg-gray-100 text-gray-700"}`}>{accountTypeLabel}</span>
              <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${verificationPillClasses(identityStatus)}`}>{verificationLabel(identityStatus)}</span>
              {pro?.is_banned && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700"><Ban className="h-3 w-3" /> Baneado</span>}
              {profile.is_disabled && <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><ShieldOff className="h-3 w-3" /> Deshabilitada</span>}
            </div>
            {pro?.business_name && profile.full_name && <p className="mt-0.5 text-sm text-[#6b7280]">{profile.full_name}</p>}
            {services.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {services.map((c) => <span key={c} className="rounded-md bg-[#EBF5FB] px-2 py-0.5 text-[11px] font-semibold text-[#0089bb]">{getCategoryLabel(c)}</span>)}
              </div>
            )}
            <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-[#374151] sm:grid-cols-2">
              <p className="flex min-w-0 items-center gap-2"><Mail className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" /> <span className="truncate">{profile.email ?? "—"}</span></p>
              <p className="flex min-w-0 items-center gap-2"><Phone className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" /> <span className="truncate">{wa ? fmtPhone(wa) : "—"}{call && call !== wa ? ` · llamadas: ${fmtPhone(call)}` : ""}</span></p>
              <p className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" /> {profile.cedula ?? "Sin identificación"}</p>
              <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" /> Registro: {fmtDate(profile.created_at)}{pro ? ` · perfil profesional: ${fmtDate(pro.created_at)}` : ""}</p>
            </div>
            {(profile.is_disabled || pro?.is_banned) && (
              <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {profile.is_disabled && <p><strong>Deshabilitada:</strong> {profile.disabled_reason ?? "Sin motivo"}{profile.disabled_at ? ` · ${fmt(profile.disabled_at)}` : ""}</p>}
                {pro?.is_banned && <p><strong>Baneado:</strong> {pro.banned_reason ?? "Sin motivo"}</p>}
              </div>
            )}
            {professionalSignupIncomplete && (
              <div className="mt-3 rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-3 py-2 text-xs text-[#9a3412]">
                <p className="inline-flex items-start gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>Inició el registro profesional pero no creó el perfil. Al iniciar sesión debe continuar el registro.</span></p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {pro && (
                <Link href={`/admin/proveedores/${pro.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] px-3 py-2 text-xs font-semibold text-white hover:bg-[#1e293b]">
                  <ShieldCheck className="h-3.5 w-3.5" /> Caso de verificación
                </Link>
              )}
              {pro?.slug && (
                <a href={`/es/profesionales/${pro.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
                  <ExternalLink className="h-3.5 w-3.5" /> Perfil público
                </a>
              )}
              {waHref && (
                <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-xs font-semibold text-[#15803d] hover:bg-[#dcfce7]">
                  <WhatsAppLogo className="h-3.5 w-3.5" /> WhatsApp
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] px-3 py-2 text-xs font-semibold text-[#374151] hover:bg-[#f9fafb]">
                  <Mail className="h-3.5 w-3.5" /> Correo
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Verification status and actions ── */}
      <Section icon={ShieldCheck} title="Verificación de identidad">
        <div className="p-4">
          <div className="rounded-xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${verificationPillClasses(identityStatus)}`}>{verificationLabel(identityStatus)}</span>
                  <span className="text-xs text-[#6b7280]">{pro ? "Cuenta con panel profesional y cliente" : professionalSignupIncomplete ? "Registro profesional incompleto" : "Cuenta cliente"}</span>
                </div>
                <p className="mt-2 text-sm text-[#374151]">
                  {professionalSignupIncomplete
                    ? "No se marca como profesional activo hasta que termine el formulario y se cree su perfil."
                    : "La insignia confirma la identidad de la persona. Si se quita, se borra la identificación guardada y se pedirá de nuevo cuando haga falta."}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[#6b7280] sm:grid-cols-2">
                  <span><strong className="text-[#374151]">Identificación:</strong> {profile.cedula ?? "Sin guardar"}</span>
                  <span><strong className="text-[#374151]">Verificada:</strong> {fmt(profile.client_identity_verified_at) || "—"}</span>
                  {pro?.verification_reason && <span className="sm:col-span-2"><strong className="text-[#374151]">Motivo actual:</strong> {pro.verification_reason}</span>}
                </div>
                {identityError && <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{identityError}</p>}
              </div>
              <div className="w-full space-y-2 lg:w-64">
                {professionalSignupIncomplete && <div className="rounded-xl border border-[#fed7aa] bg-white px-3 py-2 text-xs font-medium text-[#9a3412]">Pendiente de completar registro.</div>}
                {!professionalSignupIncomplete && !isIdentityVerified && !isIdentityRejected && (
                  <>
                    <button type="button" onClick={() => updateIdentity("verify")} disabled={identityBusy != null} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] text-sm font-bold text-white transition hover:bg-[#15803d] disabled:opacity-60">
                      {identityBusy === "verify" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Marcar verificado
                    </button>
                    <button type="button" onClick={() => setIdentityReasonAction("reject")} disabled={identityBusy != null} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] text-sm font-bold text-white transition hover:bg-[#b91c1c] disabled:opacity-60">
                      <XCircle className="h-4 w-4" /> Rechazar verificación
                    </button>
                  </>
                )}
                {!professionalSignupIncomplete && isIdentityRejected && (
                  <button type="button" onClick={() => updateIdentity("revert_pending")} disabled={identityBusy != null || isIdentityPending} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] bg-white text-sm font-medium text-[#374151] transition hover:bg-[#f3f4f6] disabled:opacity-60">
                    {identityBusy === "revert_pending" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Volver a pendiente
                  </button>
                )}
                {!professionalSignupIncomplete && isIdentityVerified && (
                  <button type="button" onClick={() => setIdentityReasonAction("revert_pending")} disabled={identityBusy != null} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#dc2626] text-sm font-bold text-white transition hover:bg-[#b91c1c] disabled:opacity-60">
                    <XCircle className="h-4 w-4" /> Quitar verificación
                  </button>
                )}
              </div>
            </div>
            {identityReasonAction && (
              <div className="mt-4 rounded-xl border border-red-100 bg-white p-3">
                <p className="text-sm font-semibold text-[#111827]">{identityReasonAction === "reject" ? "¿Rechazar verificación?" : "¿Quitar verificación?"}</p>
                <p className="mt-1 text-xs text-[#6b7280]">
                  {identityReasonAction === "reject" ? "El profesional verá este motivo y podrá corregir o apelar desde su panel." : "Se quitará la insignia Verificado, se borrará la identificación guardada y se notificará al profesional."}
                </p>
                <textarea value={identityReason} onChange={(event) => setIdentityReason(event.target.value)} rows={3} placeholder={identityReasonAction === "reject" ? "Explica por qué no se aprueba la verificación." : "Explica por qué se quita la verificación."} className="mt-3 w-full rounded-lg border border-[#e5e7eb] p-2.5 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => updateIdentity(identityReasonAction, identityReason)} disabled={identityBusy != null || identityReason.trim().length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
                    {identityBusy === identityReasonAction && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {identityReasonAction === "reject" ? "Confirmar rechazo" : "Quitar verificación"}
                  </button>
                  <button type="button" onClick={() => { setIdentityReasonAction(null); setIdentityReason(""); }} disabled={identityBusy != null} className="rounded-lg border border-[#d1d5db] bg-white px-3 py-2 text-xs font-semibold text-[#374151] transition hover:bg-[#f3f4f6]">Cancelar</button>
                </div>
              </div>
            )}
          </div>
          {(verificationLog.length > 0 || appeals.length > 0) && (
            <details className="mt-3 rounded-xl border border-[#e5e7eb]">
              <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-[#374151]"><History className="mr-1.5 inline h-4 w-4 text-[#9ca3af]" /> Historial de verificación ({verificationLog.length + appeals.length})</summary>
              <ul className="divide-y divide-[#f3f4f6] border-t border-[#f3f4f6]">
                {appeals.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium text-[#111827]">Apelación {a.status ? `· ${STATUS_LABEL[a.status] ?? a.status}` : ""}</p>
                    {a.message && <p className="mt-0.5 text-xs text-[#6b7280]">{a.message}</p>}
                    <p className="text-[11px] text-[#9ca3af]">{fmt(a.created_at)}</p>
                  </li>
                ))}
                {verificationLog.map((l) => (
                  <li key={l.id} className="px-4 py-2.5 text-sm">
                    <p className="font-medium text-[#111827]">{l.decision ?? l.action ?? l.status ?? "Cambio"}{l.admin_name ? ` · por ${l.admin_name}` : ""}</p>
                    {(l.note || l.reason) && <p className="mt-0.5 text-xs text-[#6b7280]">{l.note ?? l.reason}</p>}
                    <p className="text-[11px] text-[#9ca3af]">{fmt(l.created_at)}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </Section>

      {/* ── 3. As a client ── */}
      <Section icon={FolderOpen} title="Como cliente" sub="Lo que pidió o publicó">
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          <Tile label="Solicitudes enviadas" value={bookings.length} />
          <Tile label="Proyectos publicados" value={projects.length} />
          <Tile label="Postulaciones a empleos" value={applications.length} />
          <Tile label="Activas · completadas" value={`${clientActive} · ${clientCompleted}`} />
        </div>
        <div className="grid gap-0 border-t border-[#f3f4f6] lg:grid-cols-3 lg:divide-x lg:divide-[#f3f4f6]">
          <div>
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Solicitudes enviadas</p>
            {bookings.length === 0 ? <Empty text="Sin solicitudes." /> : <ul className="divide-y divide-[#f3f4f6]">{bookings.slice(0, 8).map((b) => <Row key={b.id} title={b.service_description} meta={`${b.preferred_date ? `Fecha: ${fmtDate(b.preferred_date)} · ` : ""}${fmt(b.created_at)}`} status={b.status} />)}</ul>}
          </div>
          <div>
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Proyectos publicados</p>
            {projects.length === 0 ? <Empty text="Sin proyectos." /> : <ul className="divide-y divide-[#f3f4f6]">{projects.slice(0, 8).map((p) => <Row key={p.id} title={p.title} meta={`${p.category_id ? `${getCategoryLabel(p.category_id)} · ` : ""}${fmt(p.created_at)}`} status={p.status} />)}</ul>}
          </div>
          <div>
            <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Postulaciones a empleos</p>
            {applications.length === 0 ? <Empty text="Sin postulaciones." /> : <ul className="divide-y divide-[#f3f4f6]">{applications.slice(0, 8).map((a) => <Row key={a.id} title={a.job_title ?? "Empleo"} meta={fmt(a.created_at)} status={a.status} href={`/admin/empleos`} />)}</ul>}
          </div>
        </div>
      </Section>

      {/* ── 4. As a professional ── */}
      {pro && (
        <>
          <Section icon={Inbox} title="Como profesional" sub="Lo que recibió y publicó">
            <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-3 xl:grid-cols-6">
              <Tile label="Solicitudes recibidas" value={receivedBookings.length} />
              <Tile label="Proyectos recibidos" value={receivedProjects.length} />
              <Tile label="Reseñas recibidas" value={receivedReviews.length} />
              <Tile label="Calificación" value={averageRating != null ? `${averageRating.toFixed(1)} ★` : "—"} />
              <Tile label="Empleos publicados" value={jobs.length} />
              <Tile label="Ofertas publicadas" value={offers.length} />
            </div>
            <div className="grid gap-0 border-t border-[#f3f4f6] lg:grid-cols-2 lg:divide-x lg:divide-[#f3f4f6]">
              <div>
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Solicitudes recibidas</p>
                {receivedBookings.length === 0 ? <Empty text="Todavía no recibe solicitudes." /> : <ul className="divide-y divide-[#f3f4f6]">{receivedBookings.slice(0, 8).map((b) => <Row key={b.id} title={b.service_description} meta={`${b.client_name ? `${b.client_name} · ` : ""}${fmt(b.created_at)}`} status={b.status} />)}</ul>}
              </div>
              <div>
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Reseñas recibidas</p>
                {receivedReviews.length === 0 ? <Empty text="Todavía no tiene reseñas." /> : (
                  <ul className="divide-y divide-[#f3f4f6]">
                    {receivedReviews.slice(0, 8).map((r) => (
                      <li key={r.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <p className="inline-flex items-center gap-1 text-sm font-semibold text-[#111827]"><Star className="h-3.5 w-3.5 text-amber-500" /> {r.rating} · {r.client_name_snapshot || "Cliente"}</p>
                          {r.moderation_status && r.moderation_status !== "published" && <StatusPill status={r.moderation_status} />}
                        </div>
                        {r.comment && <p className="mt-0.5 line-clamp-2 text-xs text-[#6b7280]">{r.comment}</p>}
                        <p className="text-[11px] text-[#9ca3af]">{fmt(r.created_at)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="lg:border-t lg:border-[#f3f4f6]">
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Proyectos recibidos</p>
                {receivedProjects.length === 0 ? <Empty text="Todavía no envió propuestas a proyectos." /> : <ul className="divide-y divide-[#f3f4f6]">{receivedProjects.slice(0, 8).map((p) => <Row key={p.id} title={p.title} meta={`${p.client_name ? `${p.client_name} · ` : ""}propuesta ${money(p.price, "CRC")} · ${fmt(p.created_at)}`} status={p.proposal_status} />)}</ul>}
              </div>
              <div className="lg:border-t lg:border-[#f3f4f6]">
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Empleos publicados</p>
                {jobs.length === 0 ? <Empty text="Sin empleos publicados." /> : <ul className="divide-y divide-[#f3f4f6]">{jobs.slice(0, 8).map((j) => <Row key={j.id} title={j.title} meta={`${j.applications} ${j.applications === 1 ? "postulación" : "postulaciones"} · ${fmt(j.created_at)}`} status={j.status} external={`/es/empleos/${j.id}`} />)}</ul>}
              </div>
              <div className="lg:border-t lg:border-[#f3f4f6]">
                <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Ofertas publicadas</p>
                {offers.length === 0 ? <Empty text="Sin ofertas publicadas." /> : <ul className="divide-y divide-[#f3f4f6]">{offers.slice(0, 8).map((o) => <Row key={o.id} title={o.title} meta={`${money(o.price_now, o.currency)} · ${fmt(o.created_at)}`} status={o.status} external={`/es/ofertas/${o.id}`} />)}</ul>}
              </div>
            </div>
          </Section>

          <Section icon={MousePointerClick} title="Alcance del perfil" sub="Qué hace la gente cuando lo encuentra">
            <div className="p-4">
              {!analytics || analytics.total === 0 ? (
                <div className="rounded-xl bg-[#f8fafc] px-4 py-6 text-center text-sm text-[#94a3b8]">Aún no hay interacciones registradas para este profesional.</div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Tile label="Vistas de perfil" value={analytics.profileViews} />
                    <Tile label="Visitantes únicos" value={analytics.uniqueVisitors} />
                    <Tile label="Contactos (WhatsApp + llamadas)" value={analytics.whatsappClicks + analytics.phoneClicks} />
                    <Tile label="Solicitudes creadas" value={analytics.serviceRequestsCreated} />
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Tile label="Agregado a favoritos" value={analytics.favorites} />
                    <Tile label="Disponibilidad consultada" value={analytics.availabilityActions} />
                    <Tile label="Propuestas enviadas · aceptadas" value={`${analytics.proposalsSent} · ${analytics.proposalsAccepted}`} />
                    <Tile label="Última interacción" value={fmtDate(analytics.lastInteractionAt) || "—"} />
                  </div>
                  {analytics.bySource.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {analytics.bySource.map((item) => (
                        <span key={item.label} className="rounded-full bg-[#f8fafc] px-2.5 py-1 text-xs font-medium text-[#475569] ring-1 ring-[#e5e7eb]">{item.label}: <strong className="text-[#0f172a]">{item.value.toLocaleString("es-CR")}</strong></span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Section>
        </>
      )}

      {/* ── 5. Support and reports ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={Headset} title="Casos de soporte" count={tickets.length} action={tickets.length > 0 ? <Link href="/admin/soporte" className="text-xs font-semibold text-[#009FD9] hover:underline">Ir a soporte</Link> : undefined}>
          {tickets.length === 0 ? <Empty text="Sin casos de soporte." /> : (
            <ul className="divide-y divide-[#f3f4f6]">
              {tickets.slice(0, 8).map((t) => (
                <Row key={t.id} title={t.subject} meta={`Caso ${supportTicketRef(t.id, t.created_at, t.case_number)} · ${fmt(t.created_at)}`} status={t.status} href={`/admin/soporte?ticket=${t.id}`} />
              ))}
            </ul>
          )}
        </Section>
        <Section icon={Flag} title="Reportes recibidos" count={reports.length} action={reports.length > 0 ? <Link href="/admin/reportes" className="text-xs font-semibold text-[#009FD9] hover:underline">Ver reportes</Link> : undefined}>
          {reports.length === 0 ? <Empty text="Nadie ha reportado esta cuenta." /> : (
            <ul className="divide-y divide-[#f3f4f6]">
              {reports.slice(0, 8).map((r) => <Row key={r.id} title={r.reason} meta={`${r.reporter_email ?? "Anónimo"} · ${fmt(r.created_at)}`} status={r.status} />)}
            </ul>
          )}
        </Section>
      </div>

      {/* ── 6. Network ── */}
      <Section icon={Users} title="Seguidos y seguidores">
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          {([
            { key: "following" as const, label: "Sigue a", items: followNetwork?.following ?? [] },
            { key: "followers" as const, label: "Lo siguen", items: followNetwork?.followers ?? [] },
          ]).map((group) => (
            <div key={group.key} className="overflow-hidden rounded-xl border border-[#e5e7eb]">
              <div className="flex items-center justify-between border-b border-[#edf1f4] bg-[#f8fafc] px-3 py-2.5">
                <h3 className="text-sm font-bold text-[#334155]">{group.label}</h3>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#526277] ring-1 ring-[#dce5ec]">{group.items.length}</span>
              </div>
              {group.items.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-[#94a3b8]">Nadie todavía.</p>
              ) : (
                <div className="max-h-60 overflow-y-auto">
                  {group.items.map((item) => {
                    const followedProfile = item.professional ? (Array.isArray(item.professional.profiles) ? item.professional.profiles[0] : item.professional.profiles) : null;
                    const followerProfessional = item.profile ? (Array.isArray(item.profile.professionals) ? item.profile.professionals[0] : item.profile.professionals) : null;
                    const name = group.key === "following" ? item.professional?.business_name || followedProfile?.full_name || "Profesional" : followerProfessional?.business_name || item.profile?.full_name || "Usuario";
                    const accountId = group.key === "following" ? item.professional?.id : item.profile?.id;
                    return (
                      <div key={item.id} className="flex items-center justify-between gap-3 border-b border-[#edf1f4] px-3 py-2 last:border-b-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#162543]">{name}</p>
                          <p className="text-[11px] text-[#8492a5]">Desde {fmtDate(item.created_at)}</p>
                        </div>
                        {accountId && <Link href={`/admin/usuarios/${accountId}`} className="shrink-0 text-xs font-bold text-[#0089bb] hover:underline">Ver cuenta</Link>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ── 7. Danger zone ── */}
      <section className="rounded-xl border border-[#fecaca] bg-[#fff7f7] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#991b1b]">Eliminar esta cuenta al 100%</p>
            <p className="mt-0.5 text-xs text-[#7f1d1d]">Borra el acceso, el perfil, las fotos y todo lo que creó (solicitudes, proyectos, publicaciones, reseñas, mensajes). Las personas con algo abierto con esta cuenta reciben un aviso. No se puede deshacer.</p>
            {deleteError && <p className="mt-2 text-xs font-semibold text-[#b91c1c]">{deleteError}</p>}
          </div>
          <button type="button" disabled={deleting} onClick={() => void deleteAccount()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-[#b91c1c] px-3 text-xs font-semibold text-white hover:bg-[#991b1b] disabled:opacity-60">
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Eliminar cuenta
          </button>
        </div>
      </section>
    </div>
  );
}
