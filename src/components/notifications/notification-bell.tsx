"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelativeTime } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { notificationHref, notificationInMode } from "@/lib/notification-link";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";

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
  const locale = useLocale();
  // Per-mode bell (Airbnb full switch): show ONLY the active mode's notifications
  // (professional ones in "offer", client ones in "use"; support/account ones in both).
  const { mode } = useMode(canOffer(user));
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  // A UNIQUE channel name per component instance. The navbar mounts the bell in
  // BOTH the default and compact header rows (and dashboards mount one too), so a
  // shared static name made the 2nd instance call `.channel("notifications")`,
  // get back Supabase's CACHED already-subscribed channel, and adding `.on()` to
  // it threw "cannot add postgres_changes callbacks after subscribe()" — crashing
  // the whole app via the error boundary. A unique topic gives each instance its
  // own channel, so handlers are always registered before subscribe().
  const instanceIdRef = useRef<string>(
    `nb-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
  );

  // Only the active mode's notifications drive the bell (list + unread badge).
  const visible = notifications.filter((n) => notificationInMode(n.type, mode));
  const unreadCount = visible.filter((n) => !n.read).length;

  // Re-pullable so the badge can refresh whenever notifications change anywhere
  // (the in-panel list marks read / deletes, another tab, etc.).
  const fetchNotifications = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setNotifications(data ?? []));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();

    fetchNotifications();

    // Real-time subscription. ALL `.on(...)` handlers are registered FIRST and
    // `.subscribe()` is called LAST, exactly once, on a per-instance unique
    // channel (so no other mounted bell shares/reuses this channel). We listen to
    // INSERT (new notification) AND UPDATE (read flag flipped elsewhere) so the
    // unread badge stays correct without a manual refresh.
    const channel = supabase
      .channel(`notifications-${user.id}-${instanceIdRef.current}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as Notification;
          setNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
        }
      )
      .subscribe();

    // Clean up on unmount / user change so the channel is removed exactly once
    // and never re-subscribed with stale handlers.
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications]);

  // Same-tab sync: other notification surfaces (the in-panel list) broadcast this
  // event after marking read / deleting; re-pull so the bell badge matches.
  useEffect(() => {
    function onChanged() { fetchNotifications(); }
    window.addEventListener("notificationsChanged", onChanged);
    return () => window.removeEventListener("notificationsChanged", onChanged);
  }, [fetchNotifications]);

  useEffect(() => {
    function handleClickOutside(e: Event) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleEsc);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  async function markAllRead() {
    if (!user) return;
    // Mark only the CURRENT mode's unread (the bell is per-mode now).
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  function openNotification(n: Notification) {
    setOpen(false);
    if (!n.read) {
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    }
    const role = user?.user_metadata?.role as string | undefined;
    window.location.assign(notificationHref(n, role));
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  if (!user) return null;

  // "Ver todas" opens the Notifications SECTION inside the ONE unified panel — it
  // shows the SAME active mode (no longer ambiguous: the bell is per-mode now).
  const allNotificationsHref = `/${locale}/dashboard/profesional?tab=notifications`;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
        aria-label={t("title")}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
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
            {visible.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-8 w-8 text-[#e5e7eb] mx-auto mb-2" />
                <p className="text-sm text-[#9ca3af]">{t("empty")}</p>
              </div>
            ) : (
              <ul>
                {visible.map((n) => (
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
                          {/* No role tag — the title/message already make the
                              context clear; clicking still routes correctly. */}
                          <p className="text-sm font-medium text-[#111827]">{n.title}</p>
                          <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
                          <p className="text-xs text-[#9ca3af] mt-1">
                            {formatRelativeTime(n.created_at, locale)}
                          </p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={(e) => dismiss(e, n.id)}
                      className="absolute top-2 right-2 p-1 rounded-md text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-red-500 transition-colors"
                      aria-label={t("delete")}
                      title={t("delete")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
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
            {t("viewAll")}
          </a>
        </div>
      )}
    </div>
  );
}
