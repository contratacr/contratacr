"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const { mode } = useMode(canOffer(user));
  const [toast, setToast] = useState<Notification | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`panel-notification-toast-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const next = payload.new as Notification;
          if (!notificationInMode(next.type, mode)) return;
          setToast(next);
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, mode]);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(id);
  }, [toast]);

  if (!toast) return null;

  const title = TRANSLATED_NOTIFICATION_TYPES.has(toast.type) ? t(`types.${toast.type}`) : toast.title;

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
        <button type="button" onClick={openToast} className="flex w-full items-start gap-3 px-4 py-3 text-left">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EAF7FD] text-[#009FD9]">
            <NotificationSourceIcon type={toast.type} className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#162543] line-clamp-1">{title}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-[#6b7280] line-clamp-2">{toast.message}</span>
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
