"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, ArrowLeft, Send, User, Shield, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";

type Ticket = {
  id: string;
  subject: string;
  topic?: string | null;
  message: string;
  status: string;
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
  open: "Abierto", in_progress: "En proceso", resolved: "Resuelto", closed: "Cerrado",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  closed: "bg-gray-200 text-gray-600",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function SupportTickets() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const [openId, setOpenId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/support")
      .then((r) => r.json())
      .then(({ tickets }) => setItems(tickets ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!openId) load(); }, [openId, load]);

  const openTicket = useCallback((id: string) => {
    setOpenId(id);
    setThreadLoading(true);
    fetch(`/api/support?id=${id}`)
      .then((r) => r.json())
      .then(({ ticket, messages }) => { setTicket(ticket); setMessages(messages ?? []); })
      .finally(() => setThreadLoading(false));
  }, []);

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
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-[#6b7280]">Tus conversaciones con soporte.</p>
        <Link href="/soporte" className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-3 py-2 hover:bg-[#0089bb]">
          <Plus className="h-4 w-4" /> Nuevo ticket
        </Link>
      </div>

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
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <button key={t.id} onClick={() => openTicket(t.id)} className="text-left bg-white rounded-2xl border border-[#e5e7eb] p-4 hover:border-[#bfe3f5] hover:shadow-sm transition-all">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-[#111827]">{t.subject}</p>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status] ?? ""}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                {t.last_reply_role === "admin" && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EBF5FB] text-[#0077a8]">Nueva respuesta</span>
                )}
              </div>
              <p className="text-xs text-[#9ca3af] mt-0.5">Actualizado {fmt(t.last_reply_at || t.created_at)}</p>
              <p className="text-sm text-[#6b7280] line-clamp-1 mt-1">{t.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
