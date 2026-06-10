"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LifeBuoy, ArrowLeft, Send, User, Shield, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

type Ticket = {
  id: string;
  subject: string;
  topic?: string | null;
  message: string;
  status: string;
  user_confirmed?: boolean;
  created_at: string;
  last_reply_at?: string | null;
  last_reply_role?: string | null;
};

type Message = {
  id: string;
  sender_role: "user" | "admin";
  sender_name?: string | null;
  body: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: "Pendiente", in_progress: "En proceso", resolved: "Resuelto",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};
const FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "open", label: "Pendiente" },
  { id: "in_progress", label: "En proceso" },
  { id: "resolved", label: "Resuelto" },
] as const;

function fmt(d: string) {
  return new Date(d).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function SupportTickets({ onUnreadChange }: { onUnreadChange?: (n: number) => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("todas");
  // Ticket ids with an UNREAD admin reply (from the notifications table) → drives
  // the per-ticket "Nueva respuesta" marker, the per-status badges, and the
  // dashboard Soporte badge (via onUnreadChange).
  const [unread, setUnread] = useState<Set<string>>(new Set());

  const [openId, setOpenId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const setUnreadAndNotify = useCallback((s: Set<string>) => {
    setUnread(s);
    onUnreadChange?.(s.size);
  }, [onUnreadChange]);

  const loadUnread = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("notifications")
      .select("data")
      .eq("user_id", user.id)
      .eq("type", "support_reply")
      .eq("read", false);
    const ids = new Set<string>();
    for (const r of data ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tid = (r as any).data?.ticketId as string | undefined;
      if (tid) ids.add(tid);
    }
    setUnreadAndNotify(ids);
  }, [user, setUnreadAndNotify]);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/support")
      .then((r) => r.json())
      .then(({ tickets }) => setItems(tickets ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!openId) { load(); loadUnread(); } }, [openId, load, loadUnread]);

  const openTicket = useCallback(async (id: string) => {
    setOpenId(id);
    setThreadLoading(true);
    fetch(`/api/support?id=${id}`)
      .then((r) => r.json())
      .then(({ ticket, messages }) => { setTicket(ticket); setMessages(messages ?? []); })
      .finally(() => setThreadLoading(false));
    // Reading the ticket clears its "new reply" notifications (auto-refresh badges).
    if (user) {
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true })
        .eq("user_id", user.id).eq("type", "support_reply").eq("read", false)
        .contains("data", { ticketId: id });
      setUnread((prev) => {
        const next = new Set(prev); next.delete(id); onUnreadChange?.(next.size); return next;
      });
    }
  }, [user, onUnreadChange]);

  async function sendReply() {
    if (!reply.trim() || !openId) return;
    setSending(true);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: openId, body: reply.trim() }),
    });
    setSending(false);
    if (res.ok) { setReply(""); openTicket(openId); }
    else alert("No se pudo enviar el mensaje.");
  }

  async function ticketAction(action: "confirm" | "reopen") {
    if (!openId) return;
    setSending(true);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: openId, action }),
    });
    setSending(false);
    if (res.ok) openTicket(openId);
    else alert("No se pudo procesar. Intenta de nuevo.");
  }

  const filtered = useMemo(
    () => (filter === "todas" ? items : items.filter((t) => t.status === filter)),
    [items, filter]
  );
  const unreadByStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of items) if (unread.has(t.id)) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [items, unread]);

  // ── Thread view ──
  if (openId) {
    return (
      <div>
        <button onClick={() => { setOpenId(null); setTicket(null); setMessages([]); }} className="inline-flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#009FD9] mb-4">
          <ArrowLeft className="h-4 w-4" /> Volver a mis tickets
        </button>

        {threadLoading || !ticket ? (
          <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
        ) : (
          <div className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#e5e7eb] flex items-center justify-between gap-3">
              <p className="font-semibold text-[#111827] min-w-0 truncate">{ticket.subject}</p>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[ticket.status] ?? ""}`}>{STATUS_LABEL[ticket.status] ?? ticket.status}</span>
            </div>

            <div className="p-5 flex flex-col gap-3 max-h-[460px] overflow-y-auto bg-[#f9fafb]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.sender_role === "user" ? "bg-[#009FD9] text-white" : "bg-white border border-[#e5e7eb] text-[#374151]"}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-70">
                      {m.sender_role === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {m.sender_role === "admin" ? "Soporte ContrataCR" : "Tú"} · {fmt(m.created_at)}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Resolved → user confirms the fix or asks to reopen */}
            {ticket.status === "resolved" && !ticket.user_confirmed && (
              <div className="px-4 py-3 border-t border-[#e5e7eb] bg-[#f0fdf4]">
                <p className="text-sm font-medium text-[#166534] mb-2">Marcamos este ticket como resuelto. ¿Se solucionó tu problema?</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => ticketAction("confirm")} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#15803d] disabled:opacity-50">
                    Sí, está resuelto
                  </button>
                  <button onClick={() => ticketAction("reopen")} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                    No, sigo con el problema
                  </button>
                </div>
              </div>
            )}
            {ticket.status === "resolved" && ticket.user_confirmed && (
              <div className="px-4 py-2.5 border-t border-[#e5e7eb] bg-[#f0fdf4] text-sm text-[#166534]">
                ✓ Confirmaste que este ticket quedó resuelto.
              </div>
            )}

            <div className="p-4 border-t border-[#e5e7eb]">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Escribe tu mensaje…"
                className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30"
              />
              <div className="flex justify-end mt-2">
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-medium px-4 py-2 hover:bg-[#0089bb] disabled:opacity-50">
                  <Send className="h-4 w-4" /> {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-[#6b7280]">Tus conversaciones con soporte.</p>
        <Link href="/soporte" className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-3 py-2 hover:bg-[#0089bb]">
          <Plus className="h-4 w-4" /> Nuevo ticket
        </Link>
      </div>

      {/* Status filter — like the admin inbox, with a "new" badge per status */}
      {items.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {FILTERS.map((f) => {
            const badge = f.id === "todas" ? unread.size : (unreadByStatus[f.id] ?? 0);
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === f.id ? "bg-[#0f172a] text-white" : "bg-white text-[#374151] border border-[#e5e7eb] hover:bg-gray-50"}`}
              >
                {f.label}
                {badge > 0 && (
                  <span className={`inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold ${filter === f.id ? "bg-white text-[#0f172a]" : "bg-red-500 text-white"}`}>
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-14 rounded-2xl border border-dashed border-[#e5e7eb] bg-white">
          <LifeBuoy className="h-12 w-12 text-[#e5e7eb] mx-auto mb-3" />
          <p className="font-semibold text-[#374151]">Todavía no tienes tickets</p>
          <p className="text-sm text-[#9ca3af] mt-1">Si necesitas ayuda, abre un ticket y te respondemos por aquí y por correo.</p>
          <Link href="/soporte" className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-4 py-2 hover:bg-[#0089bb]">
            <Plus className="h-4 w-4" /> Abrir un ticket
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#9ca3af] text-center py-8">No hay tickets en esta vista.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((t) => {
            const hasNew = unread.has(t.id);
            return (
              <button key={t.id} onClick={() => openTicket(t.id)} className={`text-left bg-white rounded-2xl border p-4 hover:shadow-sm transition-all ${hasNew ? "border-[#bfe3f5] ring-1 ring-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#bfe3f5]"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasNew && <span className="h-2 w-2 rounded-full bg-[#009FD9] shrink-0" />}
                  <p className="text-sm font-semibold text-[#111827]">{t.subject}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status] ?? ""}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                  {hasNew && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EBF5FB] text-[#0077a8]">Nueva respuesta</span>
                  )}
                </div>
                <p className="text-xs text-[#9ca3af] mt-0.5">Actualizado {fmt(t.last_reply_at || t.created_at)}</p>
                <p className="text-sm text-[#6b7280] line-clamp-1 mt-1">{t.message}</p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
