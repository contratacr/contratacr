"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { Bell, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function isNativeMobile() {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android";
}

function safePostToken(payload: { token: string; platform: "android" | "ios"; deviceId?: string; appVersion?: string }) {
  return fetch("/api/push/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).catch(() => null);
}

function normalizePushUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return null;
  return rawUrl.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

function promptSessionKey(userId: string) {
  return `ccr:push-permission-shown:${userId}`;
}

function permissionGrantedKey(userId: string) {
  return `ccr:push-permission-granted:${userId}`;
}

function normalizePathname(pathname: string | null) {
  return (pathname ?? "/").replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

function canShowPermissionPrompt(pathname: string | null) {
  const path = normalizePathname(pathname);
  if (
    path.startsWith("/login") ||
    path.startsWith("/registro") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/olvide-contrasena") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/completar-perfil") ||
    path.startsWith("/auth/")
  ) {
    return false;
  }
  return true;
}

function promptDelayForPath(pathname: string | null) {
  const path = normalizePathname(pathname);
  if (path.startsWith("/dashboard")) return 1800;
  return 1200;
}

export function PushTokenManager() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const activeRef = useRef(false);
  const removersRef = useRef<Array<() => Promise<void> | void>>([]);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [promptVisible, setPromptVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const cleanupListeners = useCallback(() => {
    while (removersRef.current.length) {
      const remove = removersRef.current.pop();
      void remove?.();
    }
    activeRef.current = false;
  }, []);

  const dismissKey = user ? `ccr:push-permission-dismissed:${user.id}` : null;

  useEffect(() => {
    if (!isNativeMobile()) return;
    let cancelled = false;
    let removeAction: (() => Promise<void> | void) | null = null;

    const initActionListener = async () => {
      try {
        const actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const href = normalizePushUrl(event.notification.data?.url);
          if (!href) return;
          window.sessionStorage.setItem("ccr:pending-push-url", href);
          router.push(href);
        });
        if (cancelled) {
          void actionListener.remove();
          return;
        }
        removeAction = () => actionListener.remove();
      } catch (error) {
        console.error("[push] action listener failed", error);
      }
    };

    void initActionListener();

    return () => {
      cancelled = true;
      void removeAction?.();
    };
  }, [router]);

  const registerCurrentDevice = useCallback(async () => {
    if (!user || !isNativeMobile() || activeRef.current) return;
    activeRef.current = true;

    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";

    const onToken = async (token: Token) => {
      const key = `ccr:push-token:${user.id}:${platform}`;
      if (typeof window !== "undefined") {
        const previous = window.localStorage.getItem(key);
        if (previous === token.value) return;
        window.localStorage.setItem(key, token.value);
      }
      await safePostToken({ token: token.value, platform, deviceId: Capacitor.getPlatform(), appVersion: navigator.userAgent?.slice(0, 64) });
    };

    const onError = (error: unknown) => {
      console.error("[push] registration error", error);
    };

    try {
      const regListener = await PushNotifications.addListener("registration", (token) => {
        void onToken(token);
      });
      const errListener = await PushNotifications.addListener("registrationError", onError);

      removersRef.current.push(() => regListener.remove());
      removersRef.current.push(() => errListener.remove());

      await PushNotifications.register();
    } catch (error) {
      activeRef.current = false;
      console.error("[push] init failed", error);
    }
  }, [user]);

  const requestNotifications = useCallback(async () => {
    if (!user || !isNativeMobile()) return;
    setRequesting(true);
    try {
      const result = await PushNotifications.requestPermissions();
      if (result.receive === "granted") {
        setPromptVisible(false);
        window.localStorage.setItem(permissionGrantedKey(user.id), "1");
        if (dismissKey) window.localStorage.removeItem(dismissKey);
        await registerCurrentDevice();
      }
    } catch (error) {
      console.error("[push] permission request failed", error);
    } finally {
      setRequesting(false);
    }
  }, [dismissKey, registerCurrentDevice, user]);

  const dismissPrompt = useCallback(() => {
    setPromptVisible(false);
    if (dismissKey) window.localStorage.setItem(dismissKey, "1");
  }, [dismissKey]);

  useEffect(() => {
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    if (loading || !user) {
      cleanupListeners();
      return;
    }

    if (!isNativeMobile() || !canShowPermissionPrompt(pathname)) return;

    let cancelled = false;
    const grantedKey = permissionGrantedKey(user.id);

    // Do not flash the prompt while the native bridge verifies a permission that
    // this user has already granted on this installation.
    if (window.localStorage.getItem(grantedKey) === "1") {
      setPromptVisible(false);
    }

    const init = async () => {
      try {
        const permissions = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (permissions.receive === "granted") {
          setPromptVisible(false);
          window.localStorage.setItem(grantedKey, "1");
          if (dismissKey) window.localStorage.removeItem(dismissKey);
          await registerCurrentDevice();
          return;
        }
        window.localStorage.removeItem(grantedKey);
        const dismissed = dismissKey ? window.localStorage.getItem(dismissKey) === "1" : false;
        const shownThisSession = window.sessionStorage.getItem(promptSessionKey(user.id)) === "1";
        if (dismissed) {
          setPromptVisible(false);
          return;
        }
        if (!shownThisSession) {
          window.sessionStorage.setItem(promptSessionKey(user.id), "1");
          promptTimerRef.current = setTimeout(() => {
            if (!cancelled) setPromptVisible(true);
          }, promptDelayForPath(pathname));
        }
      } catch (error) {
        console.error("[push] permission check failed", error);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
    };
  }, [cleanupListeners, dismissKey, loading, pathname, registerCurrentDevice, user]);

  useEffect(() => {
    if (loading || !user || !isNativeMobile()) return;
    const pendingHref = normalizePushUrl(window.sessionStorage.getItem("ccr:pending-push-url"));
    if (!pendingHref) return;
    window.sessionStorage.removeItem("ccr:pending-push-url");
    router.push(pendingHref);
  }, [loading, router, user]);

  useEffect(() => cleanupListeners, [cleanupListeners]);

  if (loading || !promptVisible || !user || !isNativeMobile()) return null;

  const professional = user.user_metadata?.is_provider === true;
  const copy = professional
    ? "Activa notificaciones para enterarte cuando un cliente te escriba o aparezcan oportunidades para tus servicios."
    : "Activa notificaciones para enterarte cuando un profesional te responda o tengas novedades en tus solicitudes.";

  return (
    <div className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+86px)] z-[95] sm:left-auto sm:right-5 sm:max-w-sm">
      <div className="rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-[0_18px_50px_-20px_rgba(15,23,42,0.35)]">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#EBF5FB] text-[#009FD9]">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p className="text-sm font-extrabold text-[#162543]">Activa notificaciones</p>
              <button
                type="button"
                onClick={dismissPrompt}
                aria-label="Cerrar"
                className="ml-auto rounded-full p-1 text-[#64748b] hover:bg-[#f4f7fa] hover:text-[#162543]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-sm leading-snug text-[#475569]">{copy}</p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={requestNotifications}
                disabled={requesting}
                className={cn(
                  "rounded-full bg-[#009FD9] px-4 py-2 text-sm font-extrabold text-white shadow-sm transition-colors hover:bg-[#0089BB]",
                  requesting && "cursor-wait opacity-70",
                )}
              >
                {requesting ? "Activando..." : "Activar"}
              </button>
              <button
                type="button"
                onClick={dismissPrompt}
                className="rounded-full px-4 py-2 text-sm font-bold text-[#64748b] hover:bg-[#f4f7fa] hover:text-[#162543]"
              >
                Ahora no
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
