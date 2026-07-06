"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, CheckCheck, X } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { createClient } from "@/lib/supabase/client";
import { isSigningOut } from "@/lib/auth/sign-out";
import { useAuth } from "@/hooks/use-auth";
import { useRouter } from "@/i18n/navigation";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { notificationHref } from "@/lib/notification-link";
import { TRANSLATED_NOTIFICATION_TYPES } from "@/lib/localized-notification";
import { getNotificationProjectCreatedAt, useNotificationProjectTimes } from "@/hooks/use-notification-project-times";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string; project_id?: string | null; project_created_at?: string | null } | null;
};

// Dedicated notifications center — reachable from the bell ("Ver todas") for
// BOTH clients and professionals. Lists the full history.
export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(true);
  const projectTimes = useNotificationProjectTimes(items);

  useEffect(() => {
    if (!loading && !user && !isSigningOut()) router.push("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { setItems(data ?? []); setBusy(false); });
  }, [user]);

  const unread = items.filter((n) => !n.read).length;
  const notificationTitle = (n: Notification) =>
    TRANSLATED_NOTIFICATION_TYPES.has(n.type) ? t(`types.${n.type}`) : n.title;
  const notificationTime = (n: Notification) => {
    const projectCreatedAt = getNotificationProjectCreatedAt(n, projectTimes);
    return projectCreatedAt
      ? t("publishedAt", { time: formatRelativeOrDate(projectCreatedAt, locale) })
      : formatRelativeOrDate(n.created_at, locale);
  };

  async function markAllRead() {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function open(n: Notification) {
    if (!n.read) {
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
    }
    window.location.assign(notificationHref(n, undefined, locale));
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />
      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-8">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold text-[#111827]">{t("title")}</h1>
            {unread > 0 && (
              <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline">
                <CheckCheck className="h-4 w-4" /> {t("markAllRead")}
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            {busy ? (
              <div className="py-16 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <Bell className="h-10 w-10 text-[#e5e7eb] mx-auto mb-3" />
                <p className="text-sm text-[#6b7280]">{t("noneList")}</p>
              </div>
            ) : (
              <ul>
                {items.map((n) => (
                  <li key={n.id} className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f0f9f6]")}>
                    <button onClick={() => open(n)} className="w-full text-left px-4 py-3 pr-10 hover:bg-[#f9fafb] transition-colors">
                      <div className="flex items-start gap-2">
                        {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#319278] shrink-0" />}
                        <div className={cn(!n.read ? "" : "ml-4")}>
                          <p className="text-sm font-medium text-[#111827]">{notificationTitle(n)}</p>
                          <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
                          <p className="text-xs text-[#9ca3af] mt-1">{notificationTime(n)}</p>
                        </div>
                      </div>
                    </button>
                    <button onClick={(e) => dismiss(e, n.id)} className="absolute top-2.5 right-2.5 p-1 rounded-md text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors" aria-label={t("delete")}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
