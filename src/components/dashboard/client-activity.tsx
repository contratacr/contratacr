"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CalendarDays, FolderOpen, ClipboardList, Plus, CalendarClock, Wrench, Users, MapPin, FileText, Flag, CheckCircle2 } from "lucide-react";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@/i18n/navigation";
import { getCategoryLabel } from "@/lib/data/categories";
import { computeAge } from "@/lib/age";
import { formatColonesTaxIncluded, splitPricingLabel } from "@/lib/pricing";
import { getInitials, cn, formatRelativeOrDate } from "@/lib/utils";
import { StatusFilterTabs, SOLICITUD_TABS, PROYECTO_TABS, solicitudMatches, solicitudBucket, solicitudStatusRedundant, proyectoMatches, proyectoBucket, proyectoStatusRedundant, bucketCounts } from "@/components/dashboard/status-filter-tabs";
import { CardActionsMenu, type CardAction } from "@/components/dashboard/card-actions-menu";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { ExpandableText } from "@/components/ui/expandable-text";
import { ReportModal } from "@/components/dashboard/report-modal";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";
import { RescheduleModal } from "@/components/booking/reschedule-modal";
import { SavedProfessionalsTab } from "@/components/professionals/saved-professionals-tab";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAppDialog } from "@/hooks/use-app-dialog";
import type { BookingStatus } from "@/types";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";

/**
 * Shared "acting as a client" activity views — the user's SENT solicitudes,
 * PUBLISHED projects, and saved professionals. Rendered both in the plain
 * client dashboard and inside the unified professional dashboard's "Cuando
 * contrato" group, so a professional manages everything in one place without
 * switching panels. Pure reorganization — same business logic/endpoints.
 */

export type ClientActivitySection = "bookings" | "projects" | "saved";

const OPEN_PUBLISH_PROJECT_EVENT = "contratacr:open-publish-project";

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
  archived_by_client?: boolean;
  // The specific service the request is for + who it's for (a dependent/"otra persona").
  category_id?: string | null;
  slot_location_id?: string | null;
  slot_location_label?: string | null;
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
  archived_by_client?: boolean;
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_is_minor?: boolean;
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
    verification_status?: string | null;
    profiles: { full_name: string; avatar_url?: string };
    categories: { name: string };
  };
};

// ONE shared status→colour mapping (sprint 440), identical to the pro side so a
// booking's state reads the SAME everywhere: ACTIVE/upcoming = brand-blue (default),
// awaiting confirmation = brand-blue/info, FINISHED = green, cancelled = red.
// (Previously active states were green "success" — reading as done/closed — and the
// finished state was muted grey: the open-vs-closed state looked inverted.)
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "default",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "default",
  completed: "success",
  cancelled: "error",
  rescheduled: "muted",
};

function PendingStatusText({ label }: { label: string }) {
  return <Badge variant="default" className="shrink-0 text-[11px] font-semibold">{label}</Badge>;
}

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

const NO_BOOKINGS: Booking[] = [];
const NO_PROJECTS: Project[] = [];

async function fetchClientBookings(): Promise<Booking[]> {
  const res = await fetch("/api/bookings?role=client", { cache: "no-store" });
  const { bookings } = await res.json();
  return bookings ?? [];
}

async function fetchClientProjects(): Promise<Project[]> {
  const res = await fetch("/api/projects?role=client", { cache: "no-store" });
  const { projects } = await res.json();
  return projects ?? [];
}

