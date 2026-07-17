"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationHref, notificationInMode, notificationsCenterHref } from "@/lib/notification-link";
import { TRANSLATED_NOTIFICATION_TYPES } from "@/lib/localized-notification";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";
import { prefetchDashboardDataForNotification } from "@/lib/dashboard-notification-prefetch";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string } | null;
};

type NotificationScope = "all" | "use" | "offer";
type ToastState = { latest: Notification; count: number };
const POST_LOGIN_PROMPT_KEY = "contratacr:post-login-prompt";
const LAST_ACTIVE_AT_KEY = "contratacr:last-active-at:v2";
const ACTIVE_HEARTBEAT_MS = 15_000;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function lastActiveStorageKey(userId: string) {
  return `${LAST_ACTIVE_AT_KEY}:${userId}`;
}

function readLastActiveAt(userId: string) {
  if (typeof window === "undefined") return 0;
  const value = window.localStorage.getItem(lastActiveStorageKey(userId));
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function rememberLastActiveAt(userId: string, value = new Date().toISOString()) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(lastActiveStorageKey(userId), value);
  } catch {
    /* ignore */
  }
}

export function NotificationLiveToast({ scope = "all" }: { scope?: NotificationScope }) {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [postLoginUnreadCount, setPostLoginUnreadCount] = useState<number | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const pendingToastTimerRef = useRef<number | null>(null);
  const burstTimerRef = useRef<number | null>(null);
  const burstQueueRef = useRef<Notification[]>([]);
  const summaryCheckedUserRef = useRef<string | null>(null);

  const clearPostLoginParam = useCallback(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("postLogin")) return;
    params.delete("postLogin");
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`,
    );
  }, []);

  const clearPostLoginPrompt = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(POST_LOGIN_PROMPT_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const flushBurst = useCallback(() => {
    if (burstTimerRef.current) {
      window.clearTimeout(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    const queue = burstQueueRef.current;
    burstQueueRef.current = [];
    if (queue.length === 0) return;
    setToast({ latest: queue[queue.length - 1], count: queue.length });
  }, []);

  const enqueueToast = useCallback((next: Notification) => {
    burstQueueRef.current = [...burstQueueRef.current, next].slice(-5);
    if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    burstTimerRef.current = window.setTimeout(flushBurst, 650);
  }, [flushBurst]);

  const maybeShow = useCallback((next: Notification, showInitial = true) => {
    if (scope !== "all" && !notificationInMode(next.type, scope)) return;
    if (lastSeenIdRef.current === next.id) return;
    lastSeenIdRef.current = next.id;
    if (!initializedRef.current && !showInitial) {
      initializedRef.current = true;
      return;
    }
    initializedRef.current = true;
    const remainingCooldown = cooldownUntilRef.current - Date.now();
    if (remainingCooldown > 0) {
      burstQueueRef.current = [...burstQueueRef.current, next].slice(-5);
      if (pendingToastTimerRef.current) window.clearTimeout(pendingToastTimerRef.current);
      pendingToastTimerRef.current = window.setTimeout(() => {
        flushBurst();
        window.dispatchEvent(new CustomEvent("notificationsChanged"));
      }, remainingCooldown + 650);
      return;
    }
    enqueueToast(next);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }, [enqueueToast, flushBurst, scope]);

  useEffect(() => {
    cooldownUntilRef.current = Date.now() + 900;
  }, [scope]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`panel-notification-toast-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          // A realtime notification arrived while this session was connected. It may
          // remain unread, but it must not be reported as having arrived while away
          // on the next login.
          rememberLastActiveAt(user.id);
          maybeShow(payload.new as Notification, true);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, maybeShow]);

  useEffect(() => {
    if (!user) {
      summaryCheckedUserRef.current = null;
      return;
    }
    const userId = user.id;
    if (summaryCheckedUserRef.current === userId) return;
    summaryCheckedUserRef.current = userId;

    let canceled = false;
    async function checkNotificationsSinceLastSession() {
      const lastActiveAt = readLastActiveAt(userId);
      const checkedAt = new Date().toISOString();
      try {
        // A missing v2 baseline means this is the first visit after the tracking
        // correction. Establish it without presenting old unread items as new.
        if (lastActiveAt <= 0) return;

        const supabase = createClient();
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("read", false)
          .gt("created_at", new Date(lastActiveAt).toISOString());
        if (canceled) return;
        if (error) {
          console.error("[notification-login-summary] failed to load new notifications:", error);
          return;
        }
        if ((count ?? 0) > 0) setPostLoginUnreadCount(count ?? 0);
      } finally {
        rememberLastActiveAt(userId, checkedAt);
        if (!canceled) {
          clearPostLoginParam();
          clearPostLoginPrompt();
        }
      }
    }

    void checkNotificationsSinceLastSession();
    return () => {
      canceled = true;
    };
  }, [user, clearPostLoginParam, clearPostLoginPrompt]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const rememberIfVisible = () => {
      if (document.visibilityState === "visible") rememberLastActiveAt(userId);
    };
    const rememberOnLeave = () => rememberLastActiveAt(userId);
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") rememberOnLeave();
    };

    const heartbeat = window.setInterval(rememberIfVisible, ACTIVE_HEARTBEAT_MS);
    window.addEventListener("pagehide", rememberOnLeave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(heartbeat);
      window.removeEventListener("pagehide", rememberOnLeave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      rememberOnLeave();
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    async function loadLatest() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const latest = data?.[0] as Notification | undefined;
      if (latest) {
        if (scope === "all" || notificationInMode(latest.type, scope)) maybeShow(latest, false);
        else initializedRef.current = true;
      } else {
        initializedRef.current = true;
      }
    }
    void loadLatest();
    const id = window.setInterval(loadLatest, 3000);
    return () => window.clearInterval(id);
  }, [user, maybeShow, scope]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (pendingToastTimerRef.current) window.clearTimeout(pendingToastTimerRef.current);
      if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    };
  }, []);

  const toastTargetHref = toast
    ? toast.count > 1
      ? notificationsCenterHref(locale)
      : notificationHref(toast.latest, undefined, locale)
    : null;

  useEffect(() => {
    if (toastTargetHref) router.prefetch(toastTargetHref);
    if (user && toast) prefetchDashboardDataForNotification(user.id, toast.latest.type);
  }, [router, toast, toastTargetHref, user]);

  if (postLoginUnreadCount !== null) {
    const unreadCount = postLoginUnreadCount;
    const title = locale === "en" ? `${unreadCount} new notifications` : `${unreadCount} notificaciones nuevas`;
    const postLoginMessage = locale === "en"
      ? `While you were away, ${unreadCount === 1 ? "1 notification arrived" : `${unreadCount} notifications arrived`}.`
      : `Mientras no estabas en la app ${unreadCount === 1 ? "llegó 1 notificación" : `llegaron ${unreadCount} notificaciones`}.`;
    const targetHref = notificationsCenterHref(locale);
    return (
      <div className="fixed bottom-24 left-3 right-3 z-[180] sm:bottom-auto sm:left-auto sm:right-5 sm:top-20 sm:w-[360px]">
        <div className="rounded-2xl border border-[#d8e8f1] bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.35)]">
          <button type="button" onClick={() => {
            setPostLoginUnreadCount(null);
            router.push(targetHref);
          }} className="flex w-full items-center gap-3 px-4 py-3 pr-10 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7FD] text-[#009FD9]">
              <Bell className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-[#162543] line-clamp-1">{title}</span>
              <span className="mt-0.5 block text-xs font-medium text-[#526277]">
                {postLoginMessage}
              </span>
              <span className="mt-1 inline-flex items-center text-xs font-bold text-[#009FD9]">
                {locale === "en" ? "View notifications" : "Ver notificaciones"}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPostLoginUnreadCount(null)}
            className="absolute right-2 top-2 rounded-full p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  }
  if (!toast) return null;

  const latest = toast.latest;
  const grouped = toast.count > 1;
  const title = grouped
    ? locale === "en"
      ? `${toast.count} new notifications`
      : `${toast.count} notificaciones nuevas`
    : latest.type === "support_reply" || !TRANSLATED_NOTIFICATION_TYPES.has(latest.type)
      ? latest.title
      : t(`types.${latest.type}`);
  const detailLabel = grouped
    ? locale === "en" ? "View notifications" : "Ver notificaciones"
    : locale === "en" ? "View details" : "Ver detalles";
  const targetHref = toastTargetHref ?? notificationsCenterHref(locale);

  async function openToast() {
    if (!toast) return;
    setToast(null);
    try {
      if (user) await Promise.race([prefetchDashboardDataForNotification(user.id, latest.type), wait(320)]);
      if (!grouped) await createClient().from("notifications").update({ read: true }).eq("id", latest.id);
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    } catch {}
    router.push(targetHref);
  }

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[180] sm:bottom-auto sm:left-auto sm:right-5 sm:top-20 sm:w-[360px]">
      <div className="rounded-2xl border border-[#d8e8f1] bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.35)]">
        <button type="button" onClick={openToast} className="flex w-full items-center gap-3 px-4 py-3 pr-10 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7FD] text-[#009FD9]">
            <NotificationSourceIcon type={latest.type} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#162543] line-clamp-1">{title}</span>
            <span className="mt-0.5 inline-flex items-center text-xs font-bold text-[#009FD9]">
              {detailLabel}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setToast(null)}
          className="absolute right-2 top-2 rounded-full p-1 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
