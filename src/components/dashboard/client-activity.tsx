"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FolderOpen, ChevronDown, Plus, CalendarClock, Wrench, Users, MapPin } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getCategoryLabel } from "@/lib/data/categories";
import { computeAge } from "@/lib/age";
import { getInitials, getWhatsAppLink, cn, formatRelativeOrDate } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, PROYECTO_TABS, solicitudMatches, solicitudBucket, solicitudStatusRedundant, proyectoMatches, proyectoBucket, proyectoStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { CardActionsMenu, type CardAction } from "@/components/dashboard/card-actions-menu";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ReportModal } from "@/components/dashboard/report-modal";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";
import { RescheduleModal } from "@/components/booking/reschedule-modal";
import { SavedProfessionalsTab } from "@/components/professionals/saved-professionals-tab";
import type { BookingStatus } from "@/types";

/**
 * Shared "acting as a client" activity views — the user's SENT solicitudes,
 * PUBLISHED projects, and saved professionals. Rendered both in the plain
 * client dashboard and inside the unified professional dashboard's "Cuando
 * contrato" group, so a professional manages everything in one place without
 * switching panels. Pure reorganization — same business logic/endpoints.
 */

export type ClientActivitySection = "bookings" | "projects" | "saved";

type Booking = {
  id: string;
  professional_id: string;
  service_description: string;
  preferred_date_text?: string;
  scheduled_date?: string;
  scheduled_time?: string;
  status: BookingStatus;
  created_at: string;
  cancel_reason?: string | null;
  cancelled_by?: string | null;
  // The specific service the request is for + who it's for (a dependent/"otra persona").
  category_id?: string | null;
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_is_minor?: boolean;
  professionals?: {
    slug: string;
    whatsapp?: string;
    category_id?: string | null;
    profiles: { full_name: string; avatar_url?: string };
    categories?: { id: string; name: string };
  };
};

type Project = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  categories?: { name: string };
  provincias?: { name: string };
  cantones?: { name: string };
  proposals?: { id: string; status: string }[];
};

type Proposal = {
  id: string;
  price?: number;
  message: string;
  status: string;
  created_at: string;
  professionals?: {
    id: string;
    slug: string;
    whatsapp?: string;
    profiles: { full_name: string; avatar_url?: string };
    categories: { name: string };
  };
};

// ONE shared status→colour mapping (sprint 440), identical to the pro side so a
// booking's state reads the SAME everywhere: ACTIVE/upcoming = brand-blue (default),
// transitional (awaiting confirmation) = amber, FINISHED = green, cancelled = red.
// (Previously active states were green "success" — reading as done/closed — and the
// finished state was muted grey: the open-vs-closed state looked inverted.)
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "warning",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "warning",
  completed: "success",
  cancelled: "error",
  rescheduled: "muted",
};

function formatBookingDate(b: Booking, dateLocale: string) {
  if (b.scheduled_date) {
    const [y, m, d] = b.scheduled_date.split("-").map(Number);
    const label = new Date(y, m - 1, d)
      .toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" })
      .replace(".", "");
    return b.scheduled_time ? `${label} · ${b.scheduled_time}` : label;
  }
  return b.preferred_date_text ?? null;
}

