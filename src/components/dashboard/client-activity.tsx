"use client";

import { QuoteBlock } from "@/components/quotes/quote-block";
import { noInsistirArriba } from "@/lib/ir-al-inicio";
import { cargarCotizaciones } from "@/lib/quotes-store";

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CalendarDays, FolderOpen, ClipboardList, Plus, CalendarClock, CalendarCheck, Wrench, Users, FileText, CheckCircle2 } from "lucide-react";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { CardActionsMenu, type CardAction } from "@/components/dashboard/card-actions-menu";
import { formatBookingWhen, ordenarCitas } from "@/lib/booking-when";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Link, useRouter } from "@/i18n/navigation";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { getCategoryLabel } from "@/lib/data/categories";
import { computeAge } from "@/lib/age";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { etapaEnMasculino, StatusFilterTabs, SOLICITUD_TABS, PUBLICACION_ESTADO_TABS, solicitudMatches, solicitudBucket, proyectoPublicacionBucket, bucketCounts, sinFiltros } from "@/components/dashboard/status-filter-tabs";
import { ExpandToggle } from "@/components/dashboard/expand-toggle";
import { SectionHeadline } from "@/components/dashboard/section-headline";
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
import { PanelEmptyState, PanelFilterEmpty, PanelListSkeleton } from "@/components/ui/content-loading";

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
  // Lo que se puede corregir. El API de `role=client` ya devuelve la fila
  // entera, así que no hay consulta nueva: solo faltaba nombrarlos.
  category_id?: string | null;
  provincia_id?: string | null;
  canton_id?: string | null;
  created_at: string;
  categories?: { name: string };
  provincias?: { name: string };
  cantones?: { name: string };
  archived_by_client?: boolean;
  for_someone_else?: boolean;
  beneficiary_name?: string | null;
  beneficiary_dob?: string | null;
  beneficiary_is_minor?: boolean;
};

;

// ONE shared status→colour mapping (sprint 440), identical to the pro side so a
// UN color por significado, no un color por estado: azul de marca = está vivo
// ahora; gris = pasó o está en pausa; rojo = SOLO lo que salió mal (cancelado,
// no seleccionado). Un empleo cerrado suele ser el final feliz — pintarlo de
// rojo lo hacía leer como error, y con todo de colores el color deja de decir.
const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default" | "muted"> = {
  pending: "default",
  confirmed: "default",
  in_progress: "default",
  awaiting_confirmation: "default",
  completed: "muted",
  cancelled: "error",
  rescheduled: "muted",
};


