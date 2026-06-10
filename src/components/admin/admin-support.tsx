"use client";

import { useCallback, useEffect, useState } from "react";
import { LifeBuoy, ArrowLeft, Send, User, Shield } from "lucide-react";

type Ticket = {
  id: string;
  name?: string | null;
  email: string;
  subject: string;
  topic?: string | null;
  message: string;
  status: string;
  created_at: string;
  last_reply_at?: string | null;
  last_reply_role?: string | null;
  handled_by_name?: string | null;
  handled_at?: string | null;
};

type Message = {
  id: string;
  sender_role: "user" | "admin";
  sender_name?: string | null;
  body: string;
  created_at: string;
};

const STATUSES = [
  { id: "open", label: "Abiertos" },
  { id: "in_progress", label: "En proceso" },
  { id: "resolved", label: "Resueltos" },
  { id: "closed", label: "Cerrados" },
] as const;

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

export function AdminSupport() {
  const [status, setStatus] = useState<string>("open");
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  // Open thread
  const [openId, setOpenId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback((s: string) => {
    setLoading(true);
    fetch(`/api/admin/support?status=${s}`)
      .then((r) => r.json())
      .then(({ tickets }) => setItems(tickets ?? []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (!openId) load(status); }, [status, openId, load]);

  const openTicket = useCallback((id: string) => {
    setOpenId(id);
    setThreadLoading(true);
    fetch(`/api/admin/support?id=${id}`)
      .then((r) => r.json())
      .then(({ ticket, messages }) => { setTicket(ticket); setMessages(messages ?? []); })
      .finally(() => setThreadLoading(false));
  }, []);

  async function sendReply() {
    if (!reply.trim() || !openId) return;
    setSending(true);
    const res = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openId, body: reply.trim() }),
    });
    setSending(false);
    if (res.ok) { setReply(""); openTicket(openId); }
    else alert("No se pudo enviar la respuesta.");
  }

  async function changeStatus(next: string) {
    if (!openId) return;
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: openId, status: next }),
    });
    setTicket((t) => (t ? { ...t, status: next } : t));
  }

  // ── Thread view ──
  if (openId) {
    return (
      <div>
        <button onClick={() => { setOpenId(null); setTicket(null); setMessages([]); }} className="inline-flex items-center gap-1.5 text-sm text-[#374151] hover:text-[#0f172a] mb-4">
          <ArrowLeft className="h-4 w-4" /> Volver a la lista
        </button>

        {threadLoading || !ticket ? (
          <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#e5e7eb] flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-[#111827]">{ticket.subject}</p>
                <p className="text-xs text-[#9ca3af]">{ticket.name || "Sin nombre"} · {ticket.email}{ticket.topic ? ` · ${ticket.topic}` : ""}</p>
                {ticket.handled_by_name && (
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">Atendido por {ticket.handled_by_name}{ticket.handled_at ? ` · ${fmt(ticket.handled_at)}` : ""}</p>
                )}
              </div>
              <select
                value={ticket.status}
                onChange={(e) => changeStatus(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] bg-white text-sm px-2.5 py-1.5 font-medium text-[#374151]"
              >
                {Object.keys(STATUS_LABEL).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>

            {/* Thread */}
            <div className="p-5 flex flex-col gap-3 max-h-[460px] overflow-y-auto bg-[#f9fafb]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.sender_role === "admin" ? "bg-[#0f172a] text-white" : "bg-white border border-[#e5e7eb] text-[#374151]"}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-70">
                      {m.sender_role === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {m.sender_name || (m.sender_role === "admin" ? "Soporte" : "Usuario")} · {fmt(m.created_at)}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply box */}
            <div className="p-4 border-t border-[#e5e7eb]">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={3}
                placeholder="Escribe tu respuesta… (se envía por correo al usuario)"
                className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0f172a]/20"
              />
              <div className="flex justify-end mt-2">
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#0f172a] text-white text-sm font-medium px-4 py-2 hover:bg-[#1e293b] disabled:opacity-50">
                  <Send className="h-4 w-4" /> {sending ? "Enviando…" : "Responder"}
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
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {STATUSES.map((s) => (
          <button
            key={s.id}
            onClick={() => setStatus(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${status === s.id ? "bg-[#0f172a] text-white" : "bg-white text-[#374151] border border-[#e5e7eb] hover:bg-gray-50"}`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="h-7 w-7 animate-spin rounded-full border-2 border-[#0f172a] border-t-transparent" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <LifeBuoy className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
          <p className="text-sm">No hay tickets en esta vista.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <button key={t.id} onClick={() => openTicket(t.id)} className="text-left bg-white rounded-xl border border-[#e5e7eb] p-4 hover:border-[#cbd5e1] hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-[#111827]">{t.subject}</p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                    {t.last_reply_role === "user" && t.status !== "closed" && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c]">Espera respuesta</span>
                    )}
                  </div>
                  <p className="text-xs text-[#9ca3af] truncate mt-0.5">{t.name || "Sin nombre"} · {t.email} · {fmt(t.last_reply_at || t.created_at)}</p>
                  <p className="text-sm text-[#6b7280] line-clamp-1 mt-1">{t.message}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
