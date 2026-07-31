"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationInMode } from "@/lib/notification-link";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { cacheNotifications, readCachedNotifications, uniqueNotifications } from "@/lib/notifications-cache";

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
  const unreadCount = hasSyncedNotifications ? cachedUnreadCount : serverUnreadCount;

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

  if (!user) return null;

  const openNotifications = () => {
    router.push(`/${locale}/notificaciones`);
  };

  return (
    <AppTooltip label={t("title")}>
      <button
        onClick={openNotifications}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
        aria-label={t("title")}
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
    </AppTooltip>
  );
}
