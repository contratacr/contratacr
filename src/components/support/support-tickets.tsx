"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Headset, ArrowLeft, Send, User, Shield, Plus, Clock3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { SupportModal } from "@/components/support/support-modal";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { supportTicketRef } from "@/lib/support-ticket";
import { LONG_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelSectionLoading } from "@/components/ui/content-loading";

type Ticket = {
  id: string;
  subject: string;
  topic?: string | null;
  message: string;
  status: string;
  case_number?: number | null;
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

const STATUS_COLOR: Record<string, string> = {
  open: "bg-amber-100 text-amber-700",
  in_progress: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
};
// Status tabs only — no "Todas"; the three statuses cover every ticket and read
// cleaner. Defaults to "open" (Pendiente).
const FILTER_IDS = ["open", "in_progress", "resolved"] as const;
const SUPPORT_TABS = FILTER_IDS.map((id) => ({ id }));
const SUPPORT_SUBJECT_KEYS = ["subject0", "subject1", "subject2", "subject3", "subject4", "subject5"] as const;
const LEGACY_SUBJECT_TO_KEY: Record<string, (typeof SUPPORT_SUBJECT_KEYS)[number]> = {
  "Problema técnico en la plataforma": "subject0",
  "Technical problem on the platform": "subject0",
  "Tengo una pregunta sobre mi cuenta": "subject1",
  "I have a question about my account": "subject1",
  "Cuenta, inicio de sesión o datos": "subject1",
  "Account, login, or personal details": "subject1",
  "Quiero reportar a un usuario": "subject2",
  "I want to report a user": "subject2",
  "Reportar usuario o contenido": "subject2",
  "Report a user or content": "subject2",
  "Problemas con el registro para ofrecer servicios": "subject3",
  "Problems registering to offer services": "subject3",
  "Perfil o verificación profesional": "subject3",
  "Professional profile or verification": "subject3",
  "Problemas con una reservación o solicitud": "subject4",
  "Problems with a booking or request": "subject4",
  "Solicitudes, proyectos o propuestas": "subject4",
  "Solicitudes, publicaciones o propuestas": "subject4",
  "Requests, projects, or proposals": "subject4",
  "Requests, posts, or proposals": "subject4",
  "Otro": "subject5",
  "Other": "subject5",
};

export function SupportTickets({ onUnreadChange, initialTicketId }: { onUnreadChange?: (n: number) => void; initialTicketId?: string | null }) {
  const { user } = useAuth();
  const t = useTranslations("supportTickets");
  const locale = useLocale();
  const { dialogNode, showMessage } = useAppDialog();
  const errorTitle = locale === "en" ? "Something went wrong" : "No se pudo completar la acción";
  const dateLocale = locale === "en" ? "en-US" : "es-CR";
  const statusLabel = (s: string) => {
    const keys = ["open", "in_progress", "resolved"];
    return keys.includes(s) ? t(`status.${s}` as "status.open" | "status.in_progress" | "status.resolved") : s;
  };
  const statusHelp = (s: string) => {
    const keys = ["open", "in_progress", "resolved"];
    return keys.includes(s) ? t(`statusHelp.${s}` as "statusHelp.open" | "statusHelp.in_progress" | "statusHelp.resolved") : "";
  };
  const ticketSubject = (tk: Ticket) => {
    const topicKey = SUPPORT_SUBJECT_KEYS.includes(tk.topic as (typeof SUPPORT_SUBJECT_KEYS)[number])
      ? tk.topic as (typeof SUPPORT_SUBJECT_KEYS)[number]
      : LEGACY_SUBJECT_TO_KEY[tk.subject];
    return topicKey ? t(`subjects.${topicKey}`) : tk.subject;
  };
  const filterLabel = (id: string) => statusLabel(id);
  const fmt = (d: string) => new Date(d).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>("open");
  // Ticket ids with an UNREAD admin reply (from the notifications table) → drives
  // the per-ticket "Nueva respuesta" marker and the dashboard Soporte badge
  // (via onUnreadChange). Filter tabs keep only their normal item count.
  const [unread, setUnread] = useState<Set<string>>(new Set());

  const [openId, setOpenId] = useState<string | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  // In-panel "Contactar soporte" opens the support form as a MODAL (no navigation
  // away from the panel). On submit we close it and reload the list so the new
  // ticket appears inline.
  const [showModal, setShowModal] = useState(false);

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
    setLoadError(false);
    fetch("/api/support")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? "support-load-failed");
        return data;
      })
      .then(({ tickets }) => setItems(tickets ?? []))
      .catch(() => {
        setItems([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!openId) queueMicrotask(() => { load(); loadUnread(); });
  }, [openId, load, loadUnread]);

  const openTicket = useCallback(async (id: string) => {
    setOpenId(id);
    setThreadLoading(true);
    fetch(`/api/support?id=${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? "support-ticket-load-failed");
        return data;
      })
      // Not theirs / not found (e.g. a deep-link opened by the wrong account) →
      // fall back to the list gracefully instead of a stuck loader.
      .then(({ ticket, messages }) => {
        if (!ticket) { setOpenId(null); return; }
        setTicket(ticket); setMessages(messages ?? []);
        // Reflect the ticket's ACTUAL status in the filter (so an email deep-link to
        // an in-progress conversation lands in the in-progress view, not pending).
        if (ticket.status) setFilter(ticket.status);
      })
      .catch(() => { setOpenId(null); setLoadError(true); })
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

  // Deep-link: open a specific ticket on mount (e.g. ?ticket=<id> from a support
  // email's "Ver conversación", carried through login → callback). Runs once.
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
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: openId, body: reply.trim() }),
    });
    setSending(false);
    if (res.ok) { setReply(""); openTicket(openId); }
    else void showMessage({ title: errorTitle, description: t("sendError"), tone: "danger" });
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
    else void showMessage({ title: errorTitle, description: t("actionError"), tone: "danger" });
  }

  const filtered = useMemo(
    () => items.filter((t) => t.status === filter),
    [items, filter]
  );
  // Total tickets per status → the per-tab count badge (consistent with solicitudes/proyectos).
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of items) m[t.status] = (m[t.status] ?? 0) + 1;
    return m;
  }, [items]);

  // ── Thread view ──
  if (openId) {
    return (
      <>
      <div>
        <button onClick={() => { setOpenId(null); setTicket(null); setMessages([]); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#374151] hover:text-[#009FD9] mb-4">
          <ArrowLeft className="h-4 w-4" /> {t("backToTickets")}
        </button>

        {threadLoading || !ticket ? (
          <PanelSectionLoading rows={2} />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm">
            <div className="px-4 py-4 border-b border-[#e5e7eb] sm:px-5">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                  <Headset className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                      {t("caseRef", { ref: supportTicketRef(ticket.id, ticket.created_at, ticket.case_number) })}
                    </span>
                    <h3 className="text-[15px] font-bold leading-snug text-[#162543] sm:text-base">{ticketSubject(ticket)}</h3>
                    {ticket.status !== filter && (
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[ticket.status] ?? ""}`}>{statusLabel(ticket.status)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">{statusHelp(ticket.status)}</p>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-5 flex flex-col gap-3 max-h-[460px] overflow-y-auto bg-[#f9fafb]">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.sender_role === "user" ? "bg-[#009FD9] text-white" : "bg-white border border-[#e5e7eb] text-[#374151]"}`}>
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] opacity-70">
                      {m.sender_role === "admin" ? <Shield className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {m.sender_role === "admin" ? t("supportName") : t("you")} · {fmt(m.created_at)}
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Resolved → user confirms the fix or asks to reopen */}
            {ticket.status === "resolved" && !ticket.user_confirmed && (
              <div className="px-4 py-3 border-t border-[#e5e7eb] bg-[#f0fdf4]">
                <p className="text-sm font-medium text-[#166534] mb-2">{t("resolvedAsk")}</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => ticketAction("confirm")} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-[#16a34a] text-white text-sm font-medium px-3 py-1.5 hover:bg-[#15803d] disabled:opacity-50">
                    {t("yesResolved")}
                  </button>
                  <button onClick={() => ticketAction("reopen")} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-[#e5e7eb] text-[#374151] text-sm font-medium px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50">
                    {t("noStillIssue")}
                  </button>
                </div>
              </div>
            )}
            {ticket.status === "resolved" && ticket.user_confirmed && (
              <div className="px-4 py-2.5 border-t border-[#e5e7eb] bg-[#f0fdf4] text-sm text-[#166534]">
                {t("confirmedResolved")}
              </div>
            )}

            <div className="p-4 border-t border-[#e5e7eb]">
              <textarea
                value={reply}
                onChange={(e) => setReply(limitText(e.target.value, LONG_TEXT_MAX_LENGTH))}
                maxLength={LONG_TEXT_MAX_LENGTH}
                rows={3}
                placeholder={t("messagePlaceholder")}
                className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30"
              />
              <div className="flex justify-end mt-2">
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-medium px-4 py-2 hover:bg-[#0089bb] disabled:opacity-50">
                  <Send className="h-4 w-4" /> {sending ? t("sending") : t("send")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {dialogNode}
      </>
    );
  }

  // ── List view ──
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="max-w-2xl text-sm leading-relaxed text-[#6b7280]">{t("inboxBody")}</p>
        </div>
        {/* Header action shows ONLY once tickets have loaded AND there's at least one
            (the persistent action above the list). It must NOT render while loading
            (that flashed the "has tickets" treatment before data arrived) nor in the
            EMPTY state (the centered empty-state card carries the single "Contactar
            soporte" button, so it never appears twice). The heading above stays always. */}
        {!loading && items.length > 0 && (
          <button onClick={() => setShowModal(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0089bb] shrink-0 w-full sm:w-auto">
            <Plus className="h-4 w-4" /> {t("newTicket")}
          </button>
        )}
      </div>

      {/* Status filter — the SHARED tab style (consistent with solicitudes/proyectos):
          per-status COUNT badge only. Hidden until loading resolves so it never
          flashes before the tickets arrive. */}
      {!loading && items.length > 0 && (
        <div className="mb-4">
          <StatusFilterTabs
            tabs={SUPPORT_TABS}
            value={filter}
            onChange={setFilter}
            counts={statusCounts}
            labelFor={filterLabel}
          />
        </div>
      )}

      {loading ? (
        <PanelSectionLoading rows={2} />
      ) : loadError ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-10 text-center">
          <Headset className="mx-auto mb-3 h-10 w-10 text-[#cbd5e1]" />
          <p className="font-semibold text-[#374151]">{t("loadError")}</p>
          <button onClick={load} className="mt-4 inline-flex items-center justify-center rounded-full bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]">
            {t("retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <PanelEmptyState
          icon={Headset}
          title={t("empty")}
          description={t("emptySub")}
          className="rounded-2xl border border-dashed border-[#e5e7eb] bg-white"
          action={(
            <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0089bb]">
              <Plus className="h-4 w-4" /> {t("openTicket")}
            </button>
          )}
        />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[#9ca3af] text-center py-8">{t("noneInView")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((tk) => {
            const hasNew = unread.has(tk.id);
            return (
              <button key={tk.id} onClick={() => openTicket(tk.id)} className={`group text-left bg-white rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${hasNew ? "border-[#bfe3f5] ring-1 ring-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#bfe3f5]"}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
                    <Headset className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                        {t("caseRef", { ref: supportTicketRef(tk.id, tk.created_at, tk.case_number) })}
                      </span>
                      <p className="min-w-0 flex-1 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{ticketSubject(tk)}</p>
                      {tk.status !== filter && (
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[tk.status] ?? ""}`}>{statusLabel(tk.status)}</span>
                      )}
                      {hasNew && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EBF5FB] text-[#0077a8]">{t("newReply")}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">{statusHelp(tk.status)}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#9ca3af]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {t("updated", { date: fmt(tk.last_reply_at || tk.created_at) })}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#4b5563]">{tk.message}</p>
                    <span className="mt-3 inline-flex text-sm font-semibold text-[#009FD9] group-hover:underline">{hasNew ? t("viewReply") : t("openConversation")}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showModal && (
        <SupportModal
          onClose={() => setShowModal(false)}
          // New ticket submitted → close the modal, jump to "Pendiente" (where a
          // brand-new ticket lands) and reload so it shows up inline immediately.
          onSubmitted={() => { setShowModal(false); setFilter("open"); load(); loadUnread(); }}
        />
      )}
      {dialogNode}
    </div>
  );
}
