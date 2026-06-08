"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays, Bookmark, LogOut, Star, Bell, User, FolderOpen,
  CheckCircle2, Clock, XCircle, ChevronDown, ChevronUp,
  Coins, MapPin, Send, Plus, Briefcase, Trash2, Flag,
} from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter, Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { getInitials, getWhatsAppLink } from "@/lib/utils";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PhoneInput } from "@/components/ui/phone-input";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { LeaveReviewModal } from "@/components/professionals/leave-review-modal";
import { SavedProfessionalsTab } from "@/components/professionals/saved-professionals-tab";
import type { BookingStatus } from "@/types";

type Tab = "bookings" | "projects" | "saved" | "notifications" | "profile";

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
    categories: { id: string; icon: string; name: string };
  };
};

type Project = {
  id: string;
  title: string;
  description: string;
  status: string;
  created_at: string;
  categories?: { name: string; icon: string };
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
    categories: { name: string; icon: string };
  };
};


const STATUS_ICON: Record<BookingStatus, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5" />,
  confirmed: <CheckCircle2 className="h-3.5 w-3.5" />,
  in_progress: <Clock className="h-3.5 w-3.5" />,
  awaiting_confirmation: <Clock className="h-3.5 w-3.5" />,
  completed: <CheckCircle2 className="h-3.5 w-3.5" />,
  cancelled: <XCircle className="h-3.5 w-3.5" />,
  rescheduled: <Clock className="h-3.5 w-3.5" />,
};

const STATUS_VARIANT: Record<BookingStatus, "warning" | "success" | "error" | "default"> = {
  pending: "warning",
  confirmed: "success",
  in_progress: "success",
  awaiting_confirmation: "warning",
  completed: "default",
  cancelled: "error",
  rescheduled: "warning",
};

