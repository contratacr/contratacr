"use client";

import { isNativeAppRuntime } from "@/hooks/use-native-app";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Headset, ArrowLeft, SendHorizontal, User, Shield, Plus, Clock3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { SupportModal } from "@/components/support/support-modal";
import { SupportForm } from "@/components/support/support-form";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { supportTicketRef } from "@/lib/support-ticket";
import { LONG_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

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

type SupportThreadState = { open: boolean; title: string | null; reference: string | null };

export function SupportTickets({
  onUnreadChange,
  initialTicketId,
  initialNewSupport,
  onThreadChange,
}: {
  onUnreadChange?: (n: number) => void;
  initialTicketId?: string | null;
  initialNewSupport?: boolean;
  onThreadChange?: (state: SupportThreadState) => void;
}) {
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
  const [showNewTicketPage, setShowNewTicketPage] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const keepLatestMessageVisible = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const native = isNativeAppRuntime();
    if ((!openId && !(showNewTicketPage && native)) || !window.matchMedia("(max-width: 1023px)").matches) return;
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("contratacr-chat-thread-open");
    if (native) body.classList.add("contratacr-chat-thread-open");
    const releaseBodyScroll = lockBodyScroll();
    return () => {
      root.classList.remove("contratacr-chat-thread-open");
      body.classList.remove("contratacr-chat-thread-open");
      releaseBodyScroll();
    };
  }, [openId, showNewTicketPage]);

  useEffect(() => {
    if (!openId) return;
    const frame = window.requestAnimationFrame(() => keepLatestMessageVisible());
    return () => window.cancelAnimationFrame(frame);
  }, [openId, messages, keepLatestMessageVisible]);

  useEffect(() => {
    if (!openId) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const handleViewportChange = () => window.requestAnimationFrame(() => keepLatestMessageVisible());
    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);
    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
    };
  }, [openId, keepLatestMessageVisible]);

  useEffect(() => {
    onUnreadChange?.(unread.size);
  }, [onUnreadChange, unread]);

  const closeThread = useCallback(() => {
    setOpenId(null);
    setTicket(null);
    setMessages([]);
  }, []);

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
    setUnread(ids);
  }, [user]);

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
    if (!openId && !showNewTicketPage) queueMicrotask(() => { load(); loadUnread(); });
  }, [openId, showNewTicketPage, load, loadUnread]);

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
        const next = new Set(prev); next.delete(id); return next;
      });
    }
  }, [user]);

  // Deep-link: open a specific ticket on mount (e.g. ?ticket=<id> from a support
  // email's "Ver conversación", carried through login → callback). Runs once.
  const didOpenInitial = useRef(false);
  useEffect(() => {
    if (initialTicketId && !didOpenInitial.current) {
      didOpenInitial.current = true;
      openTicket(initialTicketId);
    }
  }, [initialTicketId, openTicket]);

  const didOpenInitialSupportForm = useRef(false);
  useEffect(() => {
    if (!initialNewSupport || didOpenInitialSupportForm.current) return;
    didOpenInitialSupportForm.current = true;
    queueMicrotask(() => {
      if (window.matchMedia("(max-width: 639px)").matches) setShowNewTicketPage(true);
      else setShowModal(true);
    });
  }, [initialNewSupport]);

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

  useEffect(() => {
    onThreadChange?.({
      open: !!openId || showNewTicketPage,
      title: showNewTicketPage ? t("newTicket") : ticket ? ticketSubject(ticket) : null,
      reference: ticket ? supportTicketRef(ticket.id, ticket.created_at, ticket.case_number) : null,
    });
  }, [openId, showNewTicketPage, ticket, onThreadChange, t]);

  useEffect(() => {
    const handler = () => {
      setShowNewTicketPage(false);
      closeThread();
    };
    window.addEventListener("ccr:support-close-thread", handler);
    return () => window.removeEventListener("ccr:support-close-thread", handler);
  }, [closeThread]);

  // ── Thread view ──
  function openNewTicket() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches) {
      setShowNewTicketPage(true);
      return;
    }
    setShowModal(true);
  }

  function handleNewTicketSubmitted() {
    setShowModal(false);
    setShowNewTicketPage(false);
    setFilter("open");
    load();
    loadUnread();
  }

  if (showNewTicketPage) {
    return (
      <>
        <div className="ccr-support-new-ticket flex min-h-0 flex-1 flex-col bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <SupportForm onSuccess={handleNewTicketSubmitted} />
          </div>
        </div>
        {dialogNode}
      </>
    );
  }

  if (openId) {
    return (
      <>
      <div className="ccr-support-thread flex min-h-0 flex-1 flex-col">
        {threadLoading || !ticket ? (
          <PanelListSkeleton rows={2} hasData={!!ticket} />
        ) : (
          <div className="ccr-support-thread-card flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            <header className="grid min-h-[64px] shrink-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2 border-b border-[#e3ebf1] bg-white px-3 py-2 shadow-[0_8px_22px_-24px_rgba(15,23,42,0.45)] sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-3 sm:px-5">
              <button onClick={closeThread} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#526277] transition active:bg-[#eef6fb]" aria-label={t("backToTickets")}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ccecf8] bg-[#EAF7FD] text-[#0089bb] shadow-sm">
                  <Headset className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-base font-extrabold leading-tight text-[#162543]">{ticketSubject(ticket)}</h3>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLOR[ticket.status] ?? ""}`}>{statusLabel(ticket.status)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#6b7280]">{t("caseRef", { ref: supportTicketRef(ticket.id, ticket.created_at, ticket.case_number) })}</p>
                </div>
              </div>
            </header>

            <div ref={messagesRef} className="ccr-support-thread-messages flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain bg-[#f3f7fa] p-4 sm:p-5">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[86%] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_4px_12px_-8px_rgba(15,23,42,0.55)] sm:max-w-[78%] ${m.sender_role === "user" ? "rounded-br-md bg-[#009FD9] font-medium text-white" : "rounded-bl-md border border-[#e5edf3] bg-white text-[#25364d]"}`}>
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
              <div className="shrink-0 border-t border-[#e5e7eb] bg-[#f0fdf4] px-4 py-3">
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
              <div className="shrink-0 border-t border-[#e5e7eb] bg-[#f0fdf4] px-4 py-2.5 text-sm text-[#166534]">
                {t("confirmedResolved")}
              </div>
            )}

            <div className="ccr-support-thread-composer shrink-0 border-t border-[#e3ebf1] bg-white px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 sm:px-4 sm:pb-4">
              <div className="flex items-end gap-2.5">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(limitText(e.target.value, LONG_TEXT_MAX_LENGTH))}
                  onFocus={() => window.requestAnimationFrame(() => keepLatestMessageVisible())}
                  maxLength={LONG_TEXT_MAX_LENGTH}
                  rows={1}
                  placeholder={t("messagePlaceholder")}
                  className="min-h-11 min-w-0 flex-1 resize-none rounded-[22px] border border-[#d8e5ee] bg-white px-4 py-2.5 text-[15px] leading-6 outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="grid h-11 w-11 place-items-center rounded-full bg-[#009FD9] text-white shadow-[0_8px_18px_-12px_rgba(0,159,217,0.85)] transition hover:bg-[#008fca] disabled:bg-[#cfdde5] disabled:shadow-none" aria-label={sending ? t("sending") : t("send")}>
                  {sending ? <Clock3 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-[22px] w-[22px]" />}
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
    <div className="mx-auto w-full max-w-[34rem] space-y-4 px-4 sm:max-w-none sm:px-0">
      <div className="flex justify-end">
        {/* Header action shows ONLY once tickets have loaded AND there's at least one
            (the persistent action above the list). It must NOT render while loading
            (that flashed the "has tickets" treatment before data arrived) nor in the
            EMPTY state (the centered empty-state card carries the single "Contactar
            soporte" button, so it never appears twice). The heading above stays always. */}
        {!loading && items.length > 0 && (
          <button onClick={openNewTicket} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#009FD9] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#0089bb] shrink-0 w-full sm:w-auto">
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
            mobileLayout="equal"
          />
        </div>
      )}

      {loading ? (
        <PanelListSkeleton rows={3} withTabs hasData={items.length > 0} />
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
            <button onClick={openNewTicket} className="inline-flex items-center gap-1.5 rounded-lg bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0089bb]">
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
                    <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                      <span className="w-fit max-w-full rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">
                        {t("caseRef", { ref: supportTicketRef(tk.id, tk.created_at, tk.case_number) })}
                      </span>
                      <p className="min-w-0 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:flex-1">{ticketSubject(tk)}</p>
                      {tk.status !== filter && (
                        <span className={`w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[tk.status] ?? ""}`}>{statusLabel(tk.status)}</span>
                      )}
                      {hasNew && (
                        <span className="w-fit text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#EBF5FB] text-[#0077a8]">{t("newReply")}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">{statusHelp(tk.status)}</p>
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#9ca3af]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {t("updated", { date: fmt(tk.last_reply_at || tk.created_at) })}
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-[#4b5563] [overflow-wrap:anywhere]">{tk.message}</p>
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
          onSubmitted={handleNewTicketSubmitted}
        />
      )}
      {dialogNode}
    </div>
  );
}
