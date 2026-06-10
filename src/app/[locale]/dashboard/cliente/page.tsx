"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays, Bookmark, LogOut, Bell, User, FolderOpen, Briefcase, Search, LifeBuoy,
} from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn, getInitials } from "@/lib/utils";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PhoneInput } from "@/components/ui/phone-input";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { AccountSecuritySection } from "@/components/account/account-security";
import { SupportTickets } from "@/components/support/support-tickets";
import { ClientActivity } from "@/components/dashboard/client-activity";

type Tab = "bookings" | "projects" | "saved" | "notifications" | "soporte" | "profile";

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get("tab") as Tab) ?? "bookings";

  const [profileData, setProfileData] = useState<{ full_name: string; phone?: string; avatar_url?: string } | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [supportUnread, setSupportUnread] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  // A PROFESSIONAL has no separate client dashboard — their client activity
  // lives in the unified "Mi panel" under "Contratar servicios". Route any
  // /dashboard/cliente access into the matching unified tab. Plain clients stay.
  const role = user?.user_metadata?.role as string | undefined;
  useEffect(() => {
    if (authLoading || !user || role !== "professional") return;
    const map: Record<Tab, string> = {
      bookings: "sent_bookings",
      projects: "sent_projects",
      saved: "saved",
      notifications: "notifications",
      soporte: "soporte",
      profile: "cuenta",
    };
    const target = map[activeTab];
    router.replace(`/dashboard/profesional${target ? `?tab=${target}` : ""}`);
  }, [authLoading, user, role, activeTab, router]);

  const loadProfile = useCallback(() => {
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

  // Load profile on mount (header name/avatar) and whenever the profile tab opens.
  useEffect(() => { loadProfile(); }, [loadProfile, activeTab]);

  // Unread count for the notifications tab badge.
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

  // Unread support replies → badge on the Soporte tab (refreshes on tab change).
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "support_reply")
      .eq("read", false)
      .then(({ count }) => setSupportUnread(count ?? 0));
  }, [user, activeTab]);

  function setTab(tab: Tab) {
    router.push(`/dashboard/cliente?tab=${tab}`);
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut({ scope: "local" });
    window.location.href = "/es";
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
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setProfileAvatar(url);
    }
    setPhotoUploading(false);
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

  const displayName =
    profileData?.full_name ||
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    user?.email?.split("@")[0] ||
    "Cliente";

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
    {
      key: "soporte",
      icon: (
        <div className="relative">
          <LifeBuoy className="h-4 w-4" />
          {supportUnread > 0 && (
            <span className="absolute -top-2 -right-2.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {supportUnread > 9 ? "9+" : supportUnread}
            </span>
          )}
        </div>
      ),
      label: "Soporte",
    },
    { key: "profile", icon: <User className="h-4 w-4" />, label: "Mi perfil" },
  ];

  const inputClass =
    "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0">
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
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-[#111827] truncate">
                  Hola, {displayName.split(" ")[0]} 👋
                </h1>
                <p className="text-xs text-[#9ca3af]">Tu panel en ContrataCR</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button size="sm" asChild>
                <a href="/buscar"><Search className="h-4 w-4" /> <span className="hidden sm:inline">Buscar profesionales</span><span className="sm:hidden">Buscar</span></a>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-[#6b7280] hover:text-red-500">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Salir</span>
              </Button>
            </div>
          </div>

          {/* Tab nav — scrollable on mobile */}
          <div className="flex gap-1 bg-[#f3f4f6] rounded-xl p-1 mb-5 overflow-x-auto">
            {TABS.map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap shrink-0",
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

          {/* SENT SOLICITUDES / PUBLISHED PROJECTS / SAVED — shared client activity */}
          {activeTab === "bookings" && <ClientActivity section="bookings" />}
          {activeTab === "projects" && <ClientActivity section="projects" />}
          {activeTab === "saved" && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-4">Profesionales guardados</h2>
              <ClientActivity section="saved" />
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === "notifications" && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-4">Notificaciones</h2>
              <NotificationsList />
            </div>
          )}

          {/* SOPORTE TAB */}
          {activeTab === "soporte" && (
            <div>
              <h2 className="text-lg font-semibold text-[#111827] mb-4">Soporte</h2>
              <SupportTickets onUnreadChange={setSupportUnread} />
            </div>
          )}

          {/* PROFILE TAB */}
          {activeTab === "profile" && (
            <div className="space-y-4">
              {/* Photo + name + phone — one card */}
              <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-[#EBF5FB] flex items-center justify-center shrink-0">
                    {profileAvatar ? (
                      <img src={profileAvatar} alt="Foto" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[#009FD9] font-bold text-xl">{getInitials(displayName)}</span>
                    )}
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

                <div className="border-t border-[#f3f4f6] pt-4 flex flex-col gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#374151] block mb-1.5">Nombre completo <span className="text-red-500">*</span></label>
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
                  <div className="flex items-center gap-3">
                    <Button onClick={saveProfile} loading={profileSaving} disabled={profileSaving}>
                      Guardar cambios
                    </Button>
                    {profileSaved && <span className="text-sm text-emerald-600 font-medium">✓ ¡Cambios guardados!</span>}
                  </div>
                </div>
              </div>

              {/* Offer my services — same account, adds the pro role + onboarding */}
              <div className="bg-white rounded-2xl border border-[#e5e7eb] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EBF5FB] shrink-0">
                    <Briefcase className="h-5 w-5 text-[#009FD9]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold text-[#111827]">¿Ofreces servicios?</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5 mb-3">
                      Convierte tu cuenta en profesional sin crear una nueva. Completas tu cédula y datos de servicio una sola vez, y conservas todo lo que ya tienes como cliente.
                    </p>
                    <Button size="sm" onClick={() => router.push("/registro/profesional")}>
                      <Briefcase className="h-4 w-4" /> Ofrecer mis servicios
                    </Button>
                  </div>
                </div>
              </div>

              {/* Cuenta y seguridad — change email/password, OAuth-aware */}
              <AccountSecuritySection />

              {/* Cerrar / deshabilitar cuenta */}
              <CloseAccountSection />
            </div>
          )}
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
