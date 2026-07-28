"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, CheckCheck, Check, Trash2, AlertTriangle, MoreHorizontal } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { notificationActionHref, notificationInMode } from "@/lib/notification-link";
import { TRANSLATED_NOTIFICATION_TYPES } from "@/lib/localized-notification";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";
import { getNotificationProjectCreatedAt, useNotificationProjectTimes } from "@/hooks/use-notification-project-times";
import { PanelEmptyState, PanelSectionLoading } from "@/components/ui/content-loading";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { cacheNotifications, readCachedNotifications, uniqueNotifications } from "@/lib/notifications-cache";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: {
    link?: string;
    project_id?: string | null;
    project_created_at?: string | null;
    review_reason?: string | null;
  } | null;
};

// ONE consistent notification icon everywhere — the Bell, matching the panel-nav
// "Notificaciones" item + the navbar bell (sprint 500). Replaces the per-type icons:
// the kind of notification is already clear from its title/text, and a single shared
// icon reads as "this is your notifications", consistent across the app.

// Shared notifications list. The standalone /notificaciones page shows the full
// account history; the legacy panel tab can still scope by the active mode.
export function NotificationsList({ scope = "mode" }: { scope?: "mode" | "all" } = {}) {
  const { user } = useAuth();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  // Per-mode (Airbnb full switch): the panel tab shows ONLY the active mode's
  // notifications, matching the navbar bell.
  const { mode } = useMode(canOffer(user));
  const initialCache = readCachedNotifications(user?.id) as Notification[] | null;
  const [notificationState, setNotificationState] = useState(() => ({
    userId: user?.id,
    items: initialCache ?? [],
  }));
  const items = notificationState.userId === user?.id
    ? notificationState.items
    : (readCachedNotifications(user?.id) as Notification[] | null) ?? [];
  const [busy, setBusy] = useState(initialCache === null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [bulkMenuOpen, setBulkMenuOpen] = useState(false);
  const [itemMenuOpenId, setItemMenuOpenId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const projectTimes = useNotificationProjectTimes(items);

  const loadNotifications = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const next = uniqueNotifications(data ?? []);
        setNotificationState({ userId: user.id, items: next });
        cacheNotifications(user.id, next);
        setBusy(false);
      }, () => {
        // Keep any cached result visible if the refresh fails.
        setBusy(false);
      });
  }, [user]);

  useEffect(() => {
    const cached = readCachedNotifications(user?.id) as Notification[] | null;
    queueMicrotask(() => {
      setNotificationState({ userId: user?.id, items: cached ?? [] });
      setBusy(!!user && cached === null);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;
    function onChanged() { loadNotifications(); }
    function onVisible() {
      if (document.visibilityState === "visible") loadNotifications();
    }
    window.addEventListener("notificationsChanged", onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("notificationsChanged", onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-list-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadNotifications(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [instanceId, loadNotifications, user]);

  // Only the active mode's notifications are shown / acted on here.
  const visible = scope === "all" ? items : items.filter((n) => notificationInMode(n.type, mode));
  const unread = visible.filter((n) => !n.read).length;
  const notificationTitle = (n: Notification) =>
    n.type === "support_reply" || !TRANSLATED_NOTIFICATION_TYPES.has(n.type) ? n.title : t(`types.${n.type}`);
  const notificationMessage = (n: Notification) => {
    const fullReason = n.data?.review_reason?.trim();
    if (!fullReason) return n.message;
    if (/\bMotivo:/i.test(n.message)) return n.message.replace(/\bMotivo:[\s\S]*$/i, `Motivo: ${fullReason}`);
    if (/\bReason:/i.test(n.message)) return n.message.replace(/\bReason:[\s\S]*$/i, `Reason: ${fullReason}`);
    return n.message;
  };
  const notificationTime = (n: Notification) => {
    const projectCreatedAt = getNotificationProjectCreatedAt(n, projectTimes);
    return projectCreatedAt
      ? t("publishedAt", { time: formatRelativeOrDate(projectCreatedAt, locale) })
      : formatRelativeOrDate(n.created_at, locale);
  };
  // NO "todas / no leídas" filter (sprint 516): it added a tab row of clutter without
  // real value — unread is already conveyed by the row highlight + dot + "Marcar todas
  // como leídas", the list is mode-scoped + short, and each title makes its type obvious.

  async function markAllRead() {
    if (!user) return;
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    setBulkMenuOpen(false);
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setNotificationState((prev) => {
      const next = prev.items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n));
      cacheNotifications(user.id, next);
      return { userId: user.id, items: next };
    });
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  async function markOneRead(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItemMenuOpenId(null);
    setNotificationState((prev) => {
      const next = prev.items.map((n) => (n.id === id ? { ...n, read: true } : n));
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  const role = user?.user_metadata?.role as string | undefined;

  function open(n: Notification) {
    const href = notificationActionHref(n, role, locale);
    if (!n.read) {
      setNotificationState((prev) => {
        const next = prev.items.map((item) => (item.id === n.id ? { ...item, read: true } : item));
        cacheNotifications(user?.id, next);
        return { userId: user?.id, items: next };
      });
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {
        window.dispatchEvent(new CustomEvent("notificationsChanged"));
      });
    }
    if (href) router.push(href);
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItemMenuOpenId(null);
    setNotificationState((prev) => {
      const next = prev.items.filter((n) => n.id !== id);
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  async function doDeleteAll() {
    setConfirmDelete(false);
    setBulkMenuOpen(false);
    if (!user || visible.length === 0) return;
    // Delete only the CURRENT mode's notifications (the list is per-mode).
    const ids = visible.map((n) => n.id);
    setNotificationState((prev) => {
      const next = prev.items.filter((n) => !ids.includes(n.id));
      cacheNotifications(user.id, next);
      return { userId: user.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").delete().in("id", ids);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  return (
    <div className="ccr-notifications-list flex min-h-0 flex-1 flex-col">
      {visible.length > 0 && (
        <div className="ccr-notifications-toolbar relative mb-3 flex shrink-0 items-center justify-between gap-3 px-1 sm:justify-end sm:px-0">
          <div className="min-w-0 sm:hidden">
            <p className="text-sm font-semibold text-[#162543]">{t("title")}</p>
            {unread > 0 && (
              <p className="text-xs text-[#6b7280]">
                {unread} {locale === "en" ? "unread" : "sin leer"}
              </p>
            )}
          </div>
          {unread > 0 && (
            <button onClick={markAllRead} className="hidden min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-[#009FD9] hover:bg-[#eef8fc] sm:flex">
              <CheckCheck className="h-4 w-4" /> {t("markAllRead")}
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)} className="hidden min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-red-500 hover:bg-red-50 sm:flex">
            <Trash2 className="h-4 w-4" /> {t("deleteAll")}
          </button>
          <button
            type="button"
            onClick={() => setBulkMenuOpen((open) => !open)}
            className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dfe8f0] bg-white text-[#526174] shadow-sm hover:bg-[#f5f8fb] sm:hidden"
            aria-label={locale === "en" ? "Notification options" : "Opciones de notificaciones"}
            aria-expanded={bulkMenuOpen}
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {bulkMenuOpen && (
            <div className="absolute right-1 top-11 z-20 min-w-52 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-lg sm:hidden">
              {unread > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#009FD9] hover:bg-[#eef8fc]"
                >
                  <CheckCheck className="h-4 w-4" />
                  {t("markAllRead")}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setBulkMenuOpen(false);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {t("deleteAll")}
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center p-0 sm:items-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative z-10 w-full rounded-t-2xl bg-white p-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] text-center shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pb-6">
            <BrandIconBadge icon={AlertTriangle} tone="danger" size={56} className="mx-auto mb-4" />
            <h3 className="text-lg font-bold text-[#111827] mb-1.5">{t("deleteAllConfirm")}</h3>
            <p className="text-sm text-[#6b7280] mb-5">{t("deleteAllBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors">{t("cancel")}</button>
              <button onClick={doDeleteAll} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors">{t("deleteAll")}</button>
            </div>
          </div>
        </div>
      )}
      <div className="ccr-notifications-scroll min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white">
        {busy ? (
          <PanelSectionLoading
            className={scope === "all" ? "min-h-[calc(100dvh-13rem)] sm:min-h-[18rem]" : "min-h-[16rem] sm:min-h-[18rem]"}
          />
        ) : visible.length === 0 ? (
          <PanelEmptyState
            icon={Bell}
            title={t("noneList")}
            description={t("emptySub")}
            className={cn(
              "px-5 py-12",
              scope === "all"
                ? "min-h-[calc(100dvh-13rem)] sm:min-h-[18rem]"
                : "min-h-[16rem] sm:min-h-[18rem]",
            )}
          />
        ) : (
          <ul className="ccr-notifications-items">
            {visible.map((n) => {
              const message = notificationMessage(n);
              const canExpand = message.length > 180;
              const expanded = expandedIds.has(n.id);
              return (
              <li key={n.id} className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f3f9fd]")}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => open(n)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(n);
                    }
                  }}
                  className={cn(
                    "w-full text-left px-4 py-3 pr-16 transition-colors",
                    notificationActionHref(n, role, locale) ? "cursor-pointer hover:bg-[#f9fafb]" : "cursor-default",
                  )}
                >
                  {/* Per-type leading icon (grey circle) + a brand-blue unread dot at its corner. */}
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151]">
                        <NotificationSourceIcon type={n.type} className="h-4 w-4" />
                      </span>
                      {!n.read && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#009FD9] ring-2 ring-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm [overflow-wrap:anywhere] break-words line-clamp-2", n.read ? "font-medium text-[#374151]" : "font-semibold text-[#162543]")}>{notificationTitle(n)}</p>
                      <p className={cn(
                        "mt-0.5 whitespace-pre-line text-xs leading-snug text-[#6b7280] [overflow-wrap:anywhere] break-words",
                        !expanded && "line-clamp-3",
                      )}>{message}</p>
                      {canExpand && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedIds((current) => {
                              const next = new Set(current);
                              if (next.has(n.id)) next.delete(n.id);
                              else next.add(n.id);
                              return next;
                            });
                          }}
                          className="mt-1 text-xs font-semibold text-[#009FD9] hover:underline"
                        >
                          {expanded
                            ? (locale === "en" ? "Show less" : "Ver menos")
                            : (locale === "en" ? "Show more" : "Ver más")}
                        </button>
                      )}
                      <p className="text-xs text-[#9ca3af] mt-1">{notificationTime(n)}</p>
                    </div>
                  </div>
                </div>
                {/* Two distinct actions, intentionally different icons so they're
                    never read as accept/reject: ✓ = mark as read, 🗑 = delete. */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setItemMenuOpenId((current) => (current === n.id ? null : n.id));
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[#718096] hover:bg-[#eef3f8] sm:hidden"
                    aria-label={locale === "en" ? "Notification actions" : "Opciones de notificación"}
                    aria-expanded={itemMenuOpenId === n.id}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                  {itemMenuOpenId === n.id && (
                    <div
                      className="absolute right-0 top-9 z-20 min-w-44 rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-lg sm:hidden"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {!n.read && (
                        <button
                          type="button"
                          onClick={(event) => markOneRead(event, n.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-[#15803d] hover:bg-[#dcfce7]"
                        >
                          <Check className="h-4 w-4" />
                          {t("markRead")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => dismiss(event, n.id)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("delete")}
                      </button>
                    </div>
                  )}
                  {!n.read && (
                    <AppTooltip label={t("markRead")}>
                      <button onClick={(e) => markOneRead(e, n.id)} className="hidden rounded-md p-1 text-[#9ca3af] transition-colors hover:bg-[#dcfce7] hover:text-[#15803d] sm:flex" aria-label={t("markRead")}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </AppTooltip>
                  )}
                  <AppTooltip label={t("delete")}>
                    <button onClick={(e) => dismiss(e, n.id)} className="hidden rounded-md p-1 text-[#9ca3af] transition-colors hover:bg-red-50 hover:text-red-500 sm:flex" aria-label={t("delete")}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </AppTooltip>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
