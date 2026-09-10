"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, X } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationActionHref, notificationInMode, notificationsCenterHref } from "@/lib/notification-link";
import { localizedNotificationCopy } from "@/lib/localized-notification";
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
// Una sola vez por apertura de la app: sin esto, cualquier recarga dura —y la
// app hace varias: después de entrar, al cambiar de panel— volvía a montar el
// componente y el resumen reaparecía a media sesión, que es lo que se veía
// como "sale al azar".
const RESUMEN_SESION_KEY = "ccr:push-summary-session:v1";
// Cuánto se queda cada aviso en pantalla. El vivo interrumpe algo que la
// persona está haciendo, así que es corto; el resumen de entrada es lo primero
// que ve al abrir y trae una acción, así que dura más.
const TOAST_VIVO_MS = 8_000;
const RESUMEN_ENTRADA_MS = 12_000;
// Pantallas donde un aviso flotante sobra: en las de acceso la sesión todavía
// se está resolviendo y la tarjeta alcanzaba a pintarse un instante antes de
// que la app saltara al panel; en el centro de notificaciones ya está todo.
function pantallaSinAvisos(pathname: string | null) {
  const ruta = (pathname ?? "/").replace(/^\/(?:es|en)(?=\/|$)/, "") || "/";
  return ruta.startsWith("/login")
    || ruta.startsWith("/registro")
    || ruta.startsWith("/onboarding")
    || ruta.startsWith("/completar-perfil")
    || ruta.startsWith("/auth")
    || ruta.startsWith("/reset-password")
    || ruta.startsWith("/olvide-contrasena")
    || ruta.startsWith("/notificaciones");
}

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
  const pathname = usePathname();
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
    if (pantallaSinAvisos(window.location.pathname)) return;
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
    if (pantallaSinAvisos(pathname)) return;
    if (summaryCheckedUserRef.current === userId) return;
    // Ya se comprobó en esta apertura de la app: no se vuelve a mirar aunque la
    // pantalla se recargue entera.
    try {
      if (window.sessionStorage.getItem(`${RESUMEN_SESION_KEY}:${userId}`) === "1") {
        summaryCheckedUserRef.current = userId;
        return;
      }
      window.sessionStorage.setItem(`${RESUMEN_SESION_KEY}:${userId}`, "1");
    } catch {
      /* sin almacenamiento de sesión se comprueba como antes */
    }
    summaryCheckedUserRef.current = userId;

    let canceled = false;
    async function checkNotificationsSinceLastSession() {
      const lastActiveAt = readLastActiveAt(userId);
      const checkedAt = new Date().toISOString();
      // A missing v2 baseline means this is the first visit after the tracking
      // correction. Establish it without presenting old unread items as new.
      if (lastActiveAt <= 0) {
        rememberLastActiveAt(userId, checkedAt);
        clearPostLoginParam();
        clearPostLoginPrompt();
        return;
      }
      try {
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
        if ((count ?? 0) > 0) {
          // Un respiro para que la pantalla termine de pintar: apareciendo sobre
          // la carga se lee como un parpadeo y no como un aviso.
          await wait(1200);
          if (canceled) return;
          setPostLoginUnreadCount(count ?? 0);
          // La marca NO se adelanta aquí: si se adelantaba y la tarjeta se
          // perdía (una navegación dura la borraba a media pantalla), el aviso
          // quedaba consumido sin que nadie lo viera. Se adelanta cuando la
          // tarjeta se cierra, sola o a mano.
          return;
        }
        rememberLastActiveAt(userId, checkedAt);
      } finally {
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
  }, [user, pathname, clearPostLoginParam, clearPostLoginPrompt]);

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
        .eq("read", false)
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
  }, [user, maybeShow, scope]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_VIVO_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  // El resumen de "mientras no estabas" se quedaba fijo hasta que alguien lo
  // tocara, tapando la parte de arriba del panel. Se retira solo, como el aviso
  // vivo, y con un poco más de tiempo por ser el primero que se ve al entrar.
  const cerrarResumen = useCallback(() => {
    setPostLoginUnreadCount(null);
    if (user) rememberLastActiveAt(user.id);
  }, [user]);

  useEffect(() => {
    if (postLoginUnreadCount === null) return;
    const id = window.setTimeout(cerrarResumen, RESUMEN_ENTRADA_MS);
    return () => window.clearTimeout(id);
  }, [postLoginUnreadCount, cerrarResumen]);

  useEffect(() => {
    return () => {
      if (pendingToastTimerRef.current) window.clearTimeout(pendingToastTimerRef.current);
      if (burstTimerRef.current) window.clearTimeout(burstTimerRef.current);
    };
  }, []);

  const toastTargetHref = toast
    ? toast.count > 1
      ? notificationsCenterHref(locale)
      : notificationActionHref(toast.latest, undefined, locale)
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
      <div className="fixed left-3 right-3 top-[calc(var(--ccr-native-header-height,4rem)+0.75rem)] z-[180] sm:left-auto sm:right-5 sm:top-20 sm:w-[360px]">
        <div className="rounded-2xl border border-[#d8e8f1] bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.35)]">
          <button type="button" onClick={() => {
            cerrarResumen();
            router.push(targetHref);
          }} className="flex w-full items-center gap-3 px-4 py-3 pr-10 text-left">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ccr-caja-icono-plana">
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
            onClick={cerrarResumen}
            className="absolute right-2 top-2 rounded-full p-1 text-[#68778d] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
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
  const latestCopy = localizedNotificationCopy(latest, locale);
  const title = grouped
    ? locale === "en"
      ? `${toast.count} new notifications`
      : `${toast.count} notificaciones nuevas`
    : latestCopy.title;
  const detailLabel = grouped
    ? locale === "en" ? "View notifications" : "Ver notificaciones"
    : toastTargetHref
      ? locale === "en" ? "View details" : "Ver detalles"
      : locale === "en" ? "Got it" : "Entendido";

  async function openToast() {
    if (!toast) return;
    setToast(null);
    try {
      if (user) await Promise.race([prefetchDashboardDataForNotification(user.id, latest.type), wait(320)]);
      if (!grouped) await createClient().from("notifications").update({ read: true }).eq("id", latest.id);
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    } catch {}
    if (toastTargetHref) router.push(toastTargetHref);
  }

  return (
    <div className="fixed left-3 right-3 top-[calc(var(--ccr-native-header-height,4rem)+0.75rem)] z-[180] sm:left-auto sm:right-5 sm:top-20 sm:w-[360px]">
      <div className="rounded-2xl border border-[#d8e8f1] bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.35)]">
        <button type="button" onClick={openToast} className="flex w-full items-center gap-3 px-4 py-3 pr-10 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full ccr-caja-icono-plana">
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
          className="absolute right-2 top-2 rounded-full p-1 text-[#68778d] transition-colors hover:bg-[#f3f4f6] hover:text-[#374151]"
          aria-label="Cerrar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