export function ClientActivity({ section }: { section: ClientActivitySection }) {
  const { user } = useAuth();
  const t = useTranslations("clientActivity");
  const locale = useLocale();
  const router = useRouter();
  const dateLocale = locale === "en" ? "en-US" : "es-CR";

  // The service a booking is for (the specific category requested, else the pro's primary).
  function bookingServiceLabel(b: Booking): string | null {
    const id = b.category_id || b.professionals?.category_id;
    return id ? getCategoryLabel(id, locale) : (b.professionals?.categories?.name ?? null);
  }
  function ageLabel(dob?: string | null) {
    const age = dob ? computeAge(dob) : null;
    if (!age) return null;
    if (age.years > 0) return t("yearsOld", { count: age.years });
    const months = Math.max(1, age.months);
    return t("monthsOld", { count: months });
  }

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string; bookingId?: string; projectId?: string } | null>(null);
  const [myReviews, setMyReviews] = useState<{ professional_id: string; booking_id?: string | null; project_id?: string | null; rating: number }[]>([]);
  // One unified filter set (sprint 430): Activas · Finalizadas · Canceladas.
  const [bookingFilter, setBookingFilter] = useState("activas");
  const [projectFilter, setProjectFilter] = useState("activas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  // Mis solicitudes is now a collapsible accordion too (sprint 440) — same card language
  // as Solicitudes recibidas / Oportunidades / Mis publicaciones.
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [projectProposals, setProjectProposals] = useState<Record<string, Proposal[]>>({});
  const [showPublish, setShowPublish] = useState(false);
  // CLIENT reschedule: the client (owner of the appointment) picks another available
  // slot for the same pro → old slot freed, new slot taken (atomic). The pro does NOT
  // reschedule (they cancel + coordinate via WhatsApp) — see sprint 433.
  const [reschedule, setReschedule] = useState<{ id: string; professionalId: string; when: string | null } | null>(null);
  // CLIENT cancel confirm dialog (optional note).
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // Delete-publicación confirm dialog (clean modal, not a browser confirm()).
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // "Reportar profesional" clean modal (replaces the old window.prompt), keyed by booking id.
  const [reportProFor, setReportProFor] = useState<string | null>(null);

  const fetchSection = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    if (section === "bookings") {
      const res = await fetch("/api/bookings?role=client");
      const { bookings } = await res.json();
      setBookings(bookings ?? []);
    } else if (section === "projects") {
      const res = await fetch("/api/projects?role=client");
      const { projects } = await res.json();
      setProjects(projects ?? []);
    }
    setLoading(false);
  }, [user, section]);

  useEffect(() => { fetchSection(); }, [fetchSection]);

  const loadMyReviews = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/reviews?mine=1");
      const { reviews } = await res.json();
      setMyReviews(reviews ?? []);
    } catch { /* ignore */ }
  }, [user]);
  useEffect(() => { loadMyReviews(); }, [loadMyReviews]);

  function bookingReview(bookingId: string) {
    return myReviews.find((r) => r.booking_id === bookingId);
  }
  function projectReview(projectId: string) {
    return myReviews.find((r) => r.project_id === projectId);
  }

  // CLIENT cancel — low-friction: a clean confirm dialog with an OPTIONAL note (no
  // forced reason; the slot frees + the pro is notified either way). Sprint 434.
  async function confirmCancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true);
    const note = cancelNote.trim();
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cancelTarget, status: "cancelled", cancelReason: note || undefined }),
    });
    setBookings((prev) => prev.map((b) => (b.id === cancelTarget ? { ...b, status: "cancelled" } : b)));
    setCancelling(false);
    setCancelTarget(null);
    setCancelNote("");
  }

  async function confirmBookingDone(id: string) {
    const b = bookings.find((x) => x.id === id);
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "completed" }),
    });
    setBookings((prev) => prev.map((x) => (x.id === id ? { ...x, status: "completed" } : x)));
    // Immediately invite a review (optional — the modal closes = skip; the item is
    // already completed either way).
    if (b) setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: id });
  }

  async function submitReportPro(reason: string) {
    if (!reportProFor) return;
    const res = await fetch("/api/report-professional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: reportProFor, reason }),
    });
    alert(res.ok ? t("reportThanks") : t("reportError"));
  }

  async function refreshProjects() {
    try {
      const res = await fetch("/api/projects?role=client");
      const { projects } = await res.json();
      if (Array.isArray(projects)) setProjects(projects);
    } catch { /* ignore */ }
  }

  async function updateProjectStatus(projectId: string, status: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, status }),
    });
    if (!res.ok) { alert(t("projectUpdateError")); return; }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status } : p)));
    refreshProjects();
  }

  async function confirmProjectCompletion(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, action: "confirm" }),
    });
    if (!res.ok) { alert(t("confirmError")); return; }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "completed" } : p)));
    refreshProjects();
    // Immediately invite a review (optional — close = skip; already completed).
    reviewProjectPro(projectId);
  }

  async function confirmDeleteProject() {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch(`/api/projects?id=${deleteTarget}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? t("deleteProjectError"));
      setDeleting(false);
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== deleteTarget));
    setDeleting(false);
    setDeleteTarget(null);
  }

  async function loadProposals(projectId: string) {
    if (projectProposals[projectId]) return;
    const res = await fetch(`/api/proposals?project=${projectId}`);
    const { proposals } = await res.json();
    setProjectProposals((prev) => ({ ...prev, [projectId]: proposals ?? [] }));
  }

  async function reviewProjectPro(projectId: string) {
    let list = projectProposals[projectId];
    if (!list) {
      const res = await fetch(`/api/proposals?project=${projectId}`);
      const json = await res.json().catch(() => ({ proposals: [] }));
      list = json.proposals ?? [];
      setProjectProposals((prev) => ({ ...prev, [projectId]: list }));
    }
    const accepted = (list ?? []).find((p) => p.status === "accepted");
    const pro = accepted?.professionals;
    if (pro?.id) {
      setReviewModal({ professionalId: pro.id, professionalName: pro.profiles?.full_name ?? t("professional"), projectId });
    } else {
      alert(t("noAssignedPro"));
    }
  }

  async function acceptProposal(proposalId: string, projectId: string) {
    await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: proposalId, status: "accepted" }),
    });
    setProjectProposals((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((p) => (p.id === proposalId ? { ...p, status: "accepted" } : p)),
    }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "in_progress" } : p)));
    refreshProjects();
  }

  async function declineProposal(proposalId: string, projectId: string) {
    await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: proposalId, status: "declined" }),
    });
    setProjectProposals((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((p) => (p.id === proposalId ? { ...p, status: "declined" } : p)),
    }));
  }

  async function revertProposal(proposalId: string, projectId: string) {
    await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: proposalId, status: "pending" }),
    });
    setProjectProposals((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((p) => (p.id === proposalId ? { ...p, status: "pending" } : p)),
    }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "open" } : p)));
  }

  if (section === "saved") {
    return <SavedProfessionalsTab />;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const filteredBookings = bookings.filter((b) => solicitudMatches(bookingFilter, b.status, b.scheduled_date));
  const filteredProjects = projects.filter((p) => proyectoMatches(projectFilter, p.status));
  const bookingCounts = bucketCounts(bookings.map((b) => solicitudBucket(b.status, b.scheduled_date)));
  const projectCounts = bucketCounts(projects.map((p) => proyectoBucket(p.status)));

  return (
    <>
      {/* SENT SOLICITUDES */}
      {section === "bookings" && (
        <div className="space-y-4">
          {bookings.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border border-dashed border-[#e5e7eb] bg-white">
              <CalendarDays className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-semibold text-[#374151]">{t("bEmpty")}</p>
              <p className="text-sm text-[#6b7280] mt-1">{t("bEmptySub")}</p>
              <Button className="mt-5" asChild>
                <a href="/buscar">{t("searchPros")}</a>
              </Button>
            </div>
          ) : (
            <>
              <StatusFilterTabs tabs={SOLICITUD_TABS} value={bookingFilter} onChange={setBookingFilter} counts={bookingCounts} />
              {filteredBookings.length === 0 ? (
                <p className="text-sm text-[#6b7280] text-center py-8">{t("noBookingsView")}</p>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {filteredBookings.map((b) => {
                    const rev = b.status === "completed" ? bookingReview(b.id) : undefined;
                    return (
                      <Card key={b.id} className="hover:shadow-md">
                        {/* COLLAPSED header — SAME card language as the other 3 sections: avatar +
                            pro name (primary, bold) + status chip on the right; "Fecha: {cita}"
                            key line. Tap to reveal the full description, cancel reason + actions. */}
                        <button
                          type="button"
                          onClick={() => setExpandedBooking(expandedBooking === b.id ? null : b.id)}
                          aria-expanded={expandedBooking === b.id}
                          className={cn("w-full text-left p-4 sm:p-5 flex items-start gap-3.5 hover:bg-[#fafafa] transition-colors", expandedBooking === b.id ? "rounded-t-2xl" : "rounded-2xl")}
                        >
                          <Avatar className="h-11 w-11 shrink-0">
                            <AvatarImage src={b.professionals?.profiles?.avatar_url} />
                            <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold">
                              {getInitials(b.professionals?.profiles?.full_name ?? "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <span className="min-w-0 flex-1 text-[15px] font-bold text-[#162543] line-clamp-2 [overflow-wrap:anywhere]">
                                {b.professionals?.profiles?.full_name ?? t("professional")}
                              </span>
                              {!solicitudStatusRedundant(b.status, b.scheduled_date) && (
                                <Badge variant={STATUS_VARIANT[b.status]} className="shrink-0 text-[11px] font-semibold">{t(`bStatus.${b.status}`)}</Badge>
                              )}
                            </div>
                            {/* Appointment date with a grey calendar icon (no "Fecha:" label). */}
                            {formatBookingDate(b, dateLocale) && (
                              <p className="mt-1 flex items-center gap-1.5 text-[13px] min-w-0">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#374151]" />
                                <span className="truncate font-medium text-[#374151]">{formatBookingDate(b, dateLocale)}</span>
                              </p>
                            )}
                            {/* The service the request was for (grey wrench). */}
                            {bookingServiceLabel(b) && (
                              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#6b7280] min-w-0">
                                <Wrench className="h-3.5 w-3.5 shrink-0 text-[#374151]" />
                                <span className="truncate">{bookingServiceLabel(b)}</span>
                              </p>
                            )}
                            {/* For someone else — a quiet at-a-glance hint. */}
                            {b.for_someone_else && (
                              <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#6b7280] min-w-0">
                                <Users className="h-3.5 w-3.5 shrink-0 text-[#374151]" />
                                <span className="truncate">{t("forOtherPerson")}</span>
                              </p>
                            )}
                          </div>
                          <ChevronDown className={`h-5 w-5 text-[#9ca3af] shrink-0 mt-0.5 transition-transform duration-200 ${expandedBooking === b.id ? "rotate-180" : ""}`} />
                        </button>

                        {expandedBooking === b.id && (
                          <div className="px-4 pb-5 pt-4 sm:px-5 border-t border-[#f3f4f6] flex flex-col gap-3.5">
                            {/* The header already identifies the professional; expanded details stay flat. */}
                            {(bookingServiceLabel(b) || b.for_someone_else) && (
                              <div className="flex flex-col gap-3 text-sm">
                                {bookingServiceLabel(b) && (
                                  <div>
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("serviceField")}</p>
                                    <p className="mt-0.5 font-medium text-[#374151] [overflow-wrap:anywhere]">{bookingServiceLabel(b)}</p>
                                  </div>
                                )}
                                {b.for_someone_else && (() => {
                                  const beneAge = ageLabel(b.beneficiary_dob);
                                  return (
                                    <div>
                                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("apptForLabel")}</p>
                                      <p className="mt-0.5 font-semibold text-[#111827] [overflow-wrap:anywhere]">{b.beneficiary_name || t("otherPerson")}</p>
                                      {beneAge && (
                                        <p className="mt-0.5 text-[12px] text-[#6b7280]"><span className="text-[#9ca3af]">{t("fieldAge")}</span> {beneAge}</p>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {b.service_description && (
                              <ExpandableText text={b.service_description} lines={5} />
                            )}
                            {/* Pro cancelled → show why (so the client knows + can re-book). */}
                            {b.status === "cancelled" && b.cancelled_by === "professional" && (
                              <div className="rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                                <p className="text-[11px] font-semibold text-[#b91c1c]">{t("proCancelled")}</p>
                                {b.cancel_reason && (
                                  <p className="mt-0.5 text-xs text-[#374151]"><span className="text-[#6b7280]">{t("fieldReason")}</span> {b.cancel_reason}</p>
                                )}
                              </div>
                            )}

                            {/* Actions (sprint 441) — PRIMARY visible + "···" overflow menu. The
                                primary is the most-useful action for the state (Contactar by WhatsApp
                                while active; Confirmar finalización while awaiting; Dejar reseña once
                                done). Reprogramar / Cancelar / Reportar live in the menu. */}
                            {(() => {
                              const isActiveB = ["pending", "confirmed", "in_progress"].includes(b.status);
                              const wa = b.professionals?.whatsapp && b.status !== "cancelled" && b.status !== "completed"
                                ? getWhatsAppLink(b.professionals.whatsapp, t("waBooking")) : null;
                              const slug = b.professionals?.slug;
                              const menu: CardAction[] = [];
                              // "Ver perfil" lives in the menu (sprint 442): the name itself can't be a
                              // link — the whole collapsed header is the expand toggle (consistent with
                              // the other 3 sections) — so the profile is reached from here, cleanly.
                              if (slug) menu.push({ label: t("viewProfile"), onClick: () => router.push(`/profesionales/${slug}`) });
                              if (b.status === "awaiting_confirmation" && wa) menu.push({ label: t("contact"), onClick: () => window.open(wa, "_blank", "noopener,noreferrer") });
                              if (isActiveB) {
                                menu.push({ label: t("reschedule"), onClick: () => setReschedule({ id: b.id, professionalId: b.professional_id, when: formatBookingDate(b, dateLocale) }) });
                                menu.push({ label: t("cancel"), onClick: () => { setCancelTarget(b.id); setCancelNote(""); }, destructive: true });
                              }
                              menu.push({ label: t("report"), onClick: () => setReportProFor(b.id), destructive: true });

                              let primary: ReactNode = null;
                              if (b.status === "awaiting_confirmation") {
                                primary = <Button size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => confirmBookingDone(b.id)}>{t("confirmCompletion")}</Button>;
                              } else if (b.status === "completed") {
                                primary = <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id })}>{rev ? t("editReview") : t("leaveReview")}</Button>;
                              } else if (wa) {
                                primary = (
                                  <Button variant="whatsapp" size="sm" asChild className="flex-1 sm:flex-none rounded-lg px-4">
                                    <a href={wa} target="_blank" rel="noopener noreferrer"><WhatsAppIcon className="h-4 w-4" /> {t("contact")}</a>
                                  </Button>
                                );
                              }
                              return (
                                <div className="flex items-center gap-2">
                                  {primary}
                                  <div className="ml-auto">
                                    <CardActionsMenu actions={menu} label={t("actions")} />
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PUBLISHED PROJECTS */}
      {section === "projects" && (
        <div>
          {projects.length === 0 ? (
            <div className="text-center py-14 rounded-2xl border border-dashed border-[#e5e7eb] bg-white">
              <FolderOpen className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
              <p className="font-semibold text-[#374151]">{t("pEmpty")}</p>
              <p className="text-sm text-[#6b7280] mt-1">
                {t("pEmptySub")}
              </p>
              <Button className="mt-5" onClick={() => setShowPublish(true)}>
                {t("publishProject")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {/* PRIMARY action — DESKTOP: a prominent right-aligned button above the filters
                  (no bottom nav bar there, so a top button is the cleanest, most visible spot).
                  MOBILE uses the floating action button below instead (thumb-reachable while
                  scrolling, clear of the fixed bottom nav bar) — so this row is hidden on phones
                  to avoid a redundant second publish button. */}
              <div className="hidden lg:flex justify-end">
                <Button className="rounded-full px-5" onClick={() => setShowPublish(true)}>
                  {t("publishProject")}
                </Button>
              </div>
              <StatusFilterTabs tabs={PROYECTO_TABS} value={projectFilter} onChange={setProjectFilter} counts={projectCounts} />
              {filteredProjects.length === 0 && (
                <p className="text-sm text-[#6b7280] text-center py-8">{t("noProjectsView")}</p>
              )}
              {filteredProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const proposalList = projectProposals[project.id];
                const proposalCount = project.proposals?.length ?? 0;
                const zone = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                const statusVariant = project.status === "in_progress" || project.status === "awaiting_confirmation" ? "warning"
                  : project.status === "completed" ? "success"
                    : project.status === "cancelled" ? "error"
                      : "default";
                const statusLabel = project.status === "in_progress" ? t("projAssigned")
                  : project.status === "awaiting_confirmation" ? t("projAwaiting")
                    : project.status === "completed" ? t("projCompleted")
                      : project.status === "cancelled" ? t("projCancelled")
                        : t("projOpen");

                return (
                  <Card key={project.id} className="hover:shadow-md">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isExpanded && proposalCount > 0) await loadProposals(project.id);
                        setExpandedProject(isExpanded ? null : project.id);
                      }}
                      aria-expanded={isExpanded}
                      className={cn("w-full text-left p-4 sm:p-5 hover:bg-[#fafafa] transition-colors", isExpanded ? "rounded-t-2xl" : "rounded-2xl")}
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EBF5FB] text-[#0089bb]">
                          <FolderOpen className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start gap-2">
                            <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{project.title}</h3>
                            {!proyectoStatusRedundant(project.status) ? (
                              <Badge className="shrink-0 text-[11px] font-semibold" variant={statusVariant}>{statusLabel}</Badge>
                            ) : project.categories?.name ? (
                              <Badge variant="muted" className="shrink-0 text-[11px] font-semibold">{project.categories.name}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6b7280]">
                            <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> {t("proposalsCount", { count: proposalCount })}</span>
                            <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> {formatRelativeOrDate(project.created_at, locale)}</span>
                            {zone && <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> <span className="truncate">{zone}</span></span>}
                          </div>
                          {!isExpanded && project.description && (
                            <p className="mt-2 text-[13px] leading-relaxed text-[#6b7280] line-clamp-2 [overflow-wrap:anywhere]">{project.description}</p>
                          )}
                        </div>
                        <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[#9ca3af] transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-[#f3f4f6] px-4 pb-5 pt-4 sm:px-5">
                        <div className="flex flex-col gap-4">
                          {project.description && (
                            <ExpandableText text={project.description} lines={5} className="text-[13px] leading-relaxed text-[#6b7280]" />
                          )}

                          {(() => {
                            const st = project.status;
                            const menu: CardAction[] = [];
                            if (st === "open" || st === "in_progress" || st === "awaiting_confirmation") {
                              menu.push({ label: t("cancelProject"), onClick: () => updateProjectStatus(project.id, "cancelled"), destructive: true });
                            }
                            if (st !== "in_progress" && st !== "awaiting_confirmation") {
                              menu.push({ label: t("delete"), onClick: () => setDeleteTarget(project.id), destructive: true });
                            }
                            let primary: ReactNode = null;
                            if (st === "awaiting_confirmation") {
                              primary = <Button size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => confirmProjectCompletion(project.id)}>{t("confirmCompletion")}</Button>;
                            } else if (st === "completed") {
                              const rev = projectReview(project.id);
                              primary = <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => reviewProjectPro(project.id)}>{rev ? t("editReview") : t("leaveReview")}</Button>;
                            } else if (st === "cancelled") {
                              primary = <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => updateProjectStatus(project.id, "open")}>{t("reopenProject")}</Button>;
                            }
                            return (
                              <div className="flex items-center gap-2">
                                {primary}
                                <div className="ml-auto">
                                  <CardActionsMenu actions={menu} label={t("actions")} />
                                </div>
                              </div>
                            );
                          })()}

                          {proposalList && (() => {
                            const finalized = project.status === "completed";
                            const locked = finalized || project.status === "cancelled";
                            const accepted = proposalList.filter((p) => p.status === "accepted");
                            const pending = proposalList.filter((p) => p.status === "pending");
                            const declined = proposalList.filter((p) => p.status === "declined");
                            const visible = finalized && accepted.length > 0 ? accepted : [...accepted, ...pending, ...declined];
                            const hidden = finalized && accepted.length > 0 ? [...pending, ...declined] : [];

                            const renderProposal = (proposal: Proposal) => {
                              const isAccepted = proposal.status === "accepted";
                              return (
                                <div key={proposal.id} className={cn("rounded-xl border p-3.5", isAccepted ? "border-emerald-200 bg-emerald-50/40" : "border-[#e5e7eb] bg-white")}>
                                  <div className="flex items-start gap-3">
                                    <Avatar className="h-9 w-9 shrink-0">
                                      <AvatarImage src={proposal.professionals?.profiles?.avatar_url} />
                                      <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold">
                                        {getInitials(proposal.professionals?.profiles?.full_name ?? "?")}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        {proposal.professionals?.slug ? (
                                          <Link href={`/profesionales/${proposal.professionals.slug}`} className="text-sm font-semibold text-[#111827] hover:text-[#009FD9] hover:underline">
                                            {proposal.professionals?.profiles?.full_name}
                                          </Link>
                                        ) : (
                                          <p className="text-sm font-semibold text-[#111827]">{proposal.professionals?.profiles?.full_name}</p>
                                        )}
                                        {proposal.status === "accepted" && <Badge variant="success">{finalized ? t("finalized") : t("accepted")}</Badge>}
                                        {proposal.status === "declined" && <Badge variant="error">{t("declined")}</Badge>}
                                      </div>
                                      <p className="mt-0.5 text-xs font-semibold text-[#009FD9]">
                                        {proposal.price ? `\u20a1${proposal.price.toLocaleString("es-CR")}` : t("priceTBD")}
                                      </p>
                                      <ExpandableText text={proposal.message} lines={3} className="mt-1 text-[13px] leading-relaxed" />
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-[#eef0f2] pt-3">
                                    {proposal.status === "pending" && !locked && (
                                      <>
                                        <Button size="sm" onClick={() => acceptProposal(proposal.id, project.id)}>{t("accept")}</Button>
                                        <Button size="sm" variant="outline" onClick={() => declineProposal(proposal.id, project.id)}>{t("decline")}</Button>
                                      </>
                                    )}
                                    {!locked && (proposal.status === "accepted" || proposal.status === "declined") && (
                                      <Button size="sm" variant="outline" onClick={() => revertProposal(proposal.id, project.id)}>{t("changeDecision")}</Button>
                                    )}
                                    {proposal.professionals?.whatsapp && (
                                      <Button size="sm" variant="whatsapp" asChild>
                                        <a href={getWhatsAppLink(proposal.professionals.whatsapp, t("waProposal", { title: project.title }))} target="_blank" rel="noopener noreferrer">
                                          <WhatsAppIcon className="h-3.5 w-3.5" /> {t("whatsapp")}
                                        </a>
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              );
                            };

                            return (
                              <div className="border-t border-[#f3f4f6] pt-4">
                                {proposalList.length === 0 ? (
                                  <p className="py-2 text-center text-sm text-[#6b7280]">{t("noProposalsYet")}</p>
                                ) : (
                                  <div className="flex flex-col gap-3">
                                    {visible.map(renderProposal)}
                                    {hidden.length > 0 && (
                                      <details className="text-xs">
                                        <summary className="cursor-pointer text-[#6b7280] hover:text-[#374151]">{t("seeUnchosen", { count: hidden.length })}</summary>
                                        <div className="mt-2 flex flex-col gap-3 opacity-75">{hidden.map(renderProposal)}</div>
                                      </details>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* MOBILE floating action button (FAB) — the section's PRIMARY action. A top
                  button isn't thumb-reachable once you scroll a long list, so on phones the
                  publish CTA floats bottom-right, offset ABOVE the fixed bottom nav bar
                  (z-30 < the bar's z-40, and bottom = bar height + a gap) so it's always
                  reachable while scrolling and NEVER overlaps/hides behind the bar. Desktop
                  uses the top button above instead (this is lg:hidden). */}
              <button
                type="button"
                onClick={() => setShowPublish(true)}
                aria-label={t("publishProject")}
                className="lg:hidden fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 inline-flex items-center gap-2 rounded-full bg-[#009FD9] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#009FD9]/30 transition-transform active:scale-95 hover:bg-[#0089bb]"
              >
                <Plus className="h-5 w-5" />
                {t("publishShort")}
              </button>
            </div>
          )}
        </div>
      )}

      {reviewModal && (
        <LeaveReviewModal
          {...reviewModal}
          onSuccess={loadMyReviews}
          onClose={() => setReviewModal(null)}
        />
      )}

      {/* Publicar proyecto — the project form opens in a modal here (no longer a
          separate page), and refreshes this list on a successful publish. */}
      {showPublish && (
        <PublishProjectModal onClose={() => setShowPublish(false)} onSuccess={refreshProjects} />
      )}

      {/* CLIENT reschedule — pick a new available slot for the same pro (atomic swap). */}
      {reschedule && (
        <RescheduleModal
          professionalId={reschedule.professionalId}
          bookingId={reschedule.id}
          currentWhen={reschedule.when}
          onClose={() => setReschedule(null)}
          onDone={fetchSection}
        />
      )}

      {/* CLIENT cancel — clean confirm dialog; the note is OPTIONAL (low-friction). */}
      {cancelTarget && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !cancelling && setCancelTarget(null)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t("cancelTitle")} className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <h2 className="text-base font-bold text-[#111827]">{t("cancelTitle")}</h2>
            <p className="mt-1 text-sm text-[#6b7280]">{t("cancelBody")}</p>
            <label className="mt-4 block text-xs font-medium text-[#374151]">{t("cancelNoteLabel")}</label>
            <textarea
              value={cancelNote}
              onChange={(e) => setCancelNote(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder={t("cancelNotePlaceholder")}
              className="mt-1 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => setCancelTarget(null)} disabled={cancelling}>{t("cancelBack")}</Button>
              <Button size="sm" className="flex-1 rounded-full bg-red-600 hover:bg-red-700" onClick={confirmCancelBooking} disabled={cancelling} loading={cancelling}>{t("cancelConfirm")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE publicación — clean on-brand confirm modal (replaces window.confirm). */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleting && setDeleteTarget(null)} aria-hidden />
          <div role="dialog" aria-modal="true" aria-label={t("deleteTitle")} className="relative w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
            <h2 className="text-base font-bold text-[#111827]">{t("deleteTitle")}</h2>
            <p className="mt-1 text-sm text-[#6b7280]">{t("deleteBody")}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("cancelBack")}</Button>
              <Button size="sm" className="flex-1 rounded-full bg-red-600 hover:bg-red-700" onClick={confirmDeleteProject} disabled={deleting} loading={deleting}>{t("delete")}</Button>
            </div>
          </div>
        </div>
      )}

      {/* REPORT professional — clean on-brand modal (replaces window.prompt). */}
      {reportProFor && (
        <ReportModal
          title={t("reportTitle")}
          body={t("reportBody")}
          reasons={[t("reportR1"), t("reportR2"), t("reportR3"), t("reportR4")]}
          detailsPlaceholder={t("reportDetails")}
          backLabel={t("cancelBack")}
          submitLabel={t("reportSubmit")}
          onClose={() => setReportProFor(null)}
          onSubmit={submitReportPro}
        />
      )}
    </>
  );
}
