"use client";

import { useEffect, useRef } from "react";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";

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

  useEffect(() => {
    if (loading || !user) {
      activeRef.current = false;
      return;
    }

    if (!isNativeMobile()) {
      return;
    }

    if (activeRef.current) return;
    activeRef.current = true;

    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
    const controller: Array<() => Promise<void> | void> = [];

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

    const init = async () => {
      try {
        const hasPermissions = await PushNotifications.checkPermissions();
        if (hasPermissions.receive !== "granted") {
          const requestResult = await PushNotifications.requestPermissions();
          if (requestResult.receive !== "granted") return;
        }

        const regListener = await PushNotifications.addListener("registration", (token) => {
          void onToken(token);
        });
        const errListener = await PushNotifications.addListener("registrationError", onError);
        const actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const rawUrl = event.notification.data?.url;
          if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return;
          router.push(rawUrl);
        });

        controller.push(() => regListener.remove());
        controller.push(() => errListener.remove());
        controller.push(() => actionListener.remove());

        await PushNotifications.register();
      } catch (error) {
        console.error("[push] init failed", error);
      }
    };

    void init();

    return () => {
      while (controller.length) {
        const remove = controller.pop();
        void remove?.();
      }
      activeRef.current = false;
    };
  }, [user, loading, router]);

  return null;
}
