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

  async function cancelBooking(id: string) {
    const reason = window.prompt(t("cancelPrompt")) ?? "";
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled", cancelReason: reason.trim() || undefined }),
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
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

  async function deleteProject(projectId: string) {
    if (!confirm(t("deleteProjectConfirm"))) return;
    const res = await fetch(`/api/projects?id=${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? t("deleteProjectError"));
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
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
              <p className="text-sm text-[#9ca3af] mt-1">{t("bEmptySub")}</p>
              <Button className="mt-5" asChild>
                <a href="/buscar">{t("searchPros")}</a>
              </Button>
            </div>
          ) : (
            <>
              <StatusFilterTabs tabs={SOLICITUD_TABS} value={bookingFilter} onChange={setBookingFilter} counts={bookingCounts} />
              {filteredBookings.length === 0 ? (
                <p className="text-sm text-[#9ca3af] text-center py-8">{t("noBookingsView")}</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {filteredBookings.map((b) => {
                    const rev = b.status === "completed" ? bookingReview(b.id) : undefined;
                    return (
                      <Card key={b.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
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
                                    <span className="text-[#9ca3af]">{t("fieldDate")}</span> <span className="font-medium">{formatBookingDate(b, dateLocale)}</span>
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-col gap-2 shrink-0">
                              {b.status === "awaiting_confirmation" && (
                                <Button size="sm" onClick={() => confirmBookingDone(b.id)}>
                                  {t("confirmCompletion")}
                                </Button>
                              )}
                              {b.status === "completed" && (
                                <Button variant="outline" size="sm" onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id })}>
                                  {rev ? t("editReview") : t("leaveReview")}
                                </Button>
                              )}
                              {["pending", "confirmed", "in_progress"].includes(b.status) && (
                                <Button size="sm" variant="outline" onClick={() => cancelBooking(b.id)}>{t("cancel")}</Button>
                              )}
                              {b.professionals?.whatsapp && b.status !== "cancelled" && b.status !== "completed" && (
                                <Button size="sm" variant="whatsapp" asChild>
                                  <a href={getWhatsAppLink(b.professionals.whatsapp, t("waBooking"))} target="_blank" rel="noopener noreferrer">
                                    <WhatsAppIcon className="h-3.5 w-3.5" /> {t("contact")}
                                  </a>
                                </Button>
                              )}
                              {/* Reporting available in every state — a no-show or
                                  abusive professional can happen before confirmation too. */}
                              <button onClick={() => reportProfessional(b.id)} className="text-xs text-[#9ca3af] hover:text-red-500 transition-colors">
                                {t("report")}
                              </button>
                            </div>
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
              <p className="text-sm text-[#9ca3af] mt-1">
                {t("pEmptySub")}
              </p>
              <Button className="mt-5" onClick={() => setShowPublish(true)}>
                {t("publishProject")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Primary action on its OWN row (full-width on mobile, right-aligned on
                  desktop) so it never competes with / wraps awkwardly under the four status
                  pills — those then sit cleanly on their own line below. */}
              <div className="flex justify-end">
                <Button size="sm" className="w-full sm:w-auto" onClick={() => setShowPublish(true)}>
                  {t("publishProject")}
                </Button>
              </div>
              <StatusFilterTabs tabs={PROYECTO_TABS} value={projectFilter} onChange={setProjectFilter} counts={projectCounts} />
              {filteredProjects.length === 0 && (
                <p className="text-sm text-[#9ca3af] text-center py-8">{t("noProjectsView")}</p>
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
                        <p className="mt-0.5 text-xs text-[#9ca3af]">{t("proposalsCount", { count: proposalCount })}</p>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-[#9ca3af] shrink-0 mt-0.5 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-[#f3f4f6] flex flex-col gap-2.5">
                        {project.description && (
                          <p className="text-sm text-[#6b7280] whitespace-pre-line">{project.description}</p>
                        )}
                        <p className="text-xs text-[#374151]">
                          <span className="text-[#9ca3af]">{t("fieldPublished")}</span> <span className="font-medium">{new Date(project.created_at).toLocaleDateString(dateLocale)}</span>
                        </p>
                        {(project.provincias?.name || project.cantones?.name) && (
                          <p className="text-xs text-[#9ca3af]"><span className="text-[#9ca3af]">{t("fieldZone")}</span> {[project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ")}</p>
                        )}

                      {/* ACTIONS — same layout as the other sections: primary action(s) full-width
                          on mobile, one tidy wrapping row on desktop; the destructive minor action
                          (Eliminar) is a quiet text link below. */}
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                          {project.status === "open" && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                              {t("cancelProject")}
                            </Button>
                          )}
                          {project.status === "cancelled" && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => updateProjectStatus(project.id, "open")}>
                              {t("reopenProject")}
                            </Button>
                          )}
                          {project.status === "awaiting_confirmation" && (
                            <Button size="sm" className="w-full sm:w-auto" onClick={() => confirmProjectCompletion(project.id)}>
                              {t("confirmCompletion")}
                            </Button>
                          )}
                          {(project.status === "in_progress" || project.status === "awaiting_confirmation") && (
                            <Button size="sm" variant="outline" className="w-full sm:w-auto text-red-500 border-red-200 hover:bg-red-50" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                              {t("cancelProject")}
                            </Button>
                          )}
                          {project.status === "completed" && (() => {
                            const rev = projectReview(project.id);
                            return (
                              <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => reviewProjectPro(project.id)}>
                                {rev ? t("editReview") : t("leaveReview")}
                              </Button>
                            );
                          })()}
                        </div>
                        {project.status !== "in_progress" && project.status !== "awaiting_confirmation" && (
                          <button onClick={() => deleteProject(project.id)} className="self-start text-xs font-semibold text-[#9ca3af] hover:text-red-500 transition-colors">
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
                                    : <span className="text-[#9ca3af]">{t("priceTBD")}</span>}
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
                              <p className="text-sm text-[#9ca3af] text-center py-2">{t("noProposalsYet")}</p>
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
    </>
  );
}
