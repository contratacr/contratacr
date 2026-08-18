"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { Bell, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { AccountSignOutDetail } from "@/lib/auth/sign-out";

function isNativeMobile() {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android";
}
type PushTokenPayload = {
  token: string;
  platform: "android" | "ios";
  deviceId?: string;
  appVersion?: string;
};

const TOKEN_POST_RETRY_DELAYS_MS = [0, 750, 2_500] as const;

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const cancel = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(true);
    }, delayMs);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function safePostToken(payload: PushTokenPayload, signal: AbortSignal) {
  for (let attempt = 0; attempt < TOKEN_POST_RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal.aborted) return false;
    const delay = TOKEN_POST_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0 && !await waitForRetry(delay, signal)) return false;

    try {
      const response = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      if (response.ok) return true;

      const retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      if (!retryable) return false;
    } catch {
      // The last failure returns false; registration is retried on the next
      // native startup because a failed token is never cached as acknowledged.
    }
  }
  return false;
}

function normalizePushUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return null;
  return rawUrl.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

function promptSessionKey(userId: string) {
  return `ccr:push-permission-context-shown:v3:${userId}`;
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
  const signingOutRef = useRef(false);
  const registeredTokenRef = useRef<string | null>(null);
  const registrationAbortRef = useRef<AbortController | null>(null);
  const registrationTaskRef = useRef<Promise<boolean> | null>(null);
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

  // Version the contextual decision independently from the OS permission.
  // Older builds asked at a different point in the journey, so their dismissal
  // must not suppress the improved post-login explanation.
  const dismissKey = user ? `ccr:push-permission-context-dismissed:v3:${user.id}` : null;

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
      if (signingOutRef.current) return;
      registeredTokenRef.current = token.value;

      // Capacitor exposes the APNs device token on iOS. The backend currently
      // sends through FCM, so this value must never be mislabeled as FCM.
      if (platform === "ios") return;

      registrationAbortRef.current?.abort();
      const controller = new AbortController();
      registrationAbortRef.current = controller;
      const task = safePostToken({
        token: token.value,
        platform,
        deviceId: Capacitor.getPlatform(),
        appVersion: navigator.userAgent?.slice(0, 64),
      }, controller.signal);
      registrationTaskRef.current = task;
      await task;
      if (registrationTaskRef.current === task) registrationTaskRef.current = null;
      if (registrationAbortRef.current === controller) registrationAbortRef.current = null;
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
      queueMicrotask(() => {
        if (!cancelled) setPromptVisible(false);
      });
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
          promptTimerRef.current = setTimeout(() => {
            if (cancelled) return;
            window.sessionStorage.setItem(promptSessionKey(user.id), "1");
            setPromptVisible(true);
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

  useEffect(() => {
    if (!user) return;
    signingOutRef.current = false;
    const deactivate = (rawEvent: Event) => {
      signingOutRef.current = true;
      registrationAbortRef.current?.abort();
      const token = registeredTokenRef.current;
      const work = (async () => {
        await registrationTaskRef.current?.catch(() => false);
        let backendRevoked = !token;
        if (token) {
          try {
            const response = await fetch("/api/push/register", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
              keepalive: true,
            });
            backendRevoked = response.ok;
          } catch {
            backendRevoked = false;
          }
        }
        await PushNotifications.unregister().catch(() => undefined);
        if (!backendRevoked) return;
        registeredTokenRef.current = null;
        // Preserve legacy token caches if backend revocation failed so a later
        // authenticated session can retry instead of forgetting an active row.
        for (const platform of ["android", "ios"] as const) {
          window.localStorage.removeItem(`ccr:push-token-registered:v2:${user.id}:${platform}`);
          window.localStorage.removeItem(`ccr:push-token:${user.id}:${platform}`);
        }
      })();
      const event = rawEvent as CustomEvent<AccountSignOutDetail>;
      event.detail?.waitUntil(work);
    };
    window.addEventListener("contratacr:signing-out", deactivate);
    return () => window.removeEventListener("contratacr:signing-out", deactivate);
  }, [user]);

  if (loading || !promptVisible || !user || !isNativeMobile()) return null;

  const copy = "Recibe avisos de mensajes, solicitudes, propuestas, reseñas y cambios importantes sin tener que abrir la app.";

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 flex items-end justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+86px)] sm:items-end sm:justify-end sm:p-5"
      style={{ zIndex: 100000 }}
      role="presentation"
    >
      <div
        className="pointer-events-auto w-full max-w-sm rounded-2xl border border-[#dbeafe] bg-white p-4 shadow-[0_24px_70px_-22px_rgba(15,23,42,0.45)]"
        role="dialog"
        aria-modal="false"
        aria-labelledby="push-permission-title"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#EBF5FB] text-[#009FD9]">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <p id="push-permission-title" className="text-sm font-extrabold text-[#162543]">Activa notificaciones</p>
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
    </div>,
    document.body,
  );
}
