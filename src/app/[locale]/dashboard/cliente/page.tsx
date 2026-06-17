"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays, Bookmark, LogOut, Bell, User, FolderOpen, Briefcase, Search, Headset,
  Lock, Camera, X, Settings,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { detectIdType } from "@/lib/cedula";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn, getInitials } from "@/lib/utils";
import { NotificationsList } from "@/components/notifications/notifications-list";
import { PhoneInput } from "@/components/ui/phone-input";
import { CloseAccountSection } from "@/components/account/close-account-section";
import { AccountSecuritySection } from "@/components/account/account-security";
import { SaveStatus } from "@/components/dashboard/save-status";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { SupportTickets } from "@/components/support/support-tickets";
import { ClientActivity } from "@/components/dashboard/client-activity";

type Tab = "bookings" | "projects" | "saved" | "notifications" | "soporte" | "profile" | "cuenta";

export default function ClientDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const t = useTranslations("clientPage");
  const router = useRouter();
  const searchParams = useSearchParams();
  // Post-login lands on the panel HOME (Mi perfil), not a deep sub-section.
  const activeTab = (searchParams.get("tab") as Tab) ?? "profile";

  const [profileData, setProfileData] = useState<{ full_name: string; phone?: string; avatar_url?: string; cedula?: string | null } | null>(null);
  const [profileForm, setProfileForm] = useState({ full_name: "", phone: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  // App-wide RELIABLE autosave (the "Save standard"; see contratacr-context.md):
  // debounce + flush on blur + flush on unmount, so switching tabs never silently
  // loses a profile edit.
  const [profileDirty, setProfileDirty] = useState(false);
  const profileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileDirtyRef = useRef(false);
  const saveProfileRef = useRef<() => Promise<void>>(async () => {});
  function touchProfile() {
    setProfileSaved(false);
    setProfileDirty(true);
    profileDirtyRef.current = true;
    if (profileTimer.current) clearTimeout(profileTimer.current);
    profileTimer.current = setTimeout(() => { void saveProfile(); }, 1000);
  }
  function flushProfile() {
    if (profileTimer.current) { clearTimeout(profileTimer.current); profileTimer.current = null; }
    if (profileDirtyRef.current) void saveProfile();
  }
  const [photoUploading, setPhotoUploading] = useState(false);
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
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
      cuenta: "cuenta",
    };
    const target = map[activeTab];
    router.replace(`/dashboard/profesional${target ? `?tab=${target}` : ""}`);
  }, [authLoading, user, role, activeTab, router]);

  const loadProfile = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    // Own profile incl. cédula/phone via the SECURITY DEFINER RPC (sensitive
    // columns are no longer directly selectable — see migration 047).
    supabase
      .rpc("get_my_profile")
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
    setProfileDirty(false);
    setProfileSaving(true);
    const supabase = createClient();
    // Never overwrite a verified official name (it's locked; corrections go
    // through admin review). Phone is always editable.
    const verified = !!profileData?.cedula && detectIdType(String(profileData.cedula)) === "cedula";
    const update: Record<string, string | null> = { phone: profileForm.phone || null };
    if (!verified) update.full_name = profileForm.full_name;
    await supabase.from("profiles").update(update).eq("id", user.id);
    // Mirror the name into auth metadata so the header/menu update IMMEDIATELY
    // (they read user_metadata.full_name) — updateUser fires onAuthStateChange.
    if (!verified && profileForm.full_name) {
      await supabase.auth.updateUser({ data: { full_name: profileForm.full_name } });
      setProfileData((prev) => (prev ? { ...prev, full_name: profileForm.full_name } : prev));
    }
    setProfileSaving(false);
    setProfileSaved(true);
    profileDirtyRef.current = false;
    setTimeout(() => setProfileSaved(false), 3000);
  }
  saveProfileRef.current = saveProfile;

  // Flush a pending profile save on unmount (e.g. switching tabs) — the key
  // data-loss fix: the fetch survives the unmount on a same-page tab switch, so an
  // edit made right before leaving the section is never silently lost.
  useEffect(() => () => {
    if (profileTimer.current) clearTimeout(profileTimer.current);
    if (profileDirtyRef.current) void saveProfileRef.current?.();
  }, []);

  async function handlePhotoRemove() {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    await supabase.auth.updateUser({ data: { avatar_url: null } });
    setProfileAvatar(null);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "avatar");
      const res = await fetch("/api/upload/photo", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || t("photoError"));
        return;
      }
      const { url } = await res.json();
      const supabase = createClient();
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await supabase.auth.updateUser({ data: { avatar_url: url } });
      setProfileAvatar(url);
    } catch {
      alert(t("photoError"));
    } finally {
      setPhotoUploading(false);
    }
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
    t("clientFallback");

  const headerAvatar =
    profileAvatar ||
    (user?.user_metadata?.avatar_url as string) ||
    null;

  // Client identity: a saved NATIONAL cédula was confirmed against the padrón at
  // booking (its name became the official one) → "Identidad verificada" + name
  // locked. A DIMEX/NITE is registered but not padrón-verified. No cédula → name
  // freely editable (nothing official to protect yet).
  const savedCedula = profileData?.cedula ? String(profileData.cedula) : "";
  const hasCedula = !!savedCedula;
  const cedulaVerified = hasCedula && detectIdType(savedCedula) === "cedula";

  const TABS: { key: Tab; icon: React.ReactNode; label: string }[] = [
    { key: "bookings", icon: <CalendarDays className="h-4 w-4" />, label: t("tabBookings") },
    { key: "projects", icon: <FolderOpen className="h-4 w-4" />, label: t("tabProjects") },
    { key: "saved", icon: <Bookmark className="h-4 w-4" />, label: t("tabSaved") },
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
      label: t("tabNotifications"),
    },
    {
      key: "soporte",
      icon: (
        <div className="relative">
          <Headset className="h-4 w-4" />
          {supportUnread > 0 && (
            <span className="absolute -top-2 -right-2.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-white">
              {supportUnread > 9 ? "9+" : supportUnread}
            </span>
          )}
        </div>
      ),
      label: t("tabSupport"),
    },
    { key: "profile", icon: <User className="h-4 w-4" />, label: t("tabProfile") },
    { key: "cuenta", icon: <Settings className="h-4 w-4" />, label: t("tabAccount") },
  ];

  const inputClass =
    "w-full h-10 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  // Titled Card shell (same as the professional panel) for the list/activity tabs
  // so projects/solicitudes look identical across both panels. Profile keeps its
  // own multi-card settings layout.
  const SECTION_TITLE: Partial<Record<Tab, string>> = {
    bookings: t("bookingsHeading"),
    projects: t("projectsHeading"),
    saved: t("savedHeading"),
    notifications: t("notificationsHeading"),
    soporte: t("supportHeading"),
    profile: t("tabProfile"),
    cuenta: t("tabAccount"),
  };
  const SECTION_SUBTITLE: Partial<Record<Tab, string>> = {
    bookings: t("bookingsSubtitle"),
    projects: t("projectsSubtitle"),
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">

          {/* Header — greeting on top; on mobile the actions drop to their own
              full-width row so "Buscar profesionales" always fits and is tappable. */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="relative h-11 w-11 shrink-0">
                {headerAvatar ? (
                  <img
                    src={headerAvatar}
                    alt={t("photoAlt")}
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
                  {t("greeting", { name: displayName.split(" ")[0] })}
                </h1>
                <p className="text-xs text-[#9ca3af]">{t("subtitle")}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="ml-auto shrink-0 text-[#6b7280] hover:text-red-500 sm:hidden">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
              <Button size="sm" asChild className="flex-1 sm:flex-none justify-center">
                <a href="/buscar"><Search className="h-4 w-4" /> {t("searchPros")}</a>
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut} className="hidden sm:inline-flex text-[#6b7280] hover:text-red-500">
                <LogOut className="h-4 w-4" />
                <span>{t("signOut")}</span>
              </Button>
            </div>
          </div>

          {/* Two-column layout — vertical sidebar, consistent with the professional panel. */}
          <div className="flex flex-col lg:flex-row gap-6">
            <nav className="lg:w-60 shrink-0">
              <div className="rounded-2xl border border-[#e5e7eb] bg-white p-2 flex flex-col gap-0.5 lg:sticky lg:top-20">
                {TABS.map(({ key, icon, label }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left",
                      activeTab === key ? "bg-[#EBF5FB] text-[#009FD9]" : "text-[#374151] hover:bg-[#f3f4f6]"
                    )}
                  >
                    {icon}
                    {label}
                  </button>
                ))}
              </div>
            </nav>

            <div className="flex-1 min-w-0">

          {/* ALL tabs share ONE titled Card shell — identical to the professional
              panel. "Mi perfil" is the large container; its subsections live inside
              it (divider-separated), and "Cuenta y seguridad" is its OWN tab. */}
          <Card>
            <CardHeader className="px-6 pt-6 pb-3">
              <h2 className="text-lg font-semibold text-[#111827]">{SECTION_TITLE[activeTab]}</h2>
              {SECTION_SUBTITLE[activeTab] && (
                <p className="text-sm text-[#6b7280] mt-0.5">{SECTION_SUBTITLE[activeTab]}</p>
              )}
            </CardHeader>
            <CardContent className="px-6 pt-1 pb-6">
              {activeTab === "bookings" && <ClientActivity section="bookings" />}
              {activeTab === "projects" && <ClientActivity section="projects" />}
              {activeTab === "saved" && <ClientActivity section="saved" />}
              {activeTab === "notifications" && <NotificationsList />}
              {activeTab === "soporte" && <SupportTickets onUnreadChange={setSupportUnread} />}

              {/* MI PERFIL — one container, divider-separated subsections inside. */}
              {activeTab === "profile" && (
                <div className="flex flex-col gap-4">
                  {/* App-wide autosave — consistent status, no save button. */}
                  <SaveStatus saving={profileSaving} saved={profileSaved} dirty={profileDirty} />
                  {/* Foto */}
                  <div className="flex items-center gap-4">
                    <div className="relative h-16 w-16 rounded-full overflow-hidden bg-[#EBF5FB] flex items-center justify-center shrink-0">
                      {profileAvatar ? (
                        <img src={profileAvatar} alt="Foto" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[#009FD9] font-bold text-xl">{getInitials(displayName)}</span>
                      )}
                      {photoUploading && (
                        <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                          <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        </div>
                      )}
                    </div>
                    {/* Change + remove — same control as the professional panel. */}
                    {profileAvatar ? (
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                          <Camera className="h-4 w-4" /> {t("changePhoto")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" onClick={handlePhotoRemove} disabled={photoUploading} className="text-red-500 hover:text-red-600">
                          <X className="h-4 w-4" /> {t("removePhoto")}
                        </Button>
                      </div>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>
                        <Camera className="h-4 w-4" /> {t("addPhoto")}
                      </Button>
                    )}
                    <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={photoUploading} />
                  </div>

                  {/* Datos — nombre + teléfono */}
                  <div className="border-t border-[#f3f4f6] pt-5 flex flex-col gap-4">
                    <div>
                      <label className="text-sm font-medium text-[#374151] mb-1.5 flex items-center gap-1.5">
                        {t("fullName")} <span className="text-red-500">*</span>
                        {cedulaVerified && (
                          <span className="inline-flex items-center text-[11px] font-semibold text-[#16a34a]">{t("verified")}</span>
                        )}
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          className={cn(inputClass, cedulaVerified && "bg-[#f3f4f6] cursor-not-allowed pr-10")}
                          value={profileForm.full_name}
                          disabled={cedulaVerified}
                          onChange={(e) => { setProfileForm((f) => ({ ...f, full_name: e.target.value })); touchProfile(); }}
                          onBlur={flushProfile}
                        />
                        {cedulaVerified && <Lock className="h-4 w-4 text-[#9ca3af] absolute right-3 top-1/2 -translate-y-1/2" />}
                      </div>
                      {cedulaVerified && (
                        <p className="text-xs text-[#6b7280] mt-1.5">
                          {t.rich("nameLockedHelp", { link: (c) => <Link href="/dashboard/cliente?tab=soporte" className="text-[#009FD9] font-medium hover:underline">{c}</Link> })}
                        </p>
                      )}
                    </div>
                    <PhoneInput
                      label={<>{t("phone")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span></>}
                      value={profileForm.phone}
                      onChange={(digits) => { setProfileForm((f) => ({ ...f, phone: digits })); touchProfile(); }}
                    />
                  </div>

                  {/* Ofrecer mis servicios — same account, adds the pro role. */}
                  <div className="border-t border-[#f3f4f6] pt-5">
                    <h3 className="text-sm font-semibold text-[#111827]">{t("offerTitle")}</h3>
                    <p className="text-xs text-[#6b7280] mt-0.5 mb-3">
                      {t("offerBody")}
                    </p>
                    <Button size="sm" onClick={() => router.push("/registro/profesional")}>
                      <Briefcase className="h-4 w-4" /> {t("offerCta")}
                    </Button>
                  </div>
                </div>
              )}

              {/* CUENTA Y SEGURIDAD — its own section, like the professional panel. */}
              {activeTab === "cuenta" && (
                <div className="space-y-6">
                  <AccountSecuritySection showHeading={false} />
                  <CloseAccountSection />
                </div>
              )}
            </CardContent>
          </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Flush any pending autosave if the user navigates away mid-debounce. */}
      <UnsavedChangesGuard dirty={profileDirty} onSave={saveProfile} />

      <LandingFooter />
    </div>
  );
}
