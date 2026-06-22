"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, FolderOpen, ChevronDown } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, PROYECTO_TABS, solicitudMatches, solicitudBucket, solicitudStatusRedundant, proyectoMatches, proyectoBucket, proyectoStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
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
  professionals?: {
    slug: string;
    whatsapp?: string;
    profiles: { full_name: string; avatar_url?: string };
    categories: { id: string; name: string };
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

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "warning",
  confirmed: "success",
  in_progress: "success",
  awaiting_confirmation: "warning",
  // Finalizada is a settled/terminal state → neutral badge, consistent with the
  // other statuses (no prominent brand-blue box).
  completed: "muted",
  cancelled: "error",
  rescheduled: "warning",
};

function formatBookingDate(b: Booking, dateLocale: string) {
  if (b.scheduled_date) {
    const [y, m, d] = b.scheduled_date.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString(dateLocale, {
      weekday: "short", day: "numeric", month: "short",
    });
    return b.scheduled_time ? `${label} · ${b.scheduled_time}` : label;
  }
  return b.preferred_date_text ?? null;
}

export function ClientActivity({ section }: { section: ClientActivitySection }) {
  const { user } = useAuth();
  const t = useTranslations("clientActivity");
  const locale = useLocale();
  const dateLocale = locale === "en" ? "en-US" : "es-CR";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string; bookingId?: string; projectId?: string } | null>(null);
  const [myReviews, setMyReviews] = useState<{ professional_id: string; booking_id?: string | null; project_id?: string | null; rating: number }[]>([]);
  // One unified filter set (sprint 430): Activas · Finalizadas · Canceladas.
  const [bookingFilter, setBookingFilter] = useState("activas");
  const [projectFilter, setProjectFilter] = useState("activas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
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

  async function reportProfessional(bookingId: string) {
    const reason = window.prompt(t("reportProPrompt"));
    if (!reason || !reason.trim()) return;
    const res = await fetch("/api/report-professional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, reason: reason.trim() }),
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
                <div className="flex flex-col gap-3">
                  {filteredBookings.map((b) => {
                    const rev = b.status === "completed" ? bookingReview(b.id) : undefined;
                    return (
                      <Card key={b.id}>
                        <CardContent className="p-4 flex flex-col gap-3">
                          <div className="flex items-start gap-3">
                            <Avatar className="h-10 w-10 shrink-0">
                              <AvatarImage src={b.professionals?.profiles?.avatar_url} />
                              <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold">
                                {getInitials(b.professionals?.profiles?.full_name ?? "?")}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                {b.professionals?.slug ? (
                                  <Link href={`/profesionales/${b.professionals.slug}`} className="text-sm font-semibold text-[#111827] hover:text-[#009FD9] hover:underline">
                                    {b.professionals?.profiles?.full_name ?? t("professional")}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-semibold text-[#111827]">
                                    {b.professionals?.profiles?.full_name ?? t("professional")}
                                  </span>
                                )}
                                {!solicitudStatusRedundant(b.status, b.scheduled_date) && (
                                  <Badge variant={STATUS_VARIANT[b.status]}>{t(`bStatus.${b.status}`)}</Badge>
                                )}
                              </div>
                              <p className="text-sm text-[#374151] line-clamp-2 mb-1">{b.service_description}</p>
                              {formatBookingDate(b, dateLocale) && (
                                <p className="text-xs text-[#374151]">
                                  <span className="text-[#6b7280]">{t("fieldDate")}</span> <span className="font-medium">{formatBookingDate(b, dateLocale)}</span>
                                </p>
                              )}
                              {/* Pro cancelled → show why (so the client knows + can re-book). */}
                              {b.status === "cancelled" && b.cancelled_by === "professional" && (
                                <div className="mt-1.5 rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                                  <p className="text-[11px] font-semibold text-[#b91c1c]">{t("proCancelled")}</p>
                                  {b.cancel_reason && (
                                    <p className="mt-0.5 text-xs text-[#374151]"><span className="text-[#6b7280]">{t("fieldReason")}</span> {b.cancel_reason}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Actions — IDENTICAL layout/treatment to the pro's Solicitudes recibidas
                              (sprint 437 consistency): primary full-width on mobile, the two outline
                              secondaries share a 2-col row, ONE wrapping row on desktop; Reportar is a
                              quiet text link. Shared Cancelar = red-outline pill, WhatsApp = green pill. */}
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                              {b.professionals?.whatsapp && b.status !== "cancelled" && b.status !== "completed" && (
                                <Button variant="whatsapp" size="sm" asChild className="w-full sm:w-auto rounded-full px-4">
                                  <a href={getWhatsAppLink(b.professionals.whatsapp, t("waBooking"))} target="_blank" rel="noopener noreferrer">
                                    <WhatsAppIcon className="h-4 w-4" /> {t("contact")}
                                  </a>
                                </Button>
                              )}
                              {b.status === "awaiting_confirmation" && (
                                <Button size="sm" className="w-full sm:w-auto rounded-full px-4" onClick={() => confirmBookingDone(b.id)}>{t("confirmCompletion")}</Button>
                              )}
                              {b.status === "completed" && (
                                <Button variant="outline" size="sm" className="w-full sm:w-auto rounded-full px-4" onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id })}>{rev ? t("editReview") : t("leaveReview")}</Button>
                              )}
                              {["pending", "confirmed", "in_progress"].includes(b.status) && (
                                <div className="grid grid-cols-2 gap-2 sm:contents">
                                  <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4" onClick={() => setReschedule({ id: b.id, professionalId: b.professional_id, when: formatBookingDate(b, dateLocale) })}>{t("reschedule")}</Button>
                                  <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setCancelTarget(b.id); setCancelNote(""); }}>{t("cancel")}</Button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => reportProfessional(b.id)} className="self-start text-xs font-semibold text-[#6b7280] hover:text-red-500 transition-colors">{t("report")}</button>
                          </div>
                        </CardContent>
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
            <div className="flex flex-col gap-3">
              {/* PRIMARY action — prominent on its OWN row (full-width on mobile, right-aligned
                  on desktop) above the filters, so creating a new publicación is clearly the main
                  CTA and never competes with the per-card secondary actions. */}
              <div className="flex justify-end">
                <Button className="w-full sm:w-auto rounded-full px-5" onClick={() => setShowPublish(true)}>
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

                return (
                  <Card key={project.id}>
                    {/* EXPANDABLE PUBLICACIÓN (sprint 430): COLLAPSED shows title · estado ·
                        nº de propuestas; tapping reveals the description, zona, fecha, the actions
                        and the propuestas list (accept/decline). */}
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isExpanded && proposalCount > 0) await loadProposals(project.id);
                        setExpandedProject(isExpanded ? null : project.id);
                      }}
                      aria-expanded={isExpanded}
                      className="w-full text-left p-4 flex items-start gap-2.5 hover:bg-[#fafafa] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-[#111827]">{project.title}</span>
                          {!proyectoStatusRedundant(project.status) && (
                            <Badge
                              variant={
                                project.status === "in_progress" ? "warning"
                                  : project.status === "awaiting_confirmation" ? "warning"
                                  : project.status === "completed" ? "success"
                                  : project.status === "cancelled" ? "error"
                                  : "success"
                              }
                            >
                              {project.status === "in_progress" ? t("projAssigned")
                                : project.status === "awaiting_confirmation" ? t("projAwaiting")
                                : project.status === "completed" ? t("projCompleted")
                                : project.status === "cancelled" ? t("projCancelled")
                                : t("projOpen")}
                            </Badge>
                          )}
                          {project.categories?.name && (
                            <Badge variant="muted" className="text-[11px]">{project.categories.name}</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-[#6b7280]">{t("proposalsCount", { count: proposalCount })}</p>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-[#6b7280] shrink-0 mt-0.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-[#f3f4f6] flex flex-col gap-2.5">
                        {project.description && (
                          <p className="text-sm text-[#6b7280] whitespace-pre-line">{project.description}</p>
                        )}
                        <p className="text-xs text-[#374151]">
                          <span className="text-[#6b7280]">{t("fieldPublished")}</span> <span className="font-medium">{new Date(project.created_at).toLocaleDateString(dateLocale)}</span>
                        </p>
                        {(project.provincias?.name || project.cantones?.name) && (
                          <p className="text-xs text-[#6b7280]"><span className="text-[#6b7280]">{t("fieldZone")}</span> {[project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ")}</p>
                        )}

                      {/* ACTIONS — same layout as the other sections: primary action(s) full-width
                          on mobile, one tidy wrapping row on desktop; the destructive minor action
                          (Eliminar) is a quiet text link below. */}
                      {/* ACTIONS — consistent pill treatment (sprint 437): the status's primary
                          action full-width on mobile / one wrapping row on desktop; "Eliminar" is a
                          quiet destructive text link opening a clean confirm modal. */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                          {project.status === "open" && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4 text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                              {t("cancelProject")}
                            </Button>
                          )}
                          {project.status === "cancelled" && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4" onClick={() => updateProjectStatus(project.id, "open")}>
                              {t("reopenProject")}
                            </Button>
                          )}
                          {project.status === "awaiting_confirmation" && (
                            <Button size="sm" className="w-full sm:w-auto rounded-full px-4" onClick={() => confirmProjectCompletion(project.id)}>
                              {t("confirmCompletion")}
                            </Button>
                          )}
                          {(project.status === "in_progress" || project.status === "awaiting_confirmation") && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4 text-red-600 border-red-200 hover:bg-red-50" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                              {t("cancelProject")}
                            </Button>
                          )}
                          {project.status === "completed" && (() => {
                            const rev = projectReview(project.id);
                            return (
                              <Button size="sm" variant="outline" className="w-full sm:w-auto rounded-full px-4" onClick={() => reviewProjectPro(project.id)}>
                                {rev ? t("editReview") : t("leaveReview")}
                              </Button>
                            );
                          })()}
                        </div>
                        {project.status !== "in_progress" && project.status !== "awaiting_confirmation" && (
                          <button onClick={() => setDeleteTarget(project.id)} className="self-start text-xs font-semibold text-[#6b7280] hover:text-red-600 transition-colors">
                            {t("delete")}
                          </button>
                        )}
                      </div>

                      {isExpanded && proposalList && (() => {
                        const finalized = project.status === "completed";
                        const locked = finalized || project.status === "cancelled";
                        const accepted = proposalList.filter((p) => p.status === "accepted");
                        const others = proposalList.filter((p) => p.status !== "accepted");
                        const primary = finalized && accepted.length > 0 ? accepted : proposalList;

                        const renderProposal = (proposal: Proposal) => (
                          <div key={proposal.id} className="flex items-start justify-between gap-3 p-3 rounded-xl bg-[#f9fafb] border border-[#e5e7eb]">
                            <div className="flex items-start gap-2 flex-1 min-w-0">
                              <Avatar className="h-8 w-8 shrink-0">
                                <AvatarImage src={proposal.professionals?.profiles?.avatar_url} />
                                <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold">
                                  {getInitials(proposal.professionals?.profiles?.full_name ?? "?")}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                {proposal.professionals?.slug ? (
                                  <Link href={`/profesionales/${proposal.professionals.slug}`} className="text-sm font-semibold text-[#111827] hover:text-[#009FD9] hover:underline">
                                    {proposal.professionals?.profiles?.full_name}
                                  </Link>
                                ) : (
                                  <p className="text-sm font-semibold text-[#111827]">
                                    {proposal.professionals?.profiles?.full_name}
                                  </p>
                                )}
                                {/* Price OR "a convenir" — informal pros often price after
                                    seeing the job, so an empty price reads as "to be agreed",
                                    never a blank. */}
                                <p className="text-xs font-medium">
                                  {proposal.price
                                    ? <span className="text-[#009FD9]">₡{proposal.price.toLocaleString("es-CR")}</span>
                                    : <span className="text-[#6b7280]">{t("priceTBD")}</span>}
                                </p>
                                <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">{proposal.message}</p>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {proposal.status === "pending" && !locked && (
                                <>
                                  <Button size="sm" onClick={() => acceptProposal(proposal.id, project.id)}>{t("accept")}</Button>
                                  <Button size="sm" variant="outline" onClick={() => declineProposal(proposal.id, project.id)}>{t("decline")}</Button>
                                </>
                              )}
                              {proposal.status === "accepted" && (
                                <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-3 py-1 leading-none">
                                  {finalized ? t("finalized") : t("accepted")}
                                </span>
                              )}
                              {proposal.status === "declined" && <Badge variant="error">{t("declined")}</Badge>}
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

                        return (
                          <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-3">
                            {proposalList.length === 0 ? (
                              <p className="text-sm text-[#6b7280] text-center py-2">{t("noProposalsYet")}</p>
                            ) : (
                              <>
                                {primary.map(renderProposal)}
                                {finalized && others.length > 0 && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-[#6b7280] hover:text-[#374151]">{t("seeUnchosen", { count: others.length })}</summary>
                                    <div className="flex flex-col gap-3 mt-2 opacity-70">{others.map(renderProposal)}</div>
                                  </details>
                                )}
                              </>
                            )}
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
              placeholder={t("cancelNotePlaceholder")}
              className="mt-1 w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent resize-none"
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
    </>
  );
}
