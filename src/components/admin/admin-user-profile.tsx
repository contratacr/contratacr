"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft, Loader2, ExternalLink, ShieldCheck, Headset, Flag, FolderOpen,
  CalendarDays, Ban, ShieldOff, Mail, Phone, IdCard, BadgeCheck, History,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getInitials } from "@/lib/utils";
import { getCategoryLabel } from "@/lib/data/categories";
import { verificationLabel, verificationPillClasses, type VerificationStatus } from "@/lib/verification";
import { AdminSubscription } from "@/components/admin/admin-subscription";
import { supportTicketRef } from "@/lib/support-ticket";

type Profile = {
  id: string; full_name: string | null; email: string | null; cedula: string | null;
  phone: string | null; role: string | null; avatar_url: string | null;
  is_disabled: boolean; disabled_reason: string | null; disabled_at: string | null; created_at: string;
};
type Professional = {
  id: string; slug: string; verification_status: VerificationStatus; verification_reason: string | null;
  verification_updated_at: string | null; is_banned: boolean; banned_reason: string | null;
  category_id: string | null; professions: string[] | null; business_name: string | null;
  whatsapp: string | null; call_phone: string | null; allow_phone_call: boolean | null; created_at: string;
};
type Ticket = { id: string; subject: string; status: string; topic?: string | null; created_at: string; last_reply_role?: string | null };
type Project = { id: string; title: string; status: string; category_id: string | null; created_at: string };
type Booking = { id: string; service_description: string; status: string; preferred_date: string | null; created_at: string };
type LogRow = { id: string; action?: string; decision?: string; status?: string; note?: string; reason?: string; admin_name?: string; created_at: string };
type Appeal = { id: string; message?: string; status?: string; created_at: string };
type Report = { id: string; reason: string; status: string; reporter_email: string | null; created_at: string };

type Data = {
  profile: Profile;
  professional: Professional | null;
  tickets: Ticket[];
  projects: Project[];
  bookings: Booking[];
  verificationLog: LogRow[];
  appeals: Appeal[];
  reports: Report[];
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

export function AdminUserProfile({ userId }: { userId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/users?id=${userId}`)
      .then((r) => r.json())
      .then((d) => { if (!alive) return; if (d.error) setError(d.error); else setData(d); })
      .catch(() => alive && setError("No se pudo cargar el usuario."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [userId]);

  if (loading) {
    return <div className="py-20 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>;
  }
  if (error || !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-[#6b7280]">{error ?? "Usuario no encontrado."}</p>
        <Link href="/admin/usuarios" className="mt-3 inline-flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline"><ArrowLeft className="h-4 w-4" /> Volver a búsqueda</Link>
      </div>
    );
  }

  const { profile, professional: pro, tickets, projects, bookings, verificationLog, appeals, reports } = data;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/usuarios" className="inline-flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#0f172a] -mb-1"><ArrowLeft className="h-4 w-4" /> Búsqueda de usuarios</Link>

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
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{pro ? "Profesional" : "Cliente"}</span>
              {pro && (
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${verificationPillClasses(pro.verification_status)}`}>
                  {verificationLabel(pro.verification_status)}
                </span>
              )}
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
                        {wa && <>WhatsApp: {fmtPhone(wa)}</>}
                        {call && <>{wa ? " · " : ""}Llamada: {fmtPhone(call)}</>}
                      </span>
                    );
                  }
                  return <span>{fmtPhone(profile.phone) || "—"}</span>;
                })()}
              </p>
              <p className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" /> {profile.cedula ?? "Sin cédula"} <span className="text-[10px] text-[#9ca3af]">(enmascarada)</span></p>
              <p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" /> Registro: {fmtDate(profile.created_at)}</p>
            </div>
            {(profile.is_disabled || pro?.is_banned) && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                {profile.is_disabled && <p><strong>Deshabilitada:</strong> {profile.disabled_reason ?? "Sin motivo"}{profile.disabled_at ? ` · ${fmt(profile.disabled_at)}` : ""}</p>}
                {pro?.is_banned && <p><strong>Baneado:</strong> {pro.banned_reason ?? "Sin motivo"}</p>}
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
                      Caso #{supportTicketRef(t.id)}
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

      {/* ── Subscription (pro only) — admin-only management, incl. manual SINPE ── */}
      {pro && <AdminSubscription professionalId={pro.id} />}

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
