"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { Bell, X } from "lucide-react";
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

export function PushTokenManager() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const activeRef = useRef(false);
  const removersRef = useRef<Array<() => Promise<void> | void>>([]);
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
      const actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
        const rawUrl = event.notification.data?.url;
        if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return;
        router.push(rawUrl);
      });

      removersRef.current.push(() => regListener.remove());
      removersRef.current.push(() => errListener.remove());
      removersRef.current.push(() => actionListener.remove());

      await PushNotifications.register();
    } catch (error) {
      activeRef.current = false;
      console.error("[push] init failed", error);
    }
  }, [router, user]);

  const requestNotifications = useCallback(async () => {
    if (!user || !isNativeMobile()) return;
    setRequesting(true);
    try {
      const result = await PushNotifications.requestPermissions();
      if (result.receive === "granted") {
        setPromptVisible(false);
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
    if (loading || !user) {
      cleanupListeners();
      return;
    }

    if (!isNativeMobile()) return;

    let cancelled = false;

    const init = async () => {
      try {
        const permissions = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (permissions.receive === "granted") {
          setPromptVisible(false);
          await registerCurrentDevice();
          return;
        }
        const dismissed = dismissKey ? window.localStorage.getItem(dismissKey) === "1" : false;
        setPromptVisible(!dismissed);
      } catch (error) {
        console.error("[push] permission check failed", error);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [cleanupListeners, dismissKey, loading, registerCurrentDevice, user]);

  useEffect(() => cleanupListeners, [cleanupListeners]);

  if (!promptVisible || !user || !isNativeMobile()) return null;

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