function formatBookingDate(b: Booking, dateLocale: string) {
  return formatBookingWhen(b.scheduled_date, b.scheduled_time, dateLocale, true) ?? b.preferred_date_text ?? null;
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

// Silueta única de las acciones de tarjeta (Reservas y Solicitudes): la misma
// píldora de 44px/13px del botón "Enviar mensaje" del perfil profesional.
// En el teléfono los botones llenan la fila; en escritorio la tarjeta mide 800px y
// un botón de ese ancho se ve desproporcionado: quedan a su tamaño, alineados a la izquierda.
// En pantallas de 390px para abajo, dos acciones y el menú comparten renglón y
// cada botón se queda con media tarjeta: ahí el ícono le robaba al rótulo lo
// justo para cortarlo ("Enviar mensa…"). El rótulo dice lo que hace; el ícono
// es adorno, así que es el que cede.
const actionButtonClass = "h-11 w-auto shrink-0 grow whitespace-nowrap rounded-full px-4 text-[13px] font-bold max-[389px]:px-3 max-[389px]:[&>svg]:hidden lg:grow-0 lg:min-w-[11rem]";

export function ClientActivity({ section, onCount }: { section: ClientActivitySection; onCount?: (total: number) => void }) {
  const { user } = useAuth();
  const t = useTranslations("clientActivity");
  const tSub = useTranslations("proPanel.subtitles");
  const tEtapas = useTranslations("statusTabs");
  // Ver la nota en booking-requests: el grupo de solicitudes incluye citas que
  // todavía no han pasado, así que "en curso" no las describe.
  const etapaSolicitudLabel = (id: string) => tEtapas(id === "en_curso" ? "solicitudes_activas" : id);
  const locale = useLocale();
  const router = useRouter();
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
  // El conteo sube al cambiador de «Mis publicaciones»: tiene que estar arriba
  // de cualquier retorno temprano, o el orden de los hooks cambia entre pintados.
  useEffect(() => { onCount?.(projects.length); }, [projects.length, onCount]);
  const loading = section === "bookings" ? bookingsResource.loading : section === "projects" ? projectsResource.loading : false;
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string; bookingId?: string; projectId?: string; initialReview?: { rating?: number | null; comment?: string | null } | null } | null>(null);
  const [myReviews, setMyReviews] = useState<{ professional_id: string; booking_id?: string | null; project_id?: string | null; rating: number; comment?: string | null }[]>([]);
  // One unified filter set (sprint 430): Activas · Finalizadas · Canceladas.
  const [bookingFilter, setBookingFilter] = useState("en_curso");
  const [projectFilter, setProjectFilter] = useState("activas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  // Solicitudes is now a collapsible accordion too (sprint 440) — same card language
  // as the professional Solicitudes / Proyectos sections and Mis proyectos.
  const [expandedBooking, setExpandedBooking] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  // Corregir lo que se pidió, desde el panel: es donde el cliente llega a ver
  // sus proyectos, igual que edita sus empleos y sus promociones desde el suyo.
  const [editandoProyecto, setEditandoProyecto] = useState<Project | null>(null);
  const [duplicandoProyecto, setDuplicandoProyecto] = useState<Project | null>(null);
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
  // do not free a calendar slot, but the professional should still be warned.
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

  const refreshSoon = useCallback(() => {
    if (section === "saved" || document.visibilityState !== "visible") return;
    if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
    const elapsed = Date.now() - lastSilentRefreshRef.current;
    const delay = elapsed < 1600 ? 1600 - elapsed : 700;
    refreshTimerRef.current = window.setTimeout(() => {
      lastSilentRefreshRef.current = Date.now();
      void fetchSection();
    }, delay);
  }, [fetchSection, section]);

  // Las cotizaciones se piden junto con la lista, no al abrir cada tarjeta:
  // así el bloque de cotización ya está cuando la tarjeta se despliega.
  useEffect(() => { cargarCotizaciones(); }, []);

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
      window.setTimeout(() => { noInsistirArriba(); return document.getElementById(`booking-${bookingId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 80);
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
      setProjectFilter(proyectoPublicacionBucket(project.status));
      setExpandedProject(projectId);
      window.setTimeout(() => { noInsistirArriba(); return document.getElementById(`project-${projectId}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); }, 80);
    }, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSection, projects, searchParams, section]);

  useEffect(() => {
    if (section !== "projects") return;
    const openPublish = () => setShowPublish(true);
    // El formulario puede abrirse fuera de esta sección (desde el inicio): al
    // publicar avisa por este evento para que la lista traiga la nueva solicitud.
    const alPublicar = () => { void refreshProjectRows(); };
    window.addEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
    window.addEventListener("contratacr:projects-changed", alPublicar);
    return () => {
      window.removeEventListener(OPEN_PUBLISH_PROJECT_EVENT, openPublish);
      window.removeEventListener("contratacr:projects-changed", alPublicar);
    };
  }, [section]);

  // `?openPublish=1` lo atiende el PANEL, no esta sección. Las dos lo leían y
  // cada una abría su formulario: quedaban dos ventanas idénticas una encima de
  // la otra, y la flecha que se tocaba era la de arriba —la del panel—, que no
  // sabía de dónde venía la persona.

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
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status } : p)));
    refreshProjects();
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

  // "Ya lo resolví": cierra la solicitud y, si eligió a alguien de los que
  // respondieron, lo deja registrado para la reseña.

  // Elegir con quién sigue, sin cerrar la solicitud: el profesional queda
  // habilitado para cotizar y coordinar, y la solicitud se cierra después con
  // "Marcar como resuelta".

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

  if (section === "saved") {
    return <SavedProfessionalsTab />;
  }

  if (loading) {
    const currentItems = section === "bookings" ? bookings : projects;
    return <PanelListSkeleton rows={3} withTabs />;
  }

  const bookingCounts = bucketCounts(bookings.map((b) => solicitudBucket(b.status, b.scheduled_date)));
  const projectCounts = bucketCounts(projects.map((p) => proyectoPublicacionBucket(p.status)));
  // Las dos etapas siempre visibles (con su 0 si hace falta), igual que en Reservas
  // recibidas: la pestaña que el cliente elige manda aunque esté vacía —antes
  // saltaba sola a la otra— y la vista vacía explica qué va a aparecer ahí.
  const bookingTabs = SOLICITUD_TABS;
  const effectiveBookingFilter = bookingTabs.some((tab) => tab.id === bookingFilter)
    ? bookingFilter : (bookingTabs[0]?.id ?? bookingFilter);
  // Las MISMAS dos etapas que Empleos y Promociones: está a la vista o no.
  // Las tres de antes —Activos, Finalizados, Cancelados— eran de cuando el
  // proyecto recibía propuestas dentro del app y había un desenlace que seguir.
  const projectTabs = PUBLICACION_ESTADO_TABS;
  const effectiveProjectFilter = projectTabs.some((tab) => tab.id === projectFilter)
    ? projectFilter : (projectTabs[0]?.id ?? projectFilter);
  // Con pocos elementos no se dibujan etapas (ver `sinFiltros`), así que la
  // lista se muestra ENTERA: si no, el filtro escondido dejaría afuera lo
  // terminado sin que nada lo explique.
  const filteredBookings = sinFiltros(bookings.length)
    ? ordenarCitas(bookings, "activas")
    : ordenarCitas(bookings.filter((b) => solicitudMatches(effectiveBookingFilter, b.status, b.scheduled_date)), effectiveBookingFilter === "finalizadas" ? "finalizadas" : "activas");
  // Mis proyectos SIEMPRE se filtra por etapa, tenga 2 o 200. La regla de
  // «pocos elementos, sin filtros» sirve donde las etapas son un detalle, pero
  // aquí separan lo que sigue esperando respuesta de lo que ya se resolvió, y
  // esconderlas tenía una consecuencia fea: al tocar «Marcar como finalizado»
  // el proyecto se quedaba en la misma lista, igualito, y parecía que el botón
  // no hacía nada.
  const filteredProjects = projects.filter((p) => proyectoPublicacionBucket(p.status) === effectiveProjectFilter);
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
              {bookingTabs.length > 0 && (
                <StatusFilterTabs tabs={bookingTabs} value={effectiveBookingFilter} onChange={setBookingFilter} labelFor={etapaSolicitudLabel} counts={bookingCounts} totalElementos={bookings.length} />
              )}
              {filteredBookings.length === 0 ? (
                <PanelFilterEmpty
                  icon={effectiveBookingFilter === "finalizadas" ? CheckCircle2 : CalendarClock}
                  title={effectiveBookingFilter === "finalizadas" ? t("bDoneEmpty") : t("bActiveEmpty")}
                  description={effectiveBookingFilter === "finalizadas" ? t("bDoneEmptySub") : t("bActiveEmptySub")}
                  action={effectiveBookingFilter === "finalizadas" ? undefined : (
                    <Button asChild variant="outline"><Link href="/buscar">{t("searchPros")}</Link></Button>
                  )}
                />
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
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] ccr-caja-icono-plana">
                            <CalendarCheck className="h-[18px] w-[18px]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              {/* El hijo flexible es el contenedor; el enlace se queda
                                   del tamaño del nombre para que el subrayado y el área
                                   de clic no lleguen hasta el borde de la tarjeta. */}
                              <div className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">
                                {b.professionals?.slug ? (
                                  <Link
                                    href={`/profesionales/${b.professionals.slug}?from=${encodeURIComponent("/dashboard/profesional?tab=sent_bookings")}`}
                                    onClick={(e) => { e.stopPropagation(); openInNewTabOnDesktop(e); }}
                                    className="hover:text-[#009FD9] hover:underline"
                                  >
                                    {b.professionals?.profiles?.full_name ?? t("professional")}
                                  </Link>
                                ) : (
                                  b.professionals?.profiles?.full_name ?? t("professional")
                                )}
                              </div>
                              {(b.status === "rescheduled" || (b.status === "cancelled" && effectiveBookingFilter !== "canceladas")) && (
                                <Badge variant={STATUS_VARIANT[b.status]} className="shrink-0 text-[11px] font-semibold">{t(`bStatus.${b.status}`)}</Badge>
                              )}
                            </div>
                            {/* Appointment date with a grey calendar icon (no "Fecha:" label). */}
                            {/* Sin las palabras «Fecha:» y «Servicio:»: el
                                calendario y la llave ya lo dicen, y esos 60 px
                                eran los que le faltaban a la fecha para caber
                                entera. Si aun así no alcanza, el corte cae entre
                                la fecha y la hora, nunca dentro de una palabra. */}
                            {formatBookingDate(b, dateLocale) && (
                              <span className="mt-2 inline-flex w-full max-w-full items-start gap-2 text-[13px] text-[#374151]">
                                <CalendarClock className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#68778d]" />
                                <span className="min-w-0 flex-1 text-[#374151]">
                                  {formatBookingDate(b, dateLocale)!.split(" · ").map((parte, indice, partes) => (
                                    <Fragment key={parte}>
                                      <span className="whitespace-nowrap">{parte}{indice < partes.length - 1 ? " ·" : ""}</span>
                                      {indice < partes.length - 1 ? <wbr /> : null}{" "}
                                    </Fragment>
                                  ))}
                                </span>
                              </span>
                            )}
                            {/* The service the request was for (grey wrench). */}
                            {bookingServiceLabel(b) && (
                              <p className="mt-2 flex min-w-0 items-start gap-2 text-[13px] text-[#374151]">
                                <Wrench className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#68778d]" />
                                <span className="min-w-0 flex-1 line-clamp-2 text-[#374151]">{bookingServiceLabel(b)}</span>
                              </p>
                            )}
                            {/* For someone else — a quiet at-a-glance hint. */}
                          </div>
                          <ExpandToggle open={expandedBooking === b.id} />
                        </div>

                        {expandedBooking === b.id && (
                          <div className="rounded-b-2xl border-t border-[#eef2f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5 flex flex-col gap-3.5">
                            {/* The header already identifies the professional; expanded details stay flat. */}
                            {b.for_someone_else && (() => {
                              const beneAge = ageLabel(b.beneficiary_dob);
                              return (
                                <div className="flex items-start gap-2.5">
                                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                                  <div className="min-w-0">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68778d]">{t("apptForLabel")}</p>
                                    <p className="mt-0.5 text-[13px] font-semibold text-[#162543] [overflow-wrap:anywhere]">{b.beneficiary_name || t("otherPerson")}</p>
                                    {beneAge && (
                                      <p className="mt-0.5 text-[12px]"><span className="text-[#68778d]">{t("fieldAge")}</span> <span className="text-[#374151]">{beneAge}</span></p>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {b.service_description && (
                              <div className="flex items-start gap-2.5">
                                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68778d]">{t("descriptionField")}</p>
                                  <ExpandableText text={b.service_description} lines={5} className="mt-0.5 text-sm leading-relaxed text-[#4b5563]" />
                                </div>
                              </div>
                            )}
                            {/* Pro cancelled → show why (so the client knows + can re-book). */}
                            {b.status === "cancelled" && b.cancelled_by === "professional" && (
                              <div className="rounded-lg bg-[#fef2f2] border border-[#fee2e2] px-2.5 py-1.5">
                                <p className="text-[11px] font-semibold text-[#b91c1c]">{t("proCancelled")}</p>
                                {b.cancel_reason && (
                                  <p className="mt-0.5 text-xs"><span className="text-[#68778d]">{t("fieldReason")}</span> <span className="text-[#374151]">{b.cancel_reason}</span></p>
                                )}
                              </div>
                            )}

                            <QuoteBlock bookingId={b.id} role="client" professionalName={b.professionals?.profiles?.full_name ?? null} />
                            {/* Actions: Reprogramar is a direct positive action; Cancelar stays focused
                                on cancellation only. */}
                            {(() => {
                              const isActiveB = ["pending", "confirmed", "in_progress"].includes(b.status);
                              const canContactAfterProCancel = b.status === "cancelled" && b.cancelled_by === "professional";
                              const canMessage = b.status === "cancelled" ? canContactAfterProCancel : true;
                              // Una reserva con fecha se cierra sola cuando su día pasa (la API lo
                              // hace al listar). La que no tiene fecha la cierra el cliente con
                              // "Ya me atendieron", y de una vez puede dejar la reseña.
                              const fechaYaPaso = isActiveB && solicitudBucket(b.status, b.scheduled_date) === "finalizadas";
                              const sinFecha = isActiveB && !b.scheduled_date;
                              const terminada = b.status === "completed";
                              let primary: ReactNode = null;
                              if (sinFecha || fechaYaPaso) {
                                primary = <Button size="sm" variant={canMessage && b.professional_id ? "secondary" : "default"} className={actionButtonClass} onClick={() => confirmBookingDone(b.id)}>{t("bookingHappened")}</Button>;
                              }
                              const reviewAction = terminada ? (
                                <Button size="sm" variant="secondary" className={actionButtonClass} onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id, initialReview: rev ? { rating: rev.rating, comment: rev.comment } : null })}>{rev ? t("editReview") : t("leaveReview")}</Button>
                              ) : null;
                              // Escribir es SIEMPRE la acción azul, en toda la app: el mismo
                              // botón tiene que verse igual en cada tarjeta. Y como solo puede
                              // haber un botón lleno por tarjeta, el resto pasa a blanco
                              // cuando este está presente.
                              const resenaPendiente = terminada && !rev;
                              const messageAction = canMessage && b.professional_id ? (
                                <DirectChatLauncher professionalId={b.professional_id} professionalName={b.professionals?.profiles?.full_name || t("professional")} bookingId={b.id} contextTitle={b.service_description} buttonLabel={t("contact")} analyticsSource="booking" tone="primary" className={actionButtonClass} />
                              ) : null;
                              const hayMensaje = !!messageAction;
                              // Lo frecuente se ve; lo excepcional vive en el menú, igual que en
                              // las tarjetas del profesional. Antes esta tarjeta mostraba las cinco
                              // acciones en línea y ocupaba tres renglones.
                              const menu: CardAction[] = [];
                              if (isActiveB) {
                                menu.push({
                                  label: t("reschedule"),
                                  onClick: () => {
                                    setReschedule({
                                      id: b.id,
                                      professionalId: b.professional_id,
                                      when: formatBookingDate(b, dateLocale),
                                      locationId: b.slot_location_id ?? null,
                                      locationLabel: b.slot_location_label ?? null,
                                    });
                                    setCancelTarget(null);
                                    setCancelNote("");
                                  },
                                });
                                menu.push({ label: t("cancel"), onClick: () => openCancelBooking(b.id), destructive: true });
                              }
                              if (b.status === "cancelled") {
                                menu.push({ label: t("archive"), onClick: () => archiveBooking(b.id), destructive: true });
                              }
                              menu.push({ label: t("reportTitle"), onClick: () => setReportProFor(b.id), destructive: true });
                              // Terminada o caída, lo que el cliente puede querer es repetir con la
                              // misma persona. Antes la tarjeta no ofrecía ninguna salida hacia eso.
                              const puedeRecontratar = (b.status === "completed" || b.status === "cancelled") && b.professionals?.slug;
                              // Va al mismo perfil que el nombre de la tarjeta, que ya es
                              // un enlace: como botón repetía un camino que ya existe y le
                              // robaba sitio a la reseña. Vive en el menú, con su nombre.
                              if (puedeRecontratar) {
                                const perfilHref = `/profesionales/${b.professionals?.slug}?from=${encodeURIComponent("/dashboard/profesional?tab=sent_bookings")}`;
                                menu.push({
                                  label: t("bookAgain"),
                                  onClick: () => {
                                    if (window.matchMedia("(min-width: 1024px)").matches) {
                                      window.open(`/${locale}${perfilHref}`, "_blank", "noopener,noreferrer");
                                      return;
                                    }
                                    router.push(perfilHref);
                                  },
                                });
                              }
                              // En una cita terminada lo que toca es la reseña, no escribirle:
                              // esa es la acción azul mientras no haya reseña. Escribir y volver
                              // a contratar bajan a la segunda fila.
                              const resenaPrimero = resenaPendiente ? (
                                <Button size="sm" variant={hayMensaje ? "secondary" : "default"} className={actionButtonClass} onClick={() => setReviewModal({ professionalId: b.professional_id, professionalName: b.professionals?.profiles?.full_name ?? t("professional"), bookingId: b.id, initialReview: null })}>{t("leaveReview")}</Button>
                              ) : null;
                              // Si no hay acción que mande, la primera secundaria sube a la
                              // fila del menú: un renglón con solo el "…" y un hueco al lado
                              // era lo que se veía en una cita con fecha por venir.
                              const candidatas = [
                                messageAction,
                                terminada && rev ? reviewAction : null,
                              ].filter(Boolean);
                              const principal = primary ?? resenaPrimero ?? candidatas.shift() ?? null;
                              // Dos acciones y el menú caben en un renglón hasta 320 px
                              // (medido): partirlas en dos filas alargaba la tarjeta sin
                              // necesidad. Con tres o más, las secundarias bajan a la rejilla.
                              const cabenEnUnaFila = candidatas.length === 1;
                              // Una sola fila alineada a la derecha, con la acción que manda
                              // pegada al menú ⋮. Repartirlas en dos filas —la principal
                              // arriba a la derecha y el resto cruzando la tarjeta entera—
                              // hacía que las secundarias se vieran más importantes que ella.
                              return (
                                // La acción que manda y el menú ⋮ van SIEMPRE juntos en la
                                // última fila. Con una rejilla suelta de dos columnas, un
                                // número par de botones empujaba el ⋮ a una fila para él
                                // solo, flotando a media tarjeta. Las secundarias van en la
                                // rejilla —y si queda una impar, ocupa el ancho entero para
                                // no dejar un hueco—. De 640 px en adelante `sm:contents`
                                // disuelve las envolturas y todo vuelve a ser una sola fila
                                // alineada a la derecha.
                                <div className="ccr-acciones-tarjeta flex flex-col gap-2 border-t border-[#eef2f6] pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                  {candidatas.length > 0 && !cabenEnUnaFila && (
                                    <div className="grid grid-cols-2 gap-2 [&>*]:w-full [&>*:last-child:nth-child(odd)]:col-span-2 sm:contents sm:[&>*]:w-auto">
                                      {candidatas}
                                    </div>
                                  )}
                                  {/* justify-end: sin ninguna acción —una cita cancelada, por
                                      ejemplo— el ⋮ era el único hijo de la fila y se quedaba
                                      pegado a la izquierda. El menú va SIEMPRE a la derecha. */}
                                  <div className="flex items-center justify-end gap-2 sm:contents">
                                    {cabenEnUnaFila && candidatas.map((accion, i) => (
                                      <div key={i} className="min-w-0 flex-1 [&>*]:w-full sm:contents sm:[&>*]:w-auto">
                                        {accion}
                                      </div>
                                    ))}
                                    {principal && (
                                      <div className="min-w-0 flex-1 [&>*]:w-full sm:contents sm:[&>*]:w-auto">
                                        {principal}
                                      </div>
                                    )}
                                    {menu.length > 0 && (
                                      <div className="shrink-0">
                                        <CardActionsMenu actions={menu} label={t("actions")} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                            {cancelTarget === b.id && (
                              <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-3">
                                <p className="text-sm font-semibold text-[#162543]">{t("cancelTitle")}</p>
                                <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">{t("cancelBody")}</p>
                                <label className="mt-3 block text-xs font-medium text-[#374151]">{t("cancelNoteLabel")}</label>
                                <textarea
                                  value={cancelNote}
                                  onChange={(e) => setCancelNote(e.target.value)}
                                  rows={2}
                                  maxLength={300}
                                  placeholder={t("cancelNotePlaceholder")}
                                  className="mt-1 w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#162543] placeholder:text-[#68778d] [overflow-wrap:anywhere] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
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

      {/* SOLICITUDES PUBLICADAS — lo que el cliente pidió y quién le respondió. */}
      {section === "projects" && (
        <div>
          {/* Crear va ARRIBA, con el subtítulo a la izquierda: el filtro tiene que
              quedar pegado a la lista que filtra. En medio, el botón cortaba esa
              relación. */}
          <SectionHeadline className="mb-3.5" subtitulo={tSub("sent_projects")}>
            {projects.length > 0 && (
              <button
                type="button"
                onClick={() => setShowPublish(true)}
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#009FD9] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#0089bb] sm:w-auto sm:px-6 max-sm:[&>svg]:hidden"
              >
                <Plus className="h-4 w-4" />
                {t("publishProject")}
              </button>
            )}
          </SectionHeadline>
          {projects.length === 0 ? (
            <PanelEmptyState
              icon={FolderOpen}
              title={t("pEmpty")}
              description={t("pEmptySub")}
              action={<Button size="crear" onClick={() => setShowPublish(true)}>{t("publishProject")}</Button>}
            />
          ) : (
            <div className="ccr-native-safe-list-end flex flex-col gap-3.5">
              <StatusFilterTabs
                tabs={PUBLICACION_ESTADO_TABS}
                value={effectiveProjectFilter}
                onChange={setProjectFilter}
                counts={projectCounts}
                labelFor={(id) => tEtapas(etapaEnMasculino(id))}
              />
              {filteredProjects.length === 0 && (
                <PanelFilterEmpty
                  icon={effectiveProjectFilter === "cerradas" ? CheckCircle2 : FolderOpen}
                  title={effectiveProjectFilter === "cerradas" ? t("pDoneEmpty") : t("pActiveEmpty")}
                  description={effectiveProjectFilter === "cerradas" ? t("pDoneEmptySub") : t("pActiveEmptySub")}
                />
              )}
              {filteredProjects.map((project) => {
                const isExpanded = expandedProject === project.id;
                const zone = [project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ");
                const isActive = project.status !== "completed" && project.status !== "cancelled";
                // La pestaña ya dice en qué etapa está: repetirlo en la tarjeta
                // gastaba el único renglón que hay para algo útil.
                // Con dos pestañas, «Inactivos» no dice CUÁL de los dos
                // finales fue: eso lo escribe siempre la tarjeta, igual que
                // Promociones escribe Pausada / Vencida / Agotada.
                // «Sin propuestas todavía» se fue. Desde que se responde por
                // WhatsApp no entra ninguna propuesta nueva, así que ese renglón
                // decía —para siempre, en todos los proyectos— que nadie había
                // contestado: un reclamo permanente por algo que ya no puede
                // pasar. En su lugar va el servicio, que es lo que identifica el
                // proyecto, igual que en el tablero público. El conteo se
                // conserva para los proyectos viejos que sí recibieron
                // propuestas, porque ahí sí hay algo que abrir.
                const servicio = project.categories?.name ?? null;
                const headline = project.status === "completed" ? t("projResolved")
                  : project.status === "cancelled" ? t("projCancelled")
                    : servicio;
                const headlineClass = project.status === "cancelled" ? "text-[#b91c1c]" : "text-[#6b7280]";

                return (
                  <Card id={`project-${project.id}`} key={project.id} className={cn("rounded-2xl border-[#e5e7eb] bg-white shadow-sm transition-all", isExpanded && "shadow-md ring-1 ring-[#cfe9f5]")}>
                    <button
                      type="button"
                      onClick={async () => {
                        setExpandedProject(isExpanded ? null : project.id);
                      }}
                      aria-expanded={isExpanded}
                      className={cn("group w-full p-4 text-left transition-colors hover:bg-[#f9fbfd] sm:p-5", isExpanded ? "rounded-t-2xl bg-[#fbfdff]" : "rounded-2xl")}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Un icono por tipo de tarjeta, no por estado: que hay
                            propuestas ya lo dice el texto de al lado, y cambiarlo
                            hacía que dos tarjetas de la misma lista no se
                            reconocieran como lo mismo. El color sí marca el aviso. */}
                        <div className="relative shrink-0">
                          {/* La MISMA caja que Mis publicaciones y Favoritos: las
                              tres listas del panel se ven seguidas y cada una
                              traía su propio recuadro —una plana con borde, otra
                              un icono suelto sin fondo y Empleos ninguna—, así que
                              la misma lista cambiaba de cara al cambiar de
                              sección. El aviso de novedad lo sigue dando el punto. */}
                          <div className="grid h-[52px] w-[52px] place-items-center rounded-xl ccr-caja-icono-plana">
                            <ClipboardList className="h-5 w-5" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-base">{project.title}</h3>
                          {headline && <p className={cn("mt-1 text-[13px] font-semibold", headlineClass)}>{headline}</p>}
                          <p className="mt-0.5 text-[12px] text-[#68778d]">{formatRelativeOrDate(project.created_at, locale)}{zone ? ` · ${zone}` : ""}</p>
                        </div>
                        <ExpandToggle open={isExpanded} />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="rounded-b-2xl border-t border-[#eef2f6] bg-gradient-to-b from-[#fcfdff] to-white px-4 pb-5 pt-4 sm:px-5">
                        <div className="flex flex-col gap-4">
                          {project.description && (
                            <div className="flex items-start gap-2.5">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#68778d]" />
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#68778d]">{t("descriptionField")}</p>
                                <ExpandableText text={project.description} lines={5} className="mt-0.5 text-[13px] leading-relaxed text-[#4b5563]" />
                              </div>
                            </div>
                          )}

                          <QuoteBlock projectId={project.id} role="client" />
                          {/* Respuestas: quién escribió, qué dijo, y WhatsApp directo. */}
                          {/* SIN LA LISTA DE PROPUESTAS. Desde que se contesta
                              por WhatsApp no entra ninguna propuesta nueva, así
                              que este bloque solo podía salir en proyectos
                              viejos y hacía que la misma lista se viera de dos
                              maneras según la edad del proyecto. A quien hizo el
                              trabajo se le sigue señalando al cerrar el
                              proyecto, que es donde esa pregunta tiene
                              sentido. */}

                          {/* Acciones con la misma silueta que Citas: la que avanza en turquesa,
                              lo destructivo en el menú ⋮.
                              La fila siempre tiene al menos «Ver proyecto». */}
                          {(() => {
                            // La fila YA NO SE CALLA: «Ver proyecto» está
                            // siempre, así que siempre hay algo que ofrecer.
                            // Antes, un proyecto finalizado sin profesional
                            // elegido no tenía ninguna acción y la fila entera
                            // desaparecía —con ella se iba el único camino para
                            // abrir la ficha, y por eso «Ver proyecto» no salía
                            // en los inactivos—.
                            return (
                          <div className="ccr-acciones-tarjeta flex items-start gap-2 border-t border-[#eef2f6] pt-4 sm:justify-end">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:flex-none sm:justify-end">
                              {/* VER EL PROYECTO, COMO EN EMPLEOS Y PROMOCIONES.
                                  Las tres listas del panel son lo mismo —algo
                                  que publiqué— y las otras dos abren su ficha
                                  desde la tarjeta; esta no tenía por dónde. Va
                                  primero, que es el orden de las otras dos:
                                  primero mirar, después actuar. */}
                              <Link
                                href={`/proyectos/${project.id}?from=panel`}
                                className={cn(actionButtonClass, "inline-flex items-center justify-center border border-[#d7e1ea] bg-white text-[#162543] transition hover:border-[#b9c8d6] hover:bg-[#f6f9fb]")}
                              >
                                {t("viewProject")}
                              </Link>
                              {/* Editar, aquí mismo: en Empleos y Promociones el
                                  panel edita sin salir, y un proyecto obligaba a
                                  cancelar y volver a publicar. En AZUL LLENO,
                                  como en las otras dos: «Ver» solo mira, el
                                  «···» guarda lo de cambiar de estado, y editar
                                  es a lo que se viene al abrir algo propio. */}
                              {/* UN PROYECTO CERRADO NO SE EDITA. Lo que ya se
                                  hizo —o se cancelo— no cambia de enunciado; y
                                  dejarlo ahi era el tercer boton de la fila
                                  junto a «Ver» y «Dejar resena», justo lo que
                                  se quito en las otras secciones. */}
                              {isActive && (
                                <button
                                  type="button"
                                  onClick={() => setEditandoProyecto(project)}
                                  className={cn(actionButtonClass, "inline-flex items-center justify-center bg-[#009FD9] text-white transition-colors hover:bg-[#0089bb]")}
                                >
                                  {t("editProject")}
                                </button>
                              )}
                              {/* LO QUE PIDE ALGO AL CLIENTE SE QUEDA SUELTO;
                                  LO QUE CAMBIA EL ESTADO SE VA AL «···».
                                  «Marcar como finalizado», «Volver a publicar» y
                                  «Cancelar» son la misma familia que «Pausar»,
                                  «Cerrar vacante» y «Marcar como vencida», que en
                                  Empleos y Promociones ya viven en el menú. Aquí
                                  estaban sueltas y en turquesa, así que una fila
                                  de un proyecto tenía hasta cuatro botones y las
                                  otras dos secciones tres.

                                  LA RESEÑA NO SE DEJA DESDE UN PROYECTO. Se deja
                                  en la ficha del profesional, con cuenta, y ahí
                                  el formulario está abierto arriba de la lista:
                                  esa es la única puerta. Aquí había una segunda
                                  —y una tercera, que se abría sola al marcar el
                                  proyecto como finalizado— para escribir
                                  exactamente lo mismo. */}
                            </div>
                            {/* TODA FILA TIENE SU «···», tambien las inactivas:
                                era la unica de las tres secciones donde una
                                fila cerrada se quedaba sin ninguna salida
                                —Empleos y Promociones siempre lo pintan—. Lo
                                que lleva adentro NO es igual en los tres
                                estados: el cancelado se vuelve a publicar tal
                                cual y se puede borrar, porque no tiene
                                historia; el terminado no, que reabrirlo
                                borraria quien lo hizo y dejaria la resena
                                colgando, asi que se copia en uno nuevo. */}
                            <CardActionsMenu
                              label={t("actions")}
                              actions={isActive
                                ? [
                                    { label: t("cancelProject"), onClick: () => openCancelProject(project.id), destructive: true },
                                  ]
                                : project.status === "cancelled"
                                  ? [
                                      { label: t("reopenProject"), onClick: () => void updateProjectStatus(project.id, "open") },
                                      { label: t("delete"), onClick: () => setDeleteTarget(project.id), destructive: true },
                                    ]
                                  : [
                                      { label: t("publishLikeThis"), onClick: () => setDuplicandoProyecto(project) },
                                    ]}
                            />
                          </div>
                            );
                          })()}

                          {cancelProjectTarget === project.id && (
                            <div className="rounded-xl border border-red-100 bg-red-50/60 p-3.5">
                              <p className="text-sm font-semibold text-[#162543]">{t("cancelProjectTitle")}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-[#6b7280]">{t("cancelProjectBody")}</p>
                              <div className="ccr-grupo-botones mt-3 flex flex-wrap justify-end gap-2">
                                <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setCancelProjectTarget(null)} disabled={cancellingProject}>{t("cancelBack")}</Button>
                                <Button size="sm" className="rounded-lg bg-red-600 hover:bg-red-700" onClick={() => confirmCancelProject(project.id)} disabled={cancellingProject} loading={cancellingProject}>{t("cancelProjectConfirm")}</Button>
                              </div>
                            </div>
                          )}
                        </div>
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
      {editandoProyecto && (
        <PublishProjectModal
          editar={{
            id: editandoProyecto.id,
            categoryId: editandoProyecto.category_id ?? "",
            description: editandoProyecto.description ?? "",
            provinciaId: editandoProyecto.provincia_id ?? "",
            cantonId: editandoProyecto.canton_id ?? "",
          }}
          onClose={() => setEditandoProyecto(null)}
          onSuccess={() => refreshProjectRows({})}
        />
      )}
      {duplicandoProyecto && (
        <PublishProjectModal
          duplicar={{
            id: duplicandoProyecto.id,
            categoryId: duplicandoProyecto.category_id ?? "",
            description: duplicandoProyecto.description ?? "",
            provinciaId: duplicandoProyecto.provincia_id ?? "",
            cantonId: duplicandoProyecto.canton_id ?? "",
          }}
          onClose={() => setDuplicandoProyecto(null)}
          onSuccess={() => { setDuplicandoProyecto(null); refreshProjectRows({ esperandoNuevo: true }); }}
        />
      )}
      {showPublish && (
        <PublishProjectModal onClose={() => setShowPublish(false)} onSuccess={() => refreshProjectRows({ esperandoNuevo: true })} />
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

