"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Bell, CheckCheck, Check, Trash2, Briefcase, ShoppingBag, LifeBuoy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatRelativeTime } from "@/lib/utils";
import { notificationHref, notificationContext } from "@/lib/notification-link";

// Distinguish the TWO sides an account can act on — offering services
// (professional) vs contracting (client) — plus support, with a quiet ICON cue,
// NOT a literal "Como cliente/profesional" label. The title/message carry the rest.
function contextMeta(type: string): { Icon: typeof Briefcase; cls: string } {
  const ctx = notificationContext(type);
  if (ctx === "professional") return { Icon: Briefcase, cls: "bg-[#EBF5FB] text-[#0077a8]" };
  if (ctx === "client") return { Icon: ShoppingBag, cls: "bg-[#f3e8ff] text-[#7c3aed]" };
  if (ctx === "support") return { Icon: LifeBuoy, cls: "bg-[#dcfce7] text-[#15803d]" };
  return { Icon: Bell, cls: "bg-[#f3f4f6] text-[#6b7280]" };
}

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: { link?: string } | null;
};

// Shared notifications list — used by the dedicated /notificaciones page and the
// professional panel tab so both roles get the same notifications experience.
export function NotificationsList() {
  const { user } = useAuth();
  const t = useTranslations("notifications");
  const [items, setItems] = useState<Notification[]>([]);
  const [busy, setBusy] = useState(true);

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

  const unread = items.filter((n) => !n.read).length;

  async function markAllRead() {
    if (!user) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
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

  async function deleteAll() {
    if (!user || items.length === 0) return;
    if (!window.confirm(t("deleteAllConfirm"))) return;
    setItems([]);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("user_id", user.id);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="flex justify-end items-center gap-4 mb-3">
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline">
              <CheckCheck className="h-4 w-4" /> {t("markAllRead")}
            </button>
          )}
          <button onClick={deleteAll} className="flex items-center gap-1.5 text-sm text-red-500 hover:underline">
            <Trash2 className="h-4 w-4" /> {t("deleteAll")}
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {busy ? (
          <div className="py-16 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-10 w-10 text-[#e5e7eb] mx-auto mb-3" />
            <p className="text-sm text-[#6b7280]">{t("noneList")}</p>
          </div>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f0f9f6]")}>
                <button onClick={() => open(n)} className="w-full text-left px-4 py-3 pr-16 hover:bg-[#f9fafb] transition-colors">
                  <div className="flex items-start gap-3">
                    {(() => { const { Icon, cls } = contextMeta(n.type); return (
                      <span className={cn("relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", cls)}>
                        <Icon className="h-4 w-4" />
                        {!n.read && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[#319278] ring-2 ring-white" />}
                      </span>
                    ); })()}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#111827]">{n.title}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{formatRelativeTime(n.created_at)}</p>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