const STATUS_LABEL: Record<BookingStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  in_progress: "En progreso",
  awaiting_confirmation: "Confirmá la finalización",
  completed: "Finalizada",
  cancelled: "Cancelada",
  rescheduled: "Reprogramada",
};

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) ?? "bookings";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [profileData, setProfileData] = useState<{ full_name: string; phone?: string; avatar_url?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<{ professionalId: string; professionalName: string; bookingId?: string; projectId?: string } | null>(null);
  // The client's reviews, to mark which finished items are already reviewed (per-job).
  const [myReviews, setMyReviews] = useState<{ professional_id: string; booking_id?: string | null; project_id?: string | null; rating: number }[]>([]);
  const [bookingFilter, setBookingFilter] = useState<"todas" | "activas" | "finalizadas" | "canceladas">("todas");
  const [projectFilter, setProjectFilter] = useState<"todas" | "abiertos" | "encurso" | "finalizados" | "cancelados">("todas");
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [projectProposals, setProjectProposals] = useState<Record<string, Proposal[]>>({});
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [emailChangeMode, setEmailChangeMode] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailChangeSent, setEmailChangeSent] = useState(false);
  const [emailChangeError, setEmailChangeError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // Always load profile on mount for header name/avatar
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("profiles")
      .select("full_name, phone, avatar_url")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfileData(data);
          setProfileAvatar(data.avatar_url ?? null);
          setProfileForm({ full_name: data.full_name ?? "", phone: data.phone ?? "" });
        }
      });
  }, [user]);

  const fetchTab = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    if (activeTab === "bookings") {
      const res = await fetch("/api/bookings?role=client");
      const { bookings } = await res.json();
      setBookings(bookings ?? []);
    } else if (activeTab === "projects") {
      const res = await fetch("/api/projects?role=client");
      const { projects } = await res.json();
      setProjects(projects ?? []);
    } else if (activeTab === "profile") {
      const supabase = createClient();
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url")
        .eq("id", user.id)
        .single();
      setProfileData(data);
      setProfileForm({ full_name: data?.full_name ?? "", phone: data?.phone ?? "" });
      setProfileAvatar(data?.avatar_url ?? null);
    }

    setLoading(false);
  }, [user, activeTab]);

  useEffect(() => {
    fetchTab();
  }, [fetchTab]);

  // Load the client's reviews so finished items can show "Ver/Editar reseña".
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

  // Unread count for notification badge
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact" })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [user]);

  function setTab(tab: Tab) {
    router.push(`/dashboard/cliente?tab=${tab}`);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    // Full page reload so auth state and navbar reset cleanly
    window.location.href = "/es";
  }

  async function cancelBooking(id: string) {
    const reason = window.prompt("¿Por qué querés cancelar? (se le avisa al profesional)") ?? "";
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "cancelled", cancelReason: reason.trim() || undefined }),
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "cancelled" } : b)));
  }

  // Client confirms the professional's "trabajo realizado" → finaliza la solicitud.
  async function confirmBookingDone(id: string) {
    await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: "completed" }),
    });
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "completed" } : b)));
  }

  // Two-way reputation: report a professional (no-show, service not performed).
  // No monetary penalty — payments are off-platform; this feeds reputation/moderation.
  async function reportProfessional(bookingId: string) {
    const reason = window.prompt("¿Qué pasó? (no se presentó / servicio no realizado / otro). Tu reporte ayuda a la moderación.");
    if (!reason || !reason.trim()) return;
    const res = await fetch("/api/report-professional", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, reason: reason.trim() }),
    });
    alert(res.ok ? "Gracias. Tu reporte fue enviado al equipo de moderación." : "No se pudo enviar el reporte.");
  }

  // Re-fetch projects from the server so the status badge always reflects truth
  // (incl. lazy 7-day auto-confirm and other-party changes).
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
    if (!res.ok) { alert("No se pudo actualizar el proyecto. Intentá de nuevo."); return; }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status } : p)));
    refreshProjects();
  }

  async function confirmProjectCompletion(projectId: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: projectId, action: "confirm" }),
    });
    if (!res.ok) { alert("No se pudo confirmar. Intentá de nuevo."); return; }
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "completed" } : p)));
    refreshProjects();
  }

  async function deleteProject(projectId: string) {
    if (!confirm("¿Eliminar este proyecto? Esta acción no se puede deshacer.")) return;
    const res = await fetch(`/api/projects?id=${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "No se pudo eliminar el proyecto. Intentá de nuevo.");
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

  // Review the professional who completed a FINALIZADO project. Finds the accepted
  // proposal's pro and opens the review modal.
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
      setReviewModal({ professionalId: pro.id, professionalName: pro.profiles?.full_name ?? "Profesional", projectId });
    } else {
      alert("No encontramos al profesional asignado para reseñar.");
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
      [projectId]: (prev[projectId] ?? []).map((p) =>
        p.id === proposalId ? { ...p, status: "accepted" } : p
      ),
    }));
    // The project moves to "En curso/Asignado" — reflect the new status immediately.
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
      [projectId]: (prev[projectId] ?? []).map((p) =>
        p.id === proposalId ? { ...p, status: "declined" } : p
      ),
    }));
  }

  // Revert an accepted/declined decision back to pending (client can change mind).
  async function revertProposal(proposalId: string, projectId: string) {
    await fetch("/api/proposals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: proposalId, status: "pending" }),
    });
    setProjectProposals((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).map((p) =>
        p.id === proposalId ? { ...p, status: "pending" } : p
      ),
    }));
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, status: "open" } : p)));
  }

  async function saveProfile() {
    if (!user) return;
    setProfileSaving(true);
    const supabase = createClient();
    await supabase.from("profiles").update({
      full_name: profileForm.full_name,
      phone: profileForm.phone || null,
    }).eq("id", user.id);
    setProfileSaving(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
    if (res.ok) {
      const { url } = await res.json();
      const supabase = createClient();
      // Update DB profile
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      // Sync to auth metadata so navbar avatar refreshes immediately
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setProfileAvatar(url);
    }
    setPhotoUploading(false);
  }

  async function sendEmailChange() {
    if (!newEmail.trim() || !user) return;
    setEmailChangeError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) { setEmailChangeError(error.message); return; }
    setEmailChangeSent(true);
    setEmailChangeMode(false);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
        </div>
      </div>
    );
  }

  // Detect OAuth accounts — email change is not allowed for them
  const oauthProvider = user?.app_metadata?.provider as string | undefined;
  const isOAuthAccount = oauthProvider === "google" || oauthProvider === "facebook" ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user?.identities ?? []).some((id: any) => id.provider !== "email");

  // Name: DB profile takes priority over auth metadata, then email prefix
  const displayName =
    profileData?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Cliente";

  // Avatar: profileAvatar (DB) → auth metadata → null
  const headerAvatar =
    profileAvatar ||
    (user?.user_metadata?.avatar_url as string) ||
    null;

  const TABS: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "bookings", icon: <CalendarDays className="h-4 w-4" />, label: "Solicitudes" },
    { key: "projects", icon: <FolderOpen className="h-4 w-4" />, label: "Proyectos" },
    { key: "saved", icon: <Bookmark className="h-4 w-4" />, label: "Guardados" },
    {
      key: "notifications",
      icon: (
        <div className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      ),
      label: "Notificaciones",
    },
    { key: "profile", icon: <User className="h-4 w-4" />, label: "Mi perfil" },
  ];

  const inputClass =
    "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  function formatBookingDate(b: Booking) {
    if (b.scheduled_date) {
      const [y, m, d] = b.scheduled_date.split("-").map(Number);
      const label = new Date(y, m - 1, d).toLocaleDateString("es-CR", {
        weekday: "short", day: "numeric", month: "short",
      });
      return b.scheduled_time ? `${label} · ${b.scheduled_time}` : label;
    }
    return b.preferred_date_text ?? null;
  }

  // Status filters (mini tabs) for solicitudes + proyectos.
  const bActive = ["pending", "confirmed", "in_progress", "awaiting_confirmation"];
  const filteredBookings = bookings.filter((b) => {
    if (bookingFilter === "activas") return bActive.includes(b.status);
    if (bookingFilter === "finalizadas") return b.status === "completed";
    if (bookingFilter === "canceladas") return b.status === "cancelled" || b.status === "rescheduled";
    return true;
  });
  const upcomingBookings = filteredBookings.filter((b) => bActive.includes(b.status));
  const pastBookings = filteredBookings.filter((b) => ["completed", "cancelled", "rescheduled"].includes(b.status));

  const filteredProjects = projects.filter((p) => {
    if (projectFilter === "abiertos") return p.status === "open";
    if (projectFilter === "encurso") return p.status === "in_progress" || p.status === "awaiting_confirmation";
    if (projectFilter === "finalizados") return p.status === "completed";
    if (projectFilter === "cancelados") return p.status === "cancelled";
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 shrink-0">
                {headerAvatar ? (
                  <img
                    src={headerAvatar}
                    alt="Foto de perfil"
                    className="h-11 w-11 rounded-full object-cover border-2 border-white shadow-sm"
                  />
                ) : (
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-[#009FD9] to-[#0077a8] flex items-center justify-center shadow-sm">
                    <span className="text-white font-bold text-sm">{getInitials(displayName)}</span>
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-lg font-bold text-[#111827]">
                  Hola, {displayName.split(" ")[0]} 👋
                </h1>
                <p className="text-xs text-[#9ca3af]">Panel del cliente</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-[#6b7280] hover:text-red-500">
              <LogOut className="h-4 w-4" />
              Salir
            </Button>
          </div>

          {/* Tab nav — scrollable on mobile */}
          <div className="flex gap-1 bg-[#f3f4f6] rounded-xl p-1 mb-6 overflow-x-auto">
            {TABS.map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0",
                  activeTab === key
                    ? "bg-white text-[#009FD9] shadow-sm"
                    : "text-[#6b7280] hover:text-[#374151]"
                )}
              >
                {icon}
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
            </div>
          ) : (
            <>
              {/* BOOKINGS TAB */}
              {activeTab === "bookings" && (
                <div className="space-y-6">
                  {bookings.length === 0 ? (
                    <div className="text-center py-16">
                      <CalendarDays className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
                      <p className="font-medium text-[#374151]">No tenés solicitudes todavía</p>
                      <p className="text-sm text-[#9ca3af] mt-1">Cuando solicités un servicio, aparecerá aquí.</p>
                      <Button className="mt-5" asChild>
                        <a href="/buscar">Buscar profesionales</a>
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-1.5 flex-wrap">
                        {([["todas", "Todas"], ["activas", "Activas"], ["finalizadas", "Finalizadas"], ["canceladas", "Canceladas"]] as const).map(([id, label]) => (
                          <button key={id} onClick={() => setBookingFilter(id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", bookingFilter === id ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]")}>{label}</button>
                        ))}
                      </div>
                      {upcomingBookings.length === 0 && pastBookings.length === 0 && (
                        <p className="text-sm text-[#9ca3af] text-center py-8">No hay solicitudes en esta vista.</p>
                      )}
                      {upcomingBookings.length > 0 && (
                        <div>
                          <h2 className="text-sm font-semibold text-[#374151] mb-3">Próximas</h2>
                          <div className="flex flex-col gap-3">
                            {upcomingBookings.map((b) => (
                              <Card key={b.id}>
                                <CardContent className="p-5">
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
                                              {b.professionals?.categories?.icon} {b.professionals?.profiles?.full_name ?? "Profesional"}
                                            </Link>
                                          ) : (
                                            <span className="text-sm font-semibold text-[#111827]">
                                              {b.professionals?.categories?.icon} {b.professionals?.profiles?.full_name ?? "Profesional"}
                                            </span>
                                          )}
                                          <Badge variant={STATUS_VARIANT[b.status]}>
                                            <span className="flex items-center gap-1">
                                              {STATUS_ICON[b.status]}
                                              {STATUS_LABEL[b.status]}
                                            </span>
                                          </Badge>
                                        </div>
                                        <p className="text-sm text-[#374151] line-clamp-2 mb-1">{b.service_description}</p>
                                        {formatBookingDate(b) && (
                                          <p className="text-xs text-[#6b7280]">📅 {formatBookingDate(b)}</p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2 shrink-0">
                                      {b.status === "awaiting_confirmation" && (
                                        <Button size="sm" onClick={() => confirmBookingDone(b.id)}>
                                          <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar finalización
                                        </Button>
                                      )}
                                      {["pending", "confirmed", "in_progress"].includes(b.status) && (
                                        <Button size="sm" variant="outline" onClick={() => cancelBooking(b.id)}>
                                          Cancelar
                                        </Button>
                                      )}
                                      {b.professionals?.whatsapp && (
                                        <Button size="sm" variant="whatsapp" asChild>
                                          <a
                                            href={getWhatsAppLink(b.professionals.whatsapp, `Hola, te contacto por mi solicitud en ContrataCR.`)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            <WhatsAppIcon className="h-3.5 w-3.5" />
                                            Contactar
                                          </a>
                                        </Button>
                                      )}
                                      {["confirmed", "in_progress", "awaiting_confirmation"].includes(b.status) && (
                                        <button
                                          onClick={() => reportProfessional(b.id)}
                                          className="inline-flex items-center justify-center gap-1.5 text-xs text-[#9ca3af] hover:text-red-500 transition-colors"
                                        >
                                          <Flag className="h-3.5 w-3.5" /> Reportar
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}

                      {pastBookings.length > 0 && (
                        <div>
                          <h2 className="text-sm font-semibold text-[#374151] mb-3">Historial</h2>
                          <div className="flex flex-col gap-3">
                            {pastBookings.map((b) => (
                              <Card key={b.id}>
                                <CardContent className="p-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        {b.professionals?.slug ? (
                                          <Link href={`/profesionales/${b.professionals.slug}`} className="text-sm font-semibold text-[#111827] hover:text-[#009FD9] hover:underline">
                                            {b.professionals?.categories?.icon} {b.professionals?.profiles?.full_name ?? "Profesional"}
                                          </Link>
                                        ) : (
                                          <span className="text-sm font-semibold text-[#111827]">
                                            {b.professionals?.categories?.icon} {b.professionals?.profiles?.full_name ?? "Profesional"}
                                          </span>
                                        )}
                                        <Badge variant={STATUS_VARIANT[b.status]}>
                                          {STATUS_LABEL[b.status]}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-[#374151] line-clamp-2">{b.service_description}</p>
                                      <p className="text-xs text-[#9ca3af] mt-1">
                                        {new Date(b.created_at).toLocaleDateString("es-CR")}
                                      </p>
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                      {b.status === "completed" && (() => {
                                        const rev = bookingReview(b.id);
                                        return (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() =>
                                              setReviewModal({
                                                professionalId: b.professional_id,
                                                professionalName: b.professionals?.profiles?.full_name ?? "Profesional",
                                                bookingId: b.id,
                                              })
                                            }
                                          >
                                            <Star className={cn("h-3.5 w-3.5", rev && "fill-yellow-400 text-yellow-400")} />
                                            {rev ? "Ver/Editar reseña" : "Reseña"}
                                          </Button>
                                        );
                                      })()}
                                      {["completed", "cancelled"].includes(b.status) && (
                                        <button
                                          onClick={() => reportProfessional(b.id)}
                                          className="inline-flex items-center justify-center gap-1.5 text-xs text-[#9ca3af] hover:text-red-500 transition-colors"
                                        >
                                          <Flag className="h-3.5 w-3.5" /> Reportar
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* PROJECTS TAB */}
              {activeTab === "projects" && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-[#111827]">Mis proyectos</h2>
                    <Button size="sm" asChild>
                      <a href="/publicar-proyecto">
                        <Plus className="h-4 w-4" />
                        Publicar proyecto
                      </a>
                    </Button>
                  </div>

                  {projects.length === 0 ? (
                    <div className="text-center py-16">
                      <FolderOpen className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
                      <p className="font-medium text-[#374151]">No publicaste ningún proyecto todavía</p>
                      <p className="text-sm text-[#9ca3af] mt-1">
                        Publicá un proyecto para recibir propuestas de profesionales.
                      </p>
                      <Button className="mt-5" asChild>
                        <a href="/publicar-proyecto">Publicar proyecto</a>
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      <div className="flex gap-1.5 flex-wrap">
                        {([["todas", "Todos"], ["abiertos", "Abiertos"], ["encurso", "En curso"], ["finalizados", "Finalizados"], ["cancelados", "Cancelados"]] as const).map(([id, label]) => (
                          <button key={id} onClick={() => setProjectFilter(id)} className={cn("px-3 py-1 rounded-full text-xs font-medium transition-colors", projectFilter === id ? "bg-[#009FD9] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]")}>{label}</button>
                        ))}
                      </div>
                      {filteredProjects.length === 0 && (
                        <p className="text-sm text-[#9ca3af] text-center py-8">No hay proyectos en esta vista.</p>
                      )}
                      {filteredProjects.map((project) => {
                        const isExpanded = expandedProject === project.id;
                        const proposalList = projectProposals[project.id];
                        const proposalCount = project.proposals?.length ?? 0;

                        return (
                          <Card key={project.id}>
                            <CardContent className="p-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#EBF5FB] text-[#009FD9] shrink-0">
                                      <Briefcase className="h-3.5 w-3.5" />
                                    </span>
                                    <span className="font-semibold text-sm text-[#111827]">{project.title}</span>
                                    <Badge
                                      variant={
                                        project.status === "in_progress" ? "warning"
                                          : project.status === "awaiting_confirmation" ? "warning"
                                          : project.status === "completed" ? "success"
                                          : project.status === "cancelled" ? "error"
                                          : "success"
                                      }
                                    >
                                      {project.status === "in_progress" ? "En curso · Asignado"
                                        : project.status === "awaiting_confirmation" ? "Esperando tu confirmación"
                                        : project.status === "completed" ? "Finalizado"
                                        : project.status === "cancelled" ? "Cancelado"
                                        : "Abierto"}
                                    </Badge>
                                  </div>
                                  <p className="text-sm text-[#6b7280] line-clamp-2 mb-2">{project.description}</p>
                                  <div className="flex items-center gap-3 text-xs text-[#9ca3af]">
                                    {(project.provincias?.name || project.cantones?.name) && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {[project.cantones?.name, project.provincias?.name].filter(Boolean).join(", ")}
                                      </span>
                                    )}
                                    <span>{proposalCount} propuesta{proposalCount !== 1 ? "s" : ""}</span>
                                  </div>
                                </div>
                                {proposalCount > 0 && (
                                  <button
                                    onClick={async () => {
                                      if (!isExpanded) await loadProposals(project.id);
                                      setExpandedProject(isExpanded ? null : project.id);
                                    }}
                                    className="flex items-center gap-1 text-sm font-medium text-[#009FD9] hover:underline shrink-0"
                                  >
                                    {isExpanded ? (
                                      <>Ver menos <ChevronUp className="h-4 w-4" /></>
                                    ) : (
                                      <>Ver propuestas <ChevronDown className="h-4 w-4" /></>
                                    )}
                                  </button>
                                )}
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {project.status === "open" && (
                                  <Button size="sm" variant="outline" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                                    Cancelar proyecto
                                  </Button>
                                )}
                                {project.status === "cancelled" && (
                                  <Button size="sm" variant="outline" onClick={() => updateProjectStatus(project.id, "open")}>
                                    Reabrir proyecto
                                  </Button>
                                )}
                                {project.status === "awaiting_confirmation" && (
                                  <Button size="sm" onClick={() => confirmProjectCompletion(project.id)}>
                                    <CheckCircle2 className="h-4 w-4" /> Confirmar finalización
                                  </Button>
                                )}
                                {/* Either party can cancel before completion. */}
                                {(project.status === "in_progress" || project.status === "awaiting_confirmation") && (
                                  <Button size="sm" variant="outline" className="text-red-500 hover:bg-red-50" onClick={() => updateProjectStatus(project.id, "cancelled")}>
                                    Cancelar proyecto
                                  </Button>
                                )}
                                {/* Review unlocks on FINALIZADO (completed) projects. */}
                                {project.status === "completed" && (() => {
                                  const rev = projectReview(project.id);
                                  return (
                                    <Button size="sm" variant="outline" onClick={() => reviewProjectPro(project.id)}>
                                      <Star className={cn("h-3.5 w-3.5", rev && "fill-yellow-400 text-yellow-400")} /> {rev ? "Ver/Editar reseña" : "Dejar reseña"}
                                    </Button>
                                  );
                                })()}
                                {project.status !== "in_progress" && project.status !== "awaiting_confirmation" && (
                                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" onClick={() => deleteProject(project.id)}>
                                    <Trash2 className="h-4 w-4" /> Eliminar
                                  </Button>
                                )}
                              </div>

                              {isExpanded && proposalList && (() => {
                                // Once a project is finalized (or cancelled) the decision is
                                // LOCKED: keep the accepted proposal marked "Finalizada", drop
                                // "Cambiar decisión", and collapse the non-accepted ones.
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
                                        {proposal.price && (
                                          <p className="text-xs text-[#009FD9] font-medium">₡{proposal.price.toLocaleString("es-CR")}</p>
                                        )}
                                        <p className="text-xs text-[#6b7280] mt-0.5 line-clamp-2">{proposal.message}</p>
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-1.5 shrink-0">
                                      {proposal.status === "pending" && !locked && (
                                        <>
                                          <Button size="sm" onClick={() => acceptProposal(proposal.id, project.id)}>Aceptar</Button>
                                          <Button size="sm" variant="outline" onClick={() => declineProposal(proposal.id, project.id)}>Rechazar</Button>
                                        </>
                                      )}
                                      {proposal.status === "accepted" && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold px-2.5 py-1">
                                          <CheckCircle2 className="h-3.5 w-3.5" />
                                          {finalized ? "Finalizada" : "Aceptada"}
                                        </span>
                                      )}
                                      {proposal.status === "declined" && <Badge variant="error">Rechazada</Badge>}
                                      {/* Change/revert — only while NOT locked (pre-finalization) */}
                                      {!locked && (proposal.status === "accepted" || proposal.status === "declined") && (
                                        <Button size="sm" variant="outline" onClick={() => revertProposal(proposal.id, project.id)}>Cambiar decisión</Button>
                                      )}
                                      {proposal.professionals?.whatsapp && (
                                        <Button size="sm" variant="whatsapp" asChild>
                                          <a href={getWhatsAppLink(proposal.professionals.whatsapp, `Hola, te escribo por tu propuesta en ContrataCR para el proyecto "${project.title}".`)} target="_blank" rel="noopener noreferrer">
                                            <WhatsAppIcon className="h-3.5 w-3.5" /> WhatsApp
                                          </a>
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                );

                                return (
                                  <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-col gap-3">
                                    {proposalList.length === 0 ? (
                                      <p className="text-sm text-[#9ca3af] text-center py-2">Sin propuestas todavía.</p>
                                    ) : (
                                      <>
                                        {primary.map(renderProposal)}
                                        {finalized && others.length > 0 && (
                                          <details className="text-xs">
                                            <summary className="cursor-pointer text-[#6b7280] hover:text-[#374151]">Ver propuestas no elegidas ({others.length})</summary>
                                            <div className="flex flex-col gap-3 mt-2 opacity-70">{others.map(renderProposal)}</div>
                                          </details>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SAVED TAB */}
              {activeTab === "saved" && (
                <div>
                  <h2 className="text-lg font-semibold text-[#111827] mb-4">Profesionales guardados</h2>
                  <SavedProfessionalsTab />
                </div>
              )}

              {/* NOTIFICATIONS TAB */}
              {activeTab === "notifications" && (
                <div>
                  <h2 className="text-lg font-semibold text-[#111827] mb-4">Notificaciones</h2>
                  {/* Shared list with full management: mark single/all read, delete single/all. */}
                  <NotificationsList />
                </div>
              )}

              {/* PROFILE TAB */}
              {activeTab === "profile" && (
                <div>
                  <h2 className="text-lg font-semibold text-[#111827] mb-5">Mi información</h2>

                  {/* Photo */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 mb-4">
                    <label className="text-sm font-medium text-[#374151] block mb-3">Foto de perfil</label>
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        <div className="h-16 w-16 rounded-full overflow-hidden bg-[#EBF5FB] flex items-center justify-center shrink-0">
                          {profileAvatar ? (
                            <img src={profileAvatar} alt="Foto" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[#009FD9] font-bold text-xl">{getInitials(displayName)}</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="cursor-pointer inline-flex items-center gap-2 text-sm font-medium text-[#009FD9] border border-[#009FD9] rounded-xl px-4 py-2 hover:bg-[#EBF5FB] transition-colors">
                          {photoUploading ? (
                            <><span className="h-4 w-4 rounded-full border-2 border-[#009FD9] border-t-transparent animate-spin" />Subiendo...</>
                          ) : "Cambiar foto"}
                          <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                        </label>
                        <p className="text-xs text-[#9ca3af] mt-1">JPG, PNG o WebP — máx 5MB</p>
                      </div>
                    </div>
                  </div>

                  {/* Name + phone */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6 flex flex-col gap-4 mb-4">
                    <div>
                      <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo</label>
                      <input
                        type="text"
                        className={inputClass}
                        value={profileForm.full_name}
                        onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
                      />
                    </div>
                    <PhoneInput
                      label={<>Teléfono <span className="text-[#9ca3af] font-normal">(opcional)</span></>}
                      value={profileForm.phone}
                      onChange={(digits) => setProfileForm((f) => ({ ...f, phone: digits }))}
                    />
                    <div className="flex items-center gap-3 mt-2">
                      <Button onClick={saveProfile} loading={profileSaving} disabled={profileSaving}>
                        Guardar cambios
                      </Button>
                      {profileSaved && <span className="text-sm text-emerald-600 font-medium">✓ ¡Cambios guardados!</span>}
                    </div>
                  </div>

                  {/* Become a professional — same account, adds the pro role + onboarding */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EBF5FB] shrink-0">
                        <Briefcase className="h-5 w-5 text-[#009FD9]" />
                      </div>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-[#111827]">¿Ofrecés servicios?</h3>
                        <p className="text-xs text-[#6b7280] mt-0.5 mb-3">
                          Convertí tu cuenta en profesional sin crear una nueva. Completás tu cédula y datos de servicio una sola vez.
                        </p>
                        <Button size="sm" onClick={() => router.push("/registro/profesional")}>
                          <Briefcase className="h-4 w-4" /> Convertirme en profesional
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Email */}
                  <div className="bg-white rounded-2xl border border-[#e5e7eb] p-6">
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Correo electrónico</label>
                    {isOAuthAccount ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-sm text-[#374151] font-medium">{user?.email}</span>
                        <p className="text-xs text-[#9ca3af]">
                          Tu correo está vinculado a tu cuenta de {oauthProvider === "google" ? "Google" : "Facebook"} y no puede modificarse aquí.
                        </p>
                      </div>
                    ) : emailChangeSent ? (
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
                        ✓ Revisá tu bandeja — enviamos un correo de confirmación al nuevo email.
                      </div>
                    ) : emailChangeMode ? (
                      <div className="flex flex-col gap-3">
                        <input
                          type="email"
                          className={inputClass}
                          placeholder="nuevo@correo.com"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                        />
                        {emailChangeError && (
                          <p className="text-xs text-red-500">{emailChangeError}</p>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" onClick={sendEmailChange} disabled={!newEmail.trim()}>Confirmar cambio</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEmailChangeMode(false); setNewEmail(""); setEmailChangeError(null); }}>Cancelar</Button>
                        </div>
                        <p className="text-xs text-[#9ca3af]">Te enviaremos un correo de confirmación al nuevo email.</p>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-[#374151] font-medium">{user?.email}</span>
                        <button
                          onClick={() => setEmailChangeMode(true)}
                          className="text-sm text-[#009FD9] hover:underline whitespace-nowrap"
                        >
                          Cambiar email
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cerrar / deshabilitar cuenta */}
                  <CloseAccountSection />
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <LandingFooter />

      {reviewModal && (
        <LeaveReviewModal
          {...reviewModal}
          onSuccess={loadMyReviews}
          onClose={() => setReviewModal(null)}
        />
      )}
    </div>
  );
}
