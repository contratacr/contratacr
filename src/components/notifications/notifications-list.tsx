"use client";

import { useEffect, useState } from "react";
import { Bell, CheckCheck, Check, X, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatRelativeTime } from "@/lib/utils";
import { notificationHref } from "@/lib/notification-link";

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
  }

  async function markOneRead(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  function open(n: Notification) {
    if (!n.read) {
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {});
    }
    window.location.assign(notificationHref(n));
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItems((prev) => prev.filter((n) => n.id !== id));
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
  }

  async function deleteAll() {
    if (!user || items.length === 0) return;
    if (!window.confirm("¿Eliminar todas tus notificaciones?")) return;
    setItems([]);
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("user_id", user.id);
  }

  return (
    <div>
      {items.length > 0 && (
        <div className="flex justify-end items-center gap-4 mb-3">
          {unread > 0 && (
            <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-[#009FD9] hover:underline">
              <CheckCheck className="h-4 w-4" /> Marcar todo leído
            </button>
          )}
          <button onClick={deleteAll} className="flex items-center gap-1.5 text-sm text-red-500 hover:underline">
            <Trash2 className="h-4 w-4" /> Eliminar todas
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
        {busy ? (
          <div className="py-16 flex justify-center"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-10 w-10 text-[#e5e7eb] mx-auto mb-3" />
            <p className="text-sm text-[#6b7280]">No tenés notificaciones.</p>
          </div>
        ) : (
          <ul>
            {items.map((n) => (
              <li key={n.id} className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f0f9f6]")}>
                <button onClick={() => open(n)} className="w-full text-left px-4 py-3 pr-16 hover:bg-[#f9fafb] transition-colors">
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-[#319278] shrink-0" />}
                    <div className={cn(!n.read ? "" : "ml-4")}>
                      <p className="text-sm font-medium text-[#111827]">{n.title}</p>
                      <p className="text-xs text-[#6b7280] mt-0.5">{n.message}</p>
                      <p className="text-xs text-[#9ca3af] mt-1">{formatRelativeTime(n.created_at)}</p>
                    </div>
                  </div>
                </button>
                <div className="absolute top-2.5 right-2.5 flex items-center gap-0.5">
                  {!n.read && (
                    <button onClick={(e) => markOneRead(e, n.id)} className="p-1 rounded-md text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#15803d] transition-colors" aria-label="Marcar leído" title="Marcar leído">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button onClick={(e) => dismiss(e, n.id)} className="p-1 rounded-md text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] transition-colors" aria-label="Eliminar" title="Eliminar">
                    <X className="h-3.5 w-3.5" />
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
