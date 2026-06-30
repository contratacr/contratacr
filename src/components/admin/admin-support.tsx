"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Headset, ArrowLeft, Send, User, Shield, UserSearch, Loader2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { AdminUserSearch } from "@/components/admin/admin-user-search";
import { supportTicketRef } from "@/lib/support-ticket";
import { AdminFilterTabs } from "@/components/admin/admin-filter-tabs";
import { LONG_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { useAdminAutoRefresh } from "@/hooks/use-admin-auto-refresh";

type Ticket = {
  id: string;
  user_id?: string | null;
  name?: string | null;
  email: string;
  subject: string;
  topic?: string | null;
  message: string;
  status: string;
  case_number?: number | null;
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
  { id: "open", label: "Pendientes" },
  { id: "in_progress", label: "En proceso" },
  { id: "resolved", label: "Resueltos" },
] as const;

const STATUS_LABEL: Record<string, string> = {
  open: "Pendiente", in_progress: "En proceso", resolved: "Resuelto",
};
const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Counts = { open: number; in_progress: number; awaiting: number };

export function AdminSupport() {
  const [status, setStatus] = useState<string>("open");
  const [items, setItems] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Counts>({ open: 0, in_progress: 0, awaiting: 0 });
  const [loading, setLoading] = useState(true);

  // Open thread
  const [openId, setOpenId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback((s: string, silent = false) => {
    if (!silent) setLoading(true);
    fetch(`/api/admin/support?status=${s}`)
      .then((r) => r.json())
      .then(({ tickets, counts }) => { setItems(tickets ?? []); if (counts) setCounts(counts); })
      .finally(() => { if (!silent) setLoading(false); });
  }, []);

  useEffect(() => {
    if (!openId) queueMicrotask(() => load(status));
  }, [status, openId, load]);

  const openTicket = useCallback((id: string, silent = false) => {
    setOpenId(id);
    if (!silent) setThreadLoading(true);
    fetch(`/api/admin/support?id=${id}`)
      .then((r) => r.json())
      .then(({ ticket, messages }) => { setTicket(ticket); setMessages(messages ?? []); })
      .finally(() => { if (!silent) setThreadLoading(false); });
  }, []);

  useAdminAutoRefresh(() => {
    if (sending || reply.trim()) return;
    if (openId) openTicket(openId, true);
    else load(status, true);
  }, [load, openId, openTicket, reply, sending, status]);

  // Deep-link: open a specific ticket on mount (e.g. ?ticket=<id> from the "Abrir"
  // link on a user's admin profile). Runs once so the admin can still go back to the
  // list afterwards. Works regardless of the status filter — the thread is fetched
  // directly by id, not from the filtered list.
  const searchParams = useSearchParams();
  const initialTicketId = searchParams.get("ticket");
  const didOpenInitial = useRef(false);
  useEffect(() => {
    if (initialTicketId && !didOpenInitial.current) {
      didOpenInitial.current = true;
      openTicket(initialTicketId);
    }
  }, [initialTicketId, openTicket]);

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
          <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
        ) : (
          <div className="bg-white rounded-xl border border-[#e5e7eb] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#e5e7eb] flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                    Caso {supportTicketRef(ticket.id, ticket.created_at, ticket.case_number)}
                  </span>
                  <p className="font-semibold text-[#111827]">{ticket.subject}</p>
                </div>
                <p className="text-xs text-[#9ca3af]">
                  {ticket.name || "Sin nombre"} · {ticket.email}{ticket.topic ? ` · ${ticket.topic}` : ""}
                  <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ticket.user_id ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-gray-100 text-gray-500"}`}>
                    {ticket.user_id ? "Registrado" : "Invitado"}
                  </span>
                </p>
                {ticket.handled_by_name && (
                  <p className="text-[11px] text-[#9ca3af] mt-0.5">Atendido por Soporte ContrataCR{ticket.handled_at ? ` · ${fmt(ticket.handled_at)}` : ""}</p>
                )}
                {ticket.user_id && (
                  <Link href={`/admin/usuarios/${ticket.user_id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#009FD9] hover:underline">
                    <UserSearch className="h-3.5 w-3.5" /> Ver perfil completo del usuario
                  </Link>
                )}
              </div>
              {/* Forward-only: open→en proceso→resuelto. No moving back to pendiente
                  (a resolved ticket reopens only when someone replies). */}
              <select
                value={ticket.status}
                onChange={(e) => changeStatus(e.target.value)}
                className="rounded-lg border border-[#e5e7eb] bg-white text-sm px-2.5 py-1.5 font-medium text-[#374151]"
              >
                {(ticket.status === "open"
                  ? ["open", "in_progress", "resolved"]
                  : ticket.status === "in_progress"
                  ? ["in_progress", "resolved"]
                  : ["resolved"]
                ).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>

            {/* Thread */}
            <div className="p-5 flex flex-col gap-3 max-h-[460px] overflow-y-auto bg-[#f9fafb]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "admin" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.sender_role === "admin" ? "bg-[#0f172a] text-white" : "bg-white border border-[#e5e7eb] text-[#374151]"}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-70">
                      {m.sender_role === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {m.sender_role === "admin" ? "Soporte ContrataCR" : (m.sender_name || "Usuario")} · {fmt(m.created_at)}
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
                onChange={(e) => setReply(limitText(e.target.value, LONG_TEXT_MAX_LENGTH))}
                maxLength={LONG_TEXT_MAX_LENGTH}
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
      <div className="flex items-center gap-2 mb-5">
        <Headset className="h-5 w-5 text-[#009FD9]" />
        <h1 className="text-xl font-bold text-[#111827]">Soporte</h1>
      </div>

      {/* Find any user (by name/cédula/correo) and jump to their full profile —
          handy while triaging a ticket. The section + filters below are unchanged. */}
      <div className="mb-4 max-w-md">
        <AdminUserSearch placeholder="Buscar usuario por nombre, cédula o correo" />
      </div>

      <AdminFilterTabs
        tabs={STATUSES}
        value={status}
        onChange={setStatus}
        counts={{ open: counts.open, in_progress: counts.awaiting, resolved: 0 }}
      />

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-[#9ca3af]">
          <Headset className="h-10 w-10 mx-auto mb-2 text-[#cbd5e1]" />
          <p className="text-sm">No hay tickets en esta vista.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((t) => (
            <button key={t.id} onClick={() => openTicket(t.id)} className="text-left bg-white rounded-xl border border-[#e5e7eb] p-4 hover:border-[#cbd5e1] hover:shadow-sm transition-all">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                      Caso {supportTicketRef(t.id, t.created_at, t.case_number)}
                    </span>
                    <p className="text-sm font-semibold text-[#111827]">{t.subject}</p>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOR[t.status] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABEL[t.status] ?? t.status}</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${t.user_id ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-gray-100 text-gray-500"}`}>{t.user_id ? "Registrado" : "Invitado"}</span>
                    {t.last_reply_role === "user" && t.status !== "resolved" && (
                      <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#b91c1c]"><span className="h-1.5 w-1.5 rounded-full bg-[#b91c1c]" />Espera respuesta</span>
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
