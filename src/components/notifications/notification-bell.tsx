"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { notificationHref, notificationContext, notificationContextLabel } from "@/lib/notification-link";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string } | null;
};

export function NotificationBell() {
  const { user } = useAuth();
  const t = useTranslations("notifications");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(data ?? []));

    // Real-time subscription
    const channel = supabase
      .channel("notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function markAllRead() {
    if (!user) return;
    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", user.id)
      .eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  function openNotification(n: Notification) {
    setOpen(false);
    if (!n.read) {
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
    }
    const role = user?.user_metadata?.role as string | undefined;
    window.location.assign(notificationHref(n, role));
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  if (!user) return null;

  // "Ver todas" opens the Notifications SECTION inside the user's own panel
  // (not a separate page), routed by role.
  const role = user.user_metadata?.role as string | undefined;
  const allNotificationsHref =
    role === "professional"
      ? "/es/dashboard/profesional?tab=notifications"
      : "/es/dashboard/cliente?tab=notifications";

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
        aria-label={t("title")}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-[#e5e7eb] bg-white shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f3f4f6]">
            <span className="text-sm font-semibold text-[#111827]">{t("title")}</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1 text-xs text-[#319278] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {t("markAllRead")}
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-8 w-8 text-[#e5e7eb] mx-auto mb-2" />
                <p className="text-sm text-[#9ca3af]">{t("empty")}</p>
              </div>
            ) : (
              <ul>
                {notifications.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      "relative group border-b border-[#f3f4f6] last:border-0",
                      !n.read && "bg-[#f0f9f6]"
                    )}
                  >
                    <button
                      onClick={() => openNotification(n)}
                      className="w-full text-left px-4 py-3 pr-9 hover:bg-[#f3f4f6] transition-colors"
                    >
                      <div className="flex items-start gap-2">
                        {!n.read && (
                          <span className="mt-1.5 h-2 w-2 rounded-full bg-[#319278] shrink-0" />
                        )}
                        <div className={cn("min-w-0", !n.read ? "" : "ml-4")}>
                          {notificationContextLabel(n.type) && (
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold mb-1",
                              notificationContext(n.type) === "professional"
                                ? "bg-[#EBF5FB] text-[#0077a8]"
                                : "bg-[#f3e8ff] text-[#7c3aed]"
                            )}>
                              {notificationContextLabel(n.type)}
                            </span>
                          )}
                          <p className="text-sm font-medium text-[#111827]">{n.title}</p>
                          <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
                          <p className="text-xs text-[#9ca3af] mt-1">
                            {formatRelativeTime(n.created_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => dismiss(e, n.id)}
                      className="absolute top-2 right-2 p-1 rounded-md text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors"
                      aria-label="Descartar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer — open the Notifications tab inside the user's own panel */}
          <a
            href={allNotificationsHref}
            className="block text-center px-4 py-2.5 border-t border-[#f3f4f6] text-sm font-medium text-[#009FD9] hover:bg-[#f9fafb] transition-colors"
          >
            Ver todas
          </a>
        </div>
      )}
    </div>
  );
}
