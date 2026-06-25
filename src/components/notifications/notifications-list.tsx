"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Bell, CheckCheck, Check, Trash2, AlertTriangle } from "lucide-react";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { notificationHref, notificationInMode } from "@/lib/notification-link";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
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

// ONE consistent notification icon everywhere — the Bell, matching the panel-nav
// "Notificaciones" item + the navbar bell (sprint 500). Replaces the per-type icons:
// the kind of notification is already clear from its title/text, and a single shared
// icon reads as "this is your notifications", consistent across the app.

// Shared notifications list — used by the dedicated /notificaciones page and the
// professional panel tab so both roles get the same notifications experience.
export function NotificationsList() {
  const { user } = useAuth();
  const t = useTranslations("notifications");
  const locale = useLocale();
  // Per-mode (Airbnb full switch): the panel tab shows ONLY the active mode's
  // notifications, matching the navbar bell.
  const { mode } = useMode(canOffer(user));
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => { setItems(data ?? []); setBusy(false); });
  }, [user]);

  // Only the active mode's notifications are shown / acted on here.
  const visible = items.filter((n) => notificationInMode(n.type, mode));
  const unread = visible.filter((n) => !n.read).length;
  // NO "todas / no leídas" filter (sprint 516): it added a tab row of clutter without
  // real value — unread is already conveyed by the row highlight + dot + "Marcar todas
  // como leídas", the list is mode-scoped + short, and each title makes its type obvious.

  async function markAllRead() {
    if (!user) return;
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  async function markOneRead(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  const role = user?.user_metadata?.role as string | undefined;

  function open(n: Notification) {
    if (!n.read) {
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    }
    window.location.assign(notificationHref(n, role));
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== id));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  async function doDeleteAll() {
    setConfirmDelete(false);
    if (!user || visible.length === 0) return;
    // Delete only the CURRENT mode's notifications (the list is per-mode).
    const ids = visible.map((n) => n.id);
    setItems((prev) => prev.filter((n) => !ids.includes(n.id)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
    const supabase = createClient();
    await supabase.from("notifications").delete().in("id", ids);
  }

  return (
    <div>
      {visible.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline">
              <CheckCheck className="h-4 w-4" /> {t("markAllRead")}
            </button>
          )}
          <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-sm text-red-500 hover:underline">
            <Trash2 className="h-4 w-4" /> {t("deleteAll")}
          </button>
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl text-center">
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
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {busy ? (
          <div className="py-16 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-10 w-10 text-[#e5e7eb] mx-auto mb-3" />
            <p className="text-sm text-[#6b7280]">{t("noneList")}</p>
          </div>
        ) : (
          <ul>
            {visible.map((n) => {
              return (
              <li key={n.id} className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f3f9fd]")}>
                <button onClick={() => open(n)} className="w-full text-left px-4 py-3 pr-16 hover:bg-[#f9fafb] transition-colors">
                  {/* Per-type leading icon (grey circle) + a brand-blue unread dot at its corner. */}
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151]">
                        <NotificationSourceIcon type={n.type} className="h-4 w-4" />
                      </span>
                      {!n.read && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#009FD9] ring-2 ring-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* overflow-wrap:anywhere breaks long unbroken strings; line-clamp keeps
                          every row a uniform, compact height (full text on open). */}
                      <p className={cn("text-sm [overflow-wrap:anywhere] line-clamp-2", n.read ? "font-medium text-[#374151]" : "font-semibold text-[#162543]")}>{n.title}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5 [overflow-wrap:anywhere] line-clamp-2">{n.message}</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{formatRelativeOrDate(n.created_at, locale)}</p>
                    </div>
                  </div>
                </button>
                {/* Two distinct actions, intentionally different icons so they're
                    never read as accept/reject: ✓ = mark as read, 🗑 = delete. */}
                <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
                  {!n.read && (
                    <button onClick={(e) => markOneRead(e, n.id)} className="p-1 rounded-md text-[#9ca3af] hover:bg-[#dcfce7] hover:text-[#15803d] transition-colors" aria-label={t("markRead")} title={t("markRead")}>
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={(e) => dismiss(e, n.id)} className="p-1 rounded-md text-[#9ca3af] hover:bg-red-50 hover:text-red-500 transition-colors" aria-label={t("delete")} title={t("delete")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
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
