"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, ArrowRight, CheckCheck } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationInMode } from "@/lib/notification-link";
import { cacheNotifications, readCachedNotifications, uniqueNotifications } from "@/lib/notifications-cache";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";
import { cn, formatRelativeOrDate } from "@/lib/utils";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string } | null;
};

export function NotificationBell({ scope = "all" }: { scope?: "all" | "use" | "offer" }) {
  const { user, notificationUnread } = useAuth();
  const router = useRouter();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [notificationState, setNotificationState] = useState(() => ({
    userId: user?.id,
    items: [] as Notification[],
  }));
  const [hasSyncedNotifications, setHasSyncedNotifications] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const notifications = useMemo(
    () => notificationState.userId === user?.id ? notificationState.items : readCachedNotifications(user?.id) ?? [],
    [notificationState, user?.id],
  );

  const updateNotifications = useCallback((updater: (prev: Notification[]) => Notification[]) => {
    setHasSyncedNotifications(true);
    setNotificationState((prev) => {
      const base = prev.userId === user?.id ? prev.items : readCachedNotifications(user?.id) ?? [];
      return { userId: user?.id, items: updater(base) };
    });
  }, [user?.id]);

  const visible = scope === "all" ? notifications : notifications.filter((n) => notificationInMode(n.type, scope));
  const cachedUnreadCount = visible.filter((n) => !n.read).length;
  const serverUnreadCount = scope === "offer"
    ? notificationUnread.offer + notificationUnread.neutral
    : scope === "use"
      ? notificationUnread.use + notificationUnread.neutral
      : notificationUnread.offer + notificationUnread.use + notificationUnread.neutral;
  const unreadCount = Math.max(cachedUnreadCount, serverUnreadCount);
  const previewItems = visible.slice(0, 4);

  const fetchNotifications = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const next = uniqueNotifications(data ?? []);
        setNotificationState({ userId: user.id, items: next });
        cacheNotifications(user.id, next);
        setHasSyncedNotifications(true);
      });
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      const cached = readCachedNotifications(user?.id);
      setNotificationState({ userId: user?.id, items: cached ?? [] });
      setHasSyncedNotifications(cached !== null);
    });
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    cacheNotifications(user?.id, notifications);
  }, [notifications, user?.id]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          updateNotifications((prev) => uniqueNotifications([payload.new as Notification, ...prev]));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as Notification;
          updateNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const deleted = payload.old as Pick<Notification, "id">;
          updateNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications, instanceId, updateNotifications]);

  useEffect(() => {
    function onChanged() { fetchNotifications(); }
    window.addEventListener("notificationsChanged", onChanged);
    return () => window.removeEventListener("notificationsChanged", onChanged);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  if (!user) return null;

  const openNotifications = () => {
    setMenuOpen(false);
    router.push(`/${locale}/notificaciones`);
  };

  async function markAllRead() {
    if (!user) return;
    const ids = visible.filter((item) => !item.read).map((item) => item.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    updateNotifications((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setMenuOpen((next) => !next)}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
        aria-label={t("title")}
        aria-expanded={menuOpen}
      >
        <span className="relative inline-flex">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-11 z-[90] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-[#dbe4ee] bg-white shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)]">
          <div className="flex items-center justify-between gap-3 border-b border-[#eef2f6] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-[#111827]">{t("title")}</p>
              <p className="mt-0.5 text-xs font-semibold text-[#64748b]">
                {unreadCount > 0
                  ? locale === "en" ? `${unreadCount} unread` : `${unreadCount} sin leer`
                  : locale === "en" ? "No unread notifications" : "Sin notificaciones sin leer"}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#eef9fd] px-2.5 text-[11px] font-bold text-[#0089bb] transition hover:bg-[#dff4fc] sm:px-3 sm:text-xs"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {locale === "en" ? "Mark read" : "Marcar leídas"}
              </button>
            )}
          </div>

          {previewItems.length > 0 ? (
            <div className="max-h-[18rem] overflow-y-auto py-1">
              {previewItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={openNotifications}
                  className={cn(
                    "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#f5fbfe]",
                    !item.read && "bg-[#f8fcff]",
                  )}
                >
                  <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full", item.read ? "bg-[#f1f5f9] text-[#64748b]" : "bg-[#e8f8fe] text-[#009FD9]")}>
                    <NotificationSourceIcon type={item.type} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-start gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#111827]">{item.title}</span>
                      {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#009FD9]" />}
                    </span>
                    <span className="mt-0.5 line-clamp-2 text-xs leading-snug text-[#64748b]">{item.message}</span>
                    <span className="mt-1 block text-[11px] font-semibold text-[#94a3b8]">{formatRelativeOrDate(item.created_at, locale)}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#eef7fb] text-[#009FD9]">
                <Bell className="h-5 w-5" />
              </div>
              <p className="mt-3 text-sm font-bold text-[#111827]">
                {locale === "en" ? "No notifications yet" : "Aún no tienes notificaciones"}
              </p>
              <p className="mx-auto mt-1 max-w-[15rem] text-xs leading-snug text-[#64748b]">
                {locale === "en"
                  ? "When something important happens, it will appear here."
                  : "Cuando pase algo importante, aparecerá aquí."}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={openNotifications}
            className="flex w-full items-center justify-between border-t border-[#eef2f6] px-4 py-3 text-left text-sm font-bold text-[#1A2744] transition hover:bg-[#f5fbfe] hover:text-[#009FD9]"
          >
            <span>{locale === "en" ? "View all notifications" : "Ver todas las notificaciones"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
