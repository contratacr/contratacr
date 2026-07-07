"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationHref, notificationInMode } from "@/lib/notification-link";
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

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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

  const isRecentPrompt = useCallback((userId: string) => {
    if (typeof window === "undefined") return false;
    try {
      const raw = window.localStorage.getItem(POST_LOGIN_PROMPT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { ts?: number; userId?: string };
      const ts = typeof parsed.ts === "number" ? parsed.ts : 0;
      if (Date.now() - ts > 5 * 60 * 1000) return false;
      if (parsed.userId && parsed.userId !== userId) return false;
      return true;
    } catch {
      return false;
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
          maybeShow(payload.new as Notification, true);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, maybeShow]);

  useEffect(() => {
    if (!user) return;
    const userId = user.id;
    const shouldShowLoginNotification =
      new URLSearchParams(window.location.search).get("postLogin") === "1" || isRecentPrompt(userId);
    if (!shouldShowLoginNotification) return;

    let canceled = false;
    async function checkUnread() {
      try {
        const supabase = createClient();
        const { count, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("read", false);
        if (canceled) return;
        if (error) {
          console.error("[notification-login-summary] failed to load unread count:", error);
          const fallback = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("read", false);
          if (!canceled) {
            const fallbackCount = (fallback.data?.length ?? 0) as number;
            if (fallbackCount > 0) setPostLoginUnreadCount(fallbackCount);
          }
          return;
        }
        if ((count ?? 0) > 0) {
          setPostLoginUnreadCount(count ?? 0);
        }
      } finally {
        if (!canceled) {
          clearPostLoginParam();
          clearPostLoginPrompt();
        }
      }
    }

    void checkUnread();
    return () => {
      canceled = true;
    };
  }, [user, clearPostLoginParam, clearPostLoginPrompt, isRecentPrompt]);

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
      ? `/${locale}/notificaciones`
      : notificationHref(toast.latest, undefined, locale)
    : null;

  useEffect(() => {
    if (toastTargetHref) router.prefetch(toastTargetHref);
    if (user && toast) prefetchDashboardDataForNotification(user.id, toast.latest.type);
  }, [router, toast, toastTargetHref, user]);

  if (postLoginUnreadCount !== null) {
    const unreadCount = postLoginUnreadCount;
    const title = locale === "en" ? `${unreadCount} new notifications` : `${unreadCount} notificaciones nuevas`;
    const targetHref = `/${locale}/notificaciones`;
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
              <span className="mt-0.5 block text-xs font-medium text-[#009FD9]">
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
  const targetHref = toastTargetHref ?? `/${locale}/notificaciones`;

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
            <span className="mt-0.5 block text-xs font-medium text-[#009FD9]">{detailLabel}</span>
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
