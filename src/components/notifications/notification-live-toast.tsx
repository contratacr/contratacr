"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
import { notificationHref, notificationInMode } from "@/lib/notification-link";
import { TRANSLATED_NOTIFICATION_TYPES } from "@/lib/localized-notification";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string } | null;
};

export function NotificationLiveToast() {
  const { user } = useAuth();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const { mode } = useMode(canOffer(user));
  const [toast, setToast] = useState<Notification | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const initializedRef = useRef(false);
  const cooldownUntilRef = useRef(0);
  const pendingToastTimerRef = useRef<number | null>(null);

  const maybeShow = useCallback((next: Notification, showInitial = true) => {
    if (!notificationInMode(next.type, mode)) return;
    if (lastSeenIdRef.current === next.id) return;
    lastSeenIdRef.current = next.id;
    if (!initializedRef.current && !showInitial) {
      initializedRef.current = true;
      return;
    }
    initializedRef.current = true;
    const remainingCooldown = cooldownUntilRef.current - Date.now();
    if (remainingCooldown > 0) {
      if (pendingToastTimerRef.current) window.clearTimeout(pendingToastTimerRef.current);
      pendingToastTimerRef.current = window.setTimeout(() => {
        setToast(next);
        window.dispatchEvent(new CustomEvent("notificationsChanged"));
      }, remainingCooldown);
      return;
    }
    setToast(next);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }, [mode]);

  useEffect(() => {
    cooldownUntilRef.current = Date.now() + 900;
  }, [mode]);

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
        if (notificationInMode(latest.type, mode)) maybeShow(latest, false);
        else initializedRef.current = true;
      } else {
        initializedRef.current = true;
      }
    }
    void loadLatest();
    const id = window.setInterval(loadLatest, 3000);
    return () => window.clearInterval(id);
  }, [user, maybeShow]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 8000);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    return () => {
      if (pendingToastTimerRef.current) window.clearTimeout(pendingToastTimerRef.current);
    };
  }, []);

  if (!toast) return null;

  const title = TRANSLATED_NOTIFICATION_TYPES.has(toast.type) ? t(`types.${toast.type}`) : toast.title;
  const detailLabel = locale === "en" ? "View details" : "Ver detalles";

  async function openToast() {
    if (!toast) return;
    setToast(null);
    try {
      await createClient().from("notifications").update({ read: true }).eq("id", toast.id);
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    } catch {}
    window.location.assign(notificationHref(toast));
  }

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[180] sm:bottom-auto sm:left-auto sm:right-5 sm:top-20 sm:w-[360px]">
      <div className="rounded-2xl border border-[#d8e8f1] bg-white shadow-[0_18px_45px_-20px_rgba(15,23,42,0.35)]">
        <button type="button" onClick={openToast} className="flex w-full items-center gap-3 px-4 py-3 pr-10 text-left">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7FD] text-[#009FD9]">
            <NotificationSourceIcon type={toast.type} className="h-4 w-4" />
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