export function ClientActivity({ section }: { section: ClientActivitySection }) {
  const { user } = useAuth();
  const t = useTranslations("clientActivity");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";

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

  // Rows come from the shared cache: a return to this tab paints what was here
  // before and refreshes quietly. Keys match the notification prefetch, so a
  // toast about a booking or a proposal has already warmed the next visit.
  const bookingsResource = useCachedResource<Booking[]>(
    user && section === "bookings" ? `dashboard:client-bookings:${user.id}` : null,
    fetchClientBookings,
    NO_BOOKINGS,
  );
  const projectsResource = useCachedResource<Project[]>(
    user && section === "projects" ? `dashboard:client-projects:${user.id}` : null,
    fetchClientProjects,
    NO_PROJECTS,
  );
  const { data: bookings, setData: setBookings } = bookingsResource;
  const { data: projects, setData: setProjects } = projectsResource;
  const loading = section === "bookings" ? bookingsResource.loading : section === "projects" ? projectsResource.loading : false;
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string; bookingId?: string; projectId?: string } | null>(null);
  const [myReviews, setMyReviews] = useState<{ professional_id: string; booking_id?: string | null; project_id?: string | null; rating: number }[]>([]);
  // One unified filter set (sprint 430): Activas · Finalizadas · Canceladas.
  const [bookingFilter, setBookingFilter] = useState("activas");
  const [projectFilter, setProjectFilter] = useState("activas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  // Solicitudes is now a collapsible accordion too (sprint 440) — same card language
  // as the professional Solicitudes / Proyectos sections and Mis proyectos.
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [projectProposals, setProjectProposals] = useState<Record<string, Proposal[]>>({});
  const [showPublish, setShowPublish] = useState(false);
  // CLIENT reschedule: the client (owner of the appointment) picks another available
  // slot for the same pro → old slot freed, new slot taken (atomic). The pro does NOT
  // reschedule (they cancel + coordinate via WhatsApp) — see sprint 433.
  const [reschedule, setReschedule] = useState<{
    id: string;
    professionalId: string;
    when: string | null;
    locationId?: string | null;
    locationLabel?: string | null;
  } | null>(null);
  // CLIENT cancel inline panel (optional note).
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [cancelling, setCancelling] = useState(false);
  // Published request cancel confirm. Separate from appointment cancel because projects
  // do not free a calendar slot, but professionals with proposals should still be warned.
  const [cancelProjectTarget, setCancelProjectTarget] = useState<string | null>(null);
  const [cancellingProject, setCancellingProject] = useState(false);
  // Delete-project confirm dialog (clean modal, not a browser confirm()).
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // "Reportar profesional" clean modal (replaces the old window.prompt), keyed by booking id.
  const [reportProFor, setReportProFor] = useState<string | null>(null);
  const targetRetryRef = useRef(0);
  const targetBookingRef = useRef<string | null>(null);
  const targetBookingHandledRef = useRef(false);
  const targetProjectRetryRef = useRef(0);
  const targetProjectRef = useRef<string | null>(null);
  const targetProjectHandledRef = useRef(false);
  const openPublishHandledRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);
  const lastSilentRefreshRef = useRef(0);
  const refreshBookings = bookingsResource.refresh;
  const refreshProjectRows = projectsResource.refresh;

  // Re-fetch the section's rows; the cached ones stay on screen meanwhile.
  const fetchSection = useCallback(async () => {
    if (!user) return;
    if (section === "bookings") await refreshBookings();
    else if (section === "projects") await refreshProjectRows();
  }, [user, section, refreshBookings, refreshProjectRows]);

  const reloadLoadedProjectProposals = useCallback(async () => {
    const ids = [...new Set([...Object.keys(projectProposals), expandedProject].filter(Boolean))] as string[];
    if (ids.length === 0) return;
    const entries = await Promise.all(ids.map(async (projectId) => {
      const res = await fetch(`/api/proposals?project=${projectId}`, { cache: "no-store" });
      const { proposals } = await res.json().catch(() => ({ proposals: [] }));
      return [projectId, proposals ?? []] as const;
    }));
    setProjectProposals((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
  }, [expandedProject, projectProposals]);

  const refreshSoon = useCallback(() => {
    if (section === "saved" || document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void fetchSection();
      if (section === "projects") void reloadLoadedProjectProposals();
    }, delay);
  }, [fetchSection, reloadLoadedProjectProposals, section]);

  useEffect(() => {
    if (!user || section === "saved" || loading) return;
    window.addEventListener("notificationsChanged", refreshSoon);
    window.addEventListener("focus", refreshSoon);
    document.addEventListener("visibilitychange", refreshSoon);
    return () => {
      window.removeEventListener("notificationsChanged", refreshSoon);
      window.removeEventListener("focus", refreshSoon);
      document.removeEventListener("visibilitychange", refreshSoon);
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    };
  }, [loading, refreshSoon, section, user]);

  useEffect(() => {
    if (section !== "bookings") return;
    const bookingId = searchParams.get("booking");
    if (!bookingId) return;
    if (targetBookingRef.current !== bookingId) {
      targetBookingRef.current = bookingId;
      targetRetryRef.current = 0;
      targetBookingHandledRef.current = false;
    }
    if (targetBookingHandledRef.current) return;
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) {
      if (targetRetryRef.current >= 8) return;
      targetRetryRef.current += 1;
      const id = window.setTimeout(() => void fetchSection(), 900);
      return () => window.clearTimeout(id);
    }
    targetRetryRef.current = 0;
    targetBookingHandledRef.current = true;
    const id = window.setTimeout(() => {
      setBookingFilter(solicitudBucket(booking.status, booking.scheduled_date));
      setExpandedBooking(bookingId);
      window.setTimeout(() => document.getElementById(`booking-${bookingId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    }, 0);
    return () => window.clearTimeout(id);
  }, [bookings, fetchSection, searchParams, section]);

  useEffect(() => {
    if (section !== "projects") return;
    const projectId = searchParams.get("project");
    if (!projectId) return;
    if (targetProjectRef.current !== projectId) {
      targetProjectRef.current = projectId;
      targetProjectRetryRef.current = 0;
      targetProjectHandledRef.current = false;
    }
    if (targetProjectHandledRef.current) return;
    const project = projects.find((p) => p.id === projectId);
    if (!project) {
      if (targetProjectRetryRef.current >= 8) return;
      targetProjectRetryRef.current += 1;
      const id = window.setTimeout(() => void fetchSection(), 900);
      return () => window.clearTimeout(id);
    }
    targetProjectRetryRef.current = 0;
    targetProjectHandledRef.current = true;
    const id = window.setTimeout(() => {
      setProjectFilter(proyectoBucket(project.status));
      void loadProposals(projectId);
      setExpandedProject(projectId);
      window.setTimeout(() => document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    }, 0);
    return () => window.clearTimeout(id);
    // `loadProposals` reads the current proposals map; targetProjectHandledRef prevents repeat opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSection, projects, searchParams, section]);

  useEffect(() => {
    if (section !== "projects") return;
    const openPublish = () => setShowPublish(true);
    window.addEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
    return () => window.removeEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
  }, [section]);

  useEffect(() => {
    if (section !== "projects" || openPublishHandledRef.current) return;
    if (searchParams.get("openPublish") !== "1") return;
    openPublishHandledRef.current = true;
    queueMicrotask(() => setShowPublish(true));
  }, [searchParams, section]);

  const loadMyReviews = useCallback(async () => {
    try {
      const res = await fetch("/api/reviews?mine=1");
      const { reviews } = await res.json();
      setMyReviews(reviews ?? []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { queueMicrotask(() => loadMyReviews()); }, [loadMyReviews]);

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

  async function archiveBooking(id: string) {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "archive" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("archiveError"), tone: "danger" });
      return;
    }
    setBookings((prev) => prev.filter((b) => b.id !== id));
    if (expandedBooking === id) setExpandedBooking(null);
  }

  function openCancelBooking(id: string) {
    setCancelTarget(id);
    setCancelNote("");
    setExpandedBooking(id);
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
    if (!reportProFor) return false;
    const res = await fetch("/api/report-professional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: reportProFor, reason }),
    });
    return res.ok;
  }

  async function refreshProjects() {
    await refreshProjectRows();
  }

  async function updateProjectStatus(projectId: string, status: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, status }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("projectUpdateError"), tone: "danger" });
      return;
    }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status, ...(status === "open" ? { proposals: [] } : {}) } : p)));
    if (status === "open") {
      setProjectProposals((prev) => {
        if (!prev[projectId]) return prev;
        return { ...prev, [projectId]: [] };
      });
    }
    refreshProjects();
  }

  async function archiveProject(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, action: "archive" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("archiveError"), tone: "danger" });
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (expandedProject === projectId) setExpandedProject(null);
  }

  function openCancelProject(projectId: string) {
    setCancelProjectTarget(projectId);
    setExpandedProject(projectId);
  }

  async function confirmCancelProject(projectId: string) {
    setCancellingProject(true);
    await updateProjectStatus(projectId, "cancelled");
    setCancellingProject(false);
    setCancelProjectTarget(null);
  }

  async function confirmProjectCompletion(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, action: "confirm" }),
    });
    if (!res.ok) {
      void showMessage({ title: errorTitle, description: t("confirmError"), tone: "danger" });
      return;
    }
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
      void showMessage({ title: errorTitle, description: j.error ?? t("deleteProjectError"), tone: "danger" });
      setDeleting(false);
      return;
    }
    setProjects((prev) => prev.filter((p) => p.id !== deleteTarget));
    setDeleting(false);
    setDeleteTarget(null);
  }

  async function loadProposals(projectId: string, force = false) {
    if (!force && projectProposals[projectId]) return;
    const res = await fetch(`/api/proposals?project=${projectId}`, { cache: "no-store" });
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
      void showMessage({ title: errorTitle, description: t("noAssignedPro"), tone: "danger" });
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
      [projectId]: (prev[projectId] ?? []).map((p) => {
        if (p.id === proposalId) return { ...p, status: "accepted" };
        if (p.status === "pending") return { ...p, status: "declined" };
        return p;
      }),
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
    const currentItems = section === "bookings" ? bookings : projects;
    return <PanelListSkeleton rows={3} withTabs hasData={currentItems.length > 0} />;
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
            <PanelEmptyState
              icon={CalendarDays}
              title={t("bEmpty")}
              description={t("bEmptySub")}
              action={<Button asChild><Link href="/buscar">{t("searchPros")}</Link></Button>}
            />
          ) : (
            <>
              <StatusFilterTabs tabs={SOLICITUD_TABS} value={bookingFilter} onChange={setBookingFilter} counts={bookingCounts} />
              {filteredBookings.length === 0 ? (
                <p className="text-sm text-[#6b7280] text-center py-8">{t("noBookingsView")}</p>
              ) : (
                <div className="ccr-native-safe-list-end flex flex-col gap-3.5">
                  {filteredBookings.map((b) => {
                    const rev = b.status === "completed" ? bookingReview(b.id) : undefined;
                    return (
                      <Card id={`booking-${b.id}`} key={b.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", expandedBooking === b.id && "shadow-md ring-1 ring-[#d8eef8]")}>
                        {/* COLLAPSED header — SAME card language as the other 3 sections: avatar +
                            pro name (primary, bold) + status chip on the right; "Fecha: {cita}"
                            key line. Tap to reveal the full description, cancel reason + actions. */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            const closing = expandedBooking === b.id;
                            setExpandedBooking(closing ? null : b.id);
                            if (closing) {
                              setCancelTarget(null);
                              setCancelNote("");
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              const closing = expandedBooking === b.id;
                              setExpandedBooking(closing ? null : b.id);
                              if (closing) {
                                setCancelTarget(null);
                                setCancelNote("");
                              }
                            }
                          }}
                          aria-expanded={expandedBooking === b.id}
                          className={cn("group w-full cursor-pointer text-left p-4 sm:p-5 flex items-start gap-3.5 hover:bg-[#f9fbfd] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]", expandedBooking === b.id ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                            <CalendarClock className="h-[18px] w-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              {b.professionals?.slug ? (
                                <Link
                                  href={`/profesionales/${b.professionals.slug}?from=${encodeURIComponent("/dashboard/cliente")}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] hover:text-[#009FD9] hover:underline sm:text-base"
                                >
                                  {b.professionals?.profiles?.full_name ?? t("professional")}
                                </Link>
                              ) : (
                                <span className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">
                                  {b.professionals?.profiles?.full_name ?? t("professional")}
                                </span>
                              )}
                              {!solicitudStatusRedundant(b.status, b.scheduled_date) && (
                                b.status === "pending" ? (
                                  <PendingStatusText label={t(`bStatus.${b.status}`)} />
                                ) : (
                                  <Badge variant={STATUS_VARIANT[b.status]} className="shrink-0 text-[11px] font-semibold">{t(`bStatus.${b.status}`)}</Badge>
                                )
                              )}
                            </div>
                            {/* Appointment date with a grey calendar icon (no "Fecha:" label). */}
                            {formatBookingDate(b, dateLocale) && (
                              <span className="mt-2 inline-flex w-full max-w-full items-center gap-2 text-[13px] text-[#374151] sm:w-auto">
                                <CalendarClock className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldDate")}</span> <span className="text-[#374151]">{formatBookingDate(b, dateLocale)}</span></span>
                              </span>
                            )}
                            {/* The service the request was for (grey wrench). */}
                            {bookingServiceLabel(b) && (
                              <p className="mt-2 flex items-center gap-2 text-[13px] text-[#374151] min-w-0">
                                <Wrench className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                                <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldService")}</span> <span className="text-[#374151]">{bookingServiceLabel(b)}</span></span>
                              </p>
                            )}
                            {/* For someone else — a quiet at-a-glance hint. */}
                          </div>
                          <ExpandToggle open={expandedBooking === b.id} />
                        </div>

                        {expandedBooking === b.id && (
                          <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-3.5">
                            {/* The header already identifies the professional; expanded details stay flat. */}
                            {b.for_someone_else && (() => {
                              const beneAge = ageLabel(b.beneficiary_dob);
                              return (
                                <div className="flex items-start gap-2.5">
                                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("apptForLabel")}</p>
                                    <p className="mt-0.5 text-[13px] font-semibold text-[#111827] [overflow-wrap:anywhere]">{b.beneficiary_name || t("otherPerson")}</p>
                                    {beneAge && (
                                      <p className="mt-0.5 text-[12px]"><span className="text-[#9ca3af]">{t("fieldAge")}</span> <span className="text-[#374151]">{beneAge}</span></p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {b.service_description && (
                              <div className="flex items-start gap-2.5">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("descriptionField")}</p>
                                  <ExpandableText text={b.service_description} lines={5} className="mt-0.5 text-sm leading-relaxed text-[#4b5563]" />
                                </div>
                              </div>
                            )}
                            {/* Pro cancelled → show why (so the client knows + can re-book). */}
                            {b.status === "cancelled" && b.cancelled_by === "professional" && (
                              <div className="rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                                <p className="text-[11px] font-semibold text-[#b91c1c]">{t("proCancelled")}</p>
                                {b.cancel_reason && (
                                  <p className="mt-0.5 text-xs"><span className="text-[#9ca3af]">{t("fieldReason")}</span> <span className="text-[#374151]">{b.cancel_reason}</span></p>
                                )}
                              </div>
                            )}

                            {/* Actions: Reprogramar is a direct positive action; Cancelar stays focused
                                on cancellation only. */}
                            {(() => {
                              const isActiveB = ["pending", "confirmed", "in_progress"].includes(b.status);
                              const canContactAfterProCancel = b.status === "cancelled" && b.cancelled_by === "professional";
                              const canMessage = canContactAfterProCancel || (b.status !== "cancelled" && b.status !== "completed");
                              const actionButtonClass = "min-h-10 w-full rounded-lg px-3 text-sm font-bold";
                              let primary: ReactNode = null;
                              if (b.status === "awaiting_confirmation") {
                                primary = <Button size="sm" className={`${actionButtonClass} sm:min-w-[10rem] sm:flex-1`} onClick={() => confirmBookingDone(b.id)}>{t("confirmCompletion")}</Button>;
                              } else if (b.status === "completed") {
                                primary = <Button variant="outline" size="sm" className={`${actionButtonClass} sm:min-w-[10rem] sm:flex-1`} onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id })}>{rev ? t("editReview") : t("leaveReview")}</Button>;
                              } else if (canMessage && b.professional_id) {
                                primary = (
                                  <DirectChatLauncher professionalId={b.professional_id} professionalName={b.professionals?.profiles?.full_name || t("professional")} bookingId={b.id} contextTitle={b.service_description} buttonLabel={t("contact")} analyticsSource="booking" className={`${actionButtonClass} sm:min-w-[10rem] sm:flex-1`} />
                                );
                              }
                              return (
                                <div className="grid grid-cols-2 gap-2 border-t border-[#eef2f6] pt-3 sm:flex sm:flex-wrap sm:items-center">
                                  {primary}
                                  {isActiveB && (
                                    <>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`${actionButtonClass} border-[#bfdbfe] text-[#0089bb] hover:bg-[#f8fcff] sm:min-w-[10rem] sm:flex-1`}
                                        onClick={() => {
                                          setReschedule({
                                            id: b.id,
                                            professionalId: b.professional_id,
                                            when: formatBookingDate(b, dateLocale),
                                            locationId: b.slot_location_id ?? null,
                                            locationLabel: b.slot_location_label ?? null,
                                          });
                                          setCancelTarget(null);
                                          setCancelNote("");
                                        }}
                                      >
                                        <CalendarClock className="h-4 w-4" />
                                        {t("reschedule")}
                                      </Button>
                                      <Button variant="outline" size="sm" className={`${actionButtonClass} border-[#fecaca] text-[#dc2626] hover:border-[#fca5a5] hover:bg-[#fef2f2] hover:text-[#b91c1c] sm:min-w-[10rem] sm:flex-1`} onClick={() => openCancelBooking(b.id)}>
                                        {t("cancel")}
                                      </Button>
                                    </>
                                  )}
                                  {b.status === "cancelled" && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`${actionButtonClass} border-red-100 text-red-600 hover:bg-red-50 sm:min-w-[10rem] sm:flex-1`}
                                      onClick={() => archiveBooking(b.id)}
                                    >
                                      {t("archive")}
                                    </Button>
                                  )}
                                  <button
                                    type="button"
                                    aria-label={t("reportTitle")}
                                    title={t("reportTitle")}
                                    onClick={() => setReportProFor(b.id)}
                                    className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[#9ca3af] transition-colors hover:bg-[#f9fafb] hover:text-[#dc2626] sm:ml-auto sm:w-auto sm:min-w-[10rem]"
                                  >
                                    <Flag className="h-3.5 w-3.5" />
                                    <span>{t("reportTitle")}</span>
                                  </button>
                                </div>
                              );
                            })()}
                            {cancelTarget === b.id && (
                              <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3">
                                <p className="text-sm font-semibold text-[#111827]">{t("cancelTitle")}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">{t("cancelBody")}</p>
                                <label className="mt-3 block text-xs font-medium text-[#374151]">{t("cancelNoteLabel")}</label>
                                <textarea
                                  value={cancelNote}
                                  onChange={(e) => setCancelNote(e.target.value)}
                                  rows={2}
                                  maxLength={300}
                                  placeholder={t("cancelNotePlaceholder")}
                                  className="mt-1 w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#111827] placeholder:text-[#9ca3af] [overflow-wrap:anywhere] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
                                />
                                <div className="mt-3 flex gap-2">
                                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setCancelTarget(null)} disabled={cancelling}>{t("cancelBack")}</Button>
                                  <Button size="sm" className="rounded-lg bg-red-600 hover:bg-red-700" onClick={confirmCancelBooking} disabled={cancelling} loading={cancelling}>{t("cancelConfirm")}</Button>
                                </div>
                              </div>
                            )}
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
            <PanelEmptyState
              icon={FolderOpen}
              title={t("pEmpty")}
              description={t("pEmptySub")}
              action={<Button className="lg:hidden" onClick={() => setShowPublish(true)}>{t("publishProject")}</Button>}
            />
          ) : (
            <div className="ccr-native-safe-list-end flex flex-col gap-3.5">
              <StatusFilterTabs tabs={PROYECTO_TABS} value={projectFilter} onChange={setProjectFilter} counts={projectCounts} />
              {filteredProjects.length === 0 && (
                <p className="text-sm text-[#6b7280] text-center py-8">{t("noProjectsView")}</p>
              )}
              {filteredProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const proposalList = projectProposals[project.id];
                const proposalCount = project.proposals?.length ?? 0;
                const zone = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                const statusVariant = project.status === "awaiting_confirmation" ? "default"
                  : project.status === "in_progress" ? "default"
                  : project.status === "completed" ? "success"
                    : project.status === "cancelled" ? "error"
                      : "default";
                const statusLabel = project.status === "in_progress" ? t("projAssigned")
                  : project.status === "awaiting_confirmation" ? t("projAwaiting")
                    : project.status === "completed" ? t("projCompleted")
                      : project.status === "cancelled" ? t("projCancelled")
                        : t("projOpen");
                const showStatusBadge = !proyectoStatusRedundant(project.status) && !(projectFilter === "finalizadas" && project.status === "completed");

                return (
                  <Card id={`project-${project.id}`} key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", isExpanded && "shadow-md ring-1 ring-[#d8eef8]")}>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!isExpanded && proposalCount > 0) await loadProposals(project.id);
                        setExpandedProject(isExpanded ? null : project.id);
                      }}
                      aria-expanded={isExpanded}
                      className={cn("group w-full text-left p-4 sm:p-5 hover:bg-[#f9fbfd] transition-colors", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                    >
                      <div className="flex items-start gap-3.5">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                          <ClipboardList className="h-[18px] w-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</h3>
                            {showStatusBadge ? (
                              <Badge className="shrink-0 text-[11px] font-semibold" variant={statusVariant}>{statusLabel}</Badge>
                            ) : null}
                          </div>
                          <div className="mt-2 flex flex-col items-start gap-1.5 text-[13px]">
                            <span className="inline-flex w-full max-w-full items-center gap-2 text-[#6b7280]">
                              <Users className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
                              <span className="min-w-0 truncate"><span className="font-medium text-[#9ca3af]">{t("fieldProposals")}</span> <span className="text-[#374151]">{t("proposalsCount", { count: proposalCount })}</span></span>
                            </span>
                          </div>
                        </div>
                        <ExpandToggle open={isExpanded} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="rounded-b-2xl border-t border-[#f3f4f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5">
                        <div className="flex flex-col gap-4">
                          {(project.categories?.name || zone) && (
                            <div className="flex flex-col gap-2">
                              {project.categories?.name && (
                                <div className="flex items-start gap-2.5">
                                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldService")}</p>
                                    <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{project.categories.name}</p>
                                  </div>
                                </div>
                              )}
                              {zone && (
                                <div className="flex items-start gap-2.5">
                                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldZone")}</p>
                                    <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{zone}</p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {project.for_someone_else && (
                            <div className="flex items-start gap-2.5">
                              <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("projectForLabel")}</p>
                                <p className="mt-0.5 text-[13px] font-medium text-[#374151] [overflow-wrap:anywhere]">{project.beneficiary_name || t("otherPerson")}</p>
                                {ageLabel(project.beneficiary_dob) && (
                                  <p className="mt-0.5 text-[12px] text-[#6b7280]">{t("fieldAge")} {ageLabel(project.beneficiary_dob)}</p>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="flex items-start gap-2.5">
                            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                            <div className="min-w-0">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("fieldPublished")}</p>
                              <p className="mt-0.5 text-[13px] font-medium text-[#374151]">{formatRelativeOrDate(project.created_at, locale)}</p>
                            </div>
                          </div>

                          {project.description && (
                            <div className="flex items-start gap-2.5">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#9ca3af]" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#9ca3af]">{t("descriptionField")}</p>
                                <ExpandableText text={project.description} lines={5} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
                              </div>
                            </div>
                          )}

                          {(() => {
                            const st = project.status;
                            const menu: CardAction[] = [];
                            if (st === "open" || st === "in_progress" || st === "awaiting_confirmation") {
                              menu.push({ label: t("cancelProject"), onClick: () => openCancelProject(project.id), destructive: true });
                            }
                            if (st === "cancelled") {
                              menu.push({ label: t("archive"), onClick: () => archiveProject(project.id) });
                            }
                            let primary: ReactNode = null;
                            if (st === "completed") {
                              const rev = projectReview(project.id);
                              primary = <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => reviewProjectPro(project.id)}>{rev ? t("editReview") : t("leaveReview")}</Button>;
                            } else if (st === "cancelled") {
                              primary = <Button variant="outline" size="sm" className="flex-1 sm:flex-none rounded-lg px-4" onClick={() => updateProjectStatus(project.id, "open")}>{t("reopenProject")}</Button>;
                            }
                            return (
                              <div className="flex flex-wrap items-center gap-2">
                                {primary}
                                {menu.length === 1 ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className={cn(
                                      "ml-auto flex-1 rounded-lg px-4 sm:flex-none",
                                      menu[0].destructive
                                        ? "border-red-100 text-red-600 hover:bg-red-50"
                                        : "border-red-100 text-red-600 hover:bg-red-50"
                                    )}
                                    onClick={menu[0].onClick}
                                  >
                                    {menu[0].label}
                                  </Button>
                                ) : (
                                  <div className="ml-auto">
                                    <CardActionsMenu actions={menu} label={t("actions")} />
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {cancelProjectTarget === project.id && (
                            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3.5">
                              <p className="text-sm font-semibold text-[#111827]">{t("cancelProjectTitle")}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">
                                {t("cancelProjectBody")}
                              </p>
                              <div className="mt-3 flex flex-wrap justify-end gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg"
                                  onClick={() => setCancelProjectTarget(null)}
                                  disabled={cancellingProject}
                                >
                                  {t("cancelBack")}
                                </Button>
                                <Button
                                  size="sm"
                                  className="rounded-lg bg-red-600 hover:bg-red-700"
                                  onClick={() => confirmCancelProject(project.id)}
                                  disabled={cancellingProject}
                                  loading={cancellingProject}
                                >
                                  {t("cancelProjectConfirm")}
                                </Button>
                              </div>
                            </div>
                          )}

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
                              const proVerified = proposal.professionals?.verification_status === "verified";
                              const proposalPriceParts = proposal.price ? splitPricingLabel(formatColonesTaxIncluded(proposal.price)) : null;
                              return (
                                <div key={proposal.id} className={cn("rounded-xl border p-3.5", isAccepted ? "border-[#b8e7cf] bg-[#f2fbf6] shadow-[0_10px_24px_-22px_rgba(22,163,74,0.8)]" : "border-[#e5e7eb] bg-white")}>
                                  {isAccepted && (
                                    <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#15803d]">
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                      {finalized ? t("finalized") : t("selectedProposal")}
                                    </div>
                                  )}
                                  <div className="flex items-start gap-3">
                                    <Avatar className="h-9 w-9 shrink-0">
                                      <AvatarImage src={proposal.professionals?.profiles?.avatar_url} />
                                      <AvatarFallback className="bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold">
                                        {getInitials(proposal.professionals?.profiles?.full_name ?? "?")}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                                            {proposal.professionals?.slug ? (
                                              <Link href={`/profesionales/${proposal.professionals.slug}?from=${encodeURIComponent("/dashboard/cliente")}`} className="min-w-0 text-sm font-semibold text-[#111827] hover:text-[#009FD9] hover:underline">
                                                {proposal.professionals?.profiles?.full_name}
                                              </Link>
                                            ) : (
                                              <p className="min-w-0 text-sm font-semibold text-[#111827]">{proposal.professionals?.profiles?.full_name}</p>
                                            )}
                                            {proVerified ? (
                                              <Badge variant="verified" className="shrink-0">
                                                {t("verified")}
                                              </Badge>
                                            ) : (
                                              <span className="inline-flex shrink-0 items-center rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-2.5 py-0.5 text-xs font-medium text-[#6b7280]">
                                                {t("notVerifiedBadge")}
                                              </span>
                                            )}
                                          </div>
                                          {proposal.professionals?.categories?.name && (
                                            <p className="mt-0.5 truncate text-[11px] text-[#6b7280]">{proposal.professionals.categories.name}</p>
                                          )}
                                        </div>
                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                          <p className={cn("text-xs font-bold", isAccepted ? "text-[#15803d]" : "text-[#009FD9]")}>
                                            {proposalPriceParts ? (
                                              <>
                                                {proposalPriceParts.amount}
                                                <span className="ml-1 text-[9px] font-semibold tracking-wide text-[#9ca3af]">{proposalPriceParts.taxSuffix}</span>
                                              </>
                                            ) : t("priceTBD")}
                                          </p>
                                          {proposal.status === "declined" && <Badge variant="error">{t("declined")}</Badge>}
                                        </div>
                                      </div>
                                      <ExpandableText text={proposal.message} lines={2} className="mt-1 text-[13px] leading-relaxed" />
                                    </div>
                                  </div>
                                  <div className="mt-3 flex flex-col justify-start gap-2 border-t border-[#eef0f2] pt-3 sm:flex-row sm:flex-wrap sm:justify-end">
                                    {proposal.status === "pending" && !locked && (
                                      <>
                                        <Button size="sm" className="w-full px-3 sm:w-auto sm:min-w-[92px] sm:flex-none" onClick={() => acceptProposal(proposal.id, project.id)}>{t("accept")}</Button>
                                        <Button size="sm" variant="outline" className="w-full px-3 sm:w-auto sm:min-w-[92px] sm:flex-none" onClick={() => declineProposal(proposal.id, project.id)}>{t("decline")}</Button>
                                      </>
                                    )}
                                    {!locked && (proposal.status === "accepted" || proposal.status === "declined") && (
                                      <Button size="sm" variant="outline" className="h-10 w-full px-3 sm:w-auto sm:min-w-[156px] sm:flex-none" onClick={() => revertProposal(proposal.id, project.id)}>{t("changeDecision")}</Button>
                                    )}
                                    {project.status === "awaiting_confirmation" && isAccepted && (
                                      <Button size="sm" className="w-full px-3 sm:w-auto sm:min-w-[150px] sm:flex-none" onClick={() => confirmProjectCompletion(project.id)}>{t("confirmCompletion")}</Button>
                                    )}
                                    {proposal.professionals?.id && (
                                      <DirectChatLauncher professionalId={proposal.professionals.id} professionalName={proposal.professionals.profiles?.full_name || t("professional")} projectId={project.id} proposalId={proposal.id} contextTitle={project.title} buttonLabel={t("openChat")} openDirectly initialMessage={t("proposalChatGreeting", { title: project.title })} tone={(proposal.status === "pending" && !locked) || (project.status === "awaiting_confirmation" && isAccepted) ? "contrast" : "primary"} className="h-10 w-full rounded-lg px-3 text-sm font-bold disabled:cursor-wait sm:w-auto sm:min-w-[156px] sm:flex-none" />
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

              {/* MOBILE floating action button (FAB) — the section's primary action.
                  There is no dashboard bottom tab bar now, so keep it close to the safe
                  area instead of floating too high. */}
              <button
                type="button"
                onClick={() => setShowPublish(true)}
                aria-label={t("publishProject")}
                className="ccr-native-fab lg:hidden fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30 inline-flex items-center gap-2 rounded-full bg-[#009FD9] px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#009FD9]/30 transition-transform active:scale-95 hover:bg-[#0089bb]"
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
          slotLocationId={reschedule.locationId}
          slotLocationLabel={reschedule.locationLabel}
          onClose={() => setReschedule(null)}
          onDone={() => void fetchSection()}
        />
      )}

      {/* DELETE project - clean on-brand confirm modal (replaces window.confirm). */}
      {deleteTarget && (
        <Modal
          onClose={() => { if (!deleting) setDeleteTarget(null); }}
          title={t("deleteTitle")}
          size="sm"
          mobilePresentation="center"
          footerClassName="justify-center sm:justify-end"
          footer={(
            <>
              <Button variant="outline" size="sm" className="flex-1 rounded-lg sm:flex-none" onClick={() => setDeleteTarget(null)} disabled={deleting}>{t("cancelBack")}</Button>
              <Button size="sm" className="flex-1 rounded-lg bg-red-600 hover:bg-red-700 sm:flex-none" onClick={confirmDeleteProject} disabled={deleting} loading={deleting}>{t("delete")}</Button>
            </>
          )}
        >
          <p className="text-sm leading-6 text-[#6b7280]">{t("deleteBody")}</p>
        </Modal>
      )}

      {/* REPORT professional — clean on-brand modal (replaces window.prompt). */}
      {reportProFor && (
        <ReportModal
          title={t("reportTitle")}
          body={t("reportBody")}
          detailsPlaceholder={t("reportDetails")}
          backLabel={t("cancelBack")}
          submitLabel={t("reportSubmit")}
          successLabel={t("reportThanks")}
          errorLabel={t("reportError")}
          onClose={() => setReportProFor(null)}
          onSubmit={submitReportPro}
        />
      )}
      {dialogNode}
    </>
  );
}
