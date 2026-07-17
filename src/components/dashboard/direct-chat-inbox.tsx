"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, ArrowLeft, BriefcaseBusiness, CalendarDays, ExternalLink, Loader2, MessageCircle, Search, Send } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

type Person = { id?: string; full_name?: string | null; avatar_url?: string | null };
type Conversation = {
  id: string; client_id: string; professional_profile_id: string;
  booking_id?: string | null; project_id?: string | null; proposal_id?: string | null;
  subject?: string | null; last_message?: string | null; last_message_at?: string | null;
  status?: "open" | "archived" | "blocked";
  client_unread_count?: number; professional_unread_count?: number;
  client_profile?: Person | null;
  professionals?: { id?: string; slug?: string | null; business_name?: string | null; profiles?: Person | null } | null;
  context?: { type: "booking" | "project" | "proposal" | "profile"; title?: string | null; service_description?: string | null; status?: string | null; proposal_status?: string | null };
};
type DirectMessage = { id: string; sender_id: string; body: string; created_at: string };

function timeLabel(value?: string | null, locale = "es") {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

function ChatActionButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <span className="group relative inline-flex">
      <button type="button" onClick={onClick} aria-label={label} className={className}>
        {children}
      </button>
      <span className="pointer-events-none absolute right-0 top-[calc(100%+8px)] z-20 max-w-[190px] rounded-lg bg-[#162543] px-2.5 py-1.5 text-center text-[11px] font-bold leading-tight text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-within:opacity-100">
        {label}
      </span>
    </span>
  );
}

export function DirectChatInbox() {
  const locale = useLocale();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("conversation"));
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileThread, setMobileThread] = useState(!!searchParams.get("conversation"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const active = useMemo(() => conversations.find((item) => item.id === activeId) ?? null, [activeId, conversations]);

  const personFor = useCallback((item: Conversation) => user?.id === item.client_id
    ? { name: item.professionals?.business_name || item.professionals?.profiles?.full_name || (isEn ? "Professional" : "Profesional"), avatar: item.professionals?.profiles?.avatar_url }
    : { name: item.client_profile?.full_name || (isEn ? "Client" : "Cliente"), avatar: item.client_profile?.avatar_url }, [isEn, user?.id]);
  const contextFor = useCallback((item: Conversation) => {
    const type = item.context?.type ?? "profile";
    const labels = isEn ? { booking: "Request", project: "Post", proposal: "Proposal", profile: "Profile" } : { booking: "Solicitud", project: "Publicación", proposal: "Propuesta", profile: "Perfil" };
    return { type, label: labels[type], title: item.context?.service_description || item.context?.title || item.subject || (isEn ? "General inquiry" : "Consulta general") };
  }, [isEn]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return conversations;
    return conversations.filter((item) => `${personFor(item).name} ${contextFor(item).title} ${item.last_message ?? ""}`.toLocaleLowerCase(locale).includes(needle));
  }, [contextFor, conversations, locale, personFor, query]);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/direct-chat${showArchived ? "?status=archived" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setConversations(json.conversations ?? []);
      setActiveId((current) => current || json.conversations?.[0]?.id || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load messages." : "No se pudieron cargar los mensajes.");
    } finally { if (!quiet) setLoading(false); }
  }, [isEn, showArchived]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setThreadLoading(true);
    try {
      const res = await fetch(`/api/direct-chat?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      setMessages(json.messages ?? []);
      setConversations((prev) => prev.map((item) => item.id === id ? { ...item, client_unread_count: 0, professional_unread_count: 0 } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load the conversation." : "No se pudo cargar la conversación.");
    } finally { if (!quiet) setThreadLoading(false); }
  }, [isEn]);

  useEffect(() => { queueMicrotask(() => void loadConversations()); }, [loadConversations]);
  useEffect(() => { if (activeId) queueMicrotask(() => void loadThread(activeId)); }, [activeId, loadThread]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages, threadLoading]);
  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase.channel(`direct-chat-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_conversations" }, () => void loadConversations(true))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as DirectMessage & { conversation_id?: string };
        if (row.conversation_id === activeId) void loadThread(activeId, true);
        void loadConversations(true);
      }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, loadConversations, loadThread, user]);

  function selectConversation(id: string) {
    setActiveId(id); setMobileThread(true); setError("");
    router.replace(`/dashboard/profesional?tab=chat&conversation=${id}`, { scroll: false });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    const body = draft.trim(); const optimisticId = `pending-${Date.now()}`;
    setDraft(""); setSending(true); setError("");
    setMessages((current) => [...current, { id: optimisticId, sender_id: user?.id || "", body, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/direct-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId, message: body }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      await Promise.all([loadThread(activeId, true), loadConversations(true)]);
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId)); setDraft(body);
      setError(err instanceof Error ? err.message : isEn ? "Could not send the message." : "No se pudo enviar el mensaje.");
    } finally { setSending(false); }
  }

  async function toggleArchiveActive() {
    if (!activeId) return;
    const res = await fetch("/api/direct-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId, status: showArchived ? "open" : "archived" }) });
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || (isEn ? "Could not update the conversation." : "No se pudo actualizar la conversación.")); return; }
    const remaining = conversations.filter((item) => item.id !== activeId);
    setConversations(remaining); setActiveId(remaining[0]?.id ?? null); setMobileThread(false);
  }

  function contextHref(item: Conversation) {
    if (item.booking_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_bookings" : "bookings"}&booking=${item.booking_id}`;
    if (item.project_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_projects" : "proposals"}&project=${item.project_id}`;
    return item.professionals?.slug ? `/profesionales/${item.professionals.slug}` : null;
  }

  if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>;
  if (!conversations.length) return <div className="py-16 text-center"><MessageCircle className="mx-auto h-10 w-10 text-[#009FD9]" /><h3 className="mt-4 text-lg font-extrabold text-[#162543]">{showArchived ? (isEn ? "No archived conversations" : "No hay conversaciones archivadas") : (isEn ? "No conversations yet" : "No hay conversaciones todavía")}</h3><p className="mx-auto mt-2 max-w-md text-sm text-[#64748b]">{isEn ? "Messages related to profiles, requests and proposals will be organized here." : "Aquí se organizarán los mensajes relacionados con perfiles, solicitudes y propuestas."}</p><button type="button" onClick={() => setShowArchived((value) => !value)} className="mt-5 text-sm font-bold text-[#008fc4] hover:underline">{showArchived ? (isEn ? "View active conversations" : "Ver conversaciones activas") : (isEn ? "View archived" : "Ver archivadas")}</button></div>;

  const activePerson = active ? personFor(active) : null;
  const activeContext = active ? contextFor(active) : null;
  const detailHref = active ? contextHref(active) : null;
  const detailLabel = activeContext?.type === "profile" ? (isEn ? "View profile" : "Ver perfil") : (isEn ? "View linked item" : "Ver trabajo");
  const archiveLabel = showArchived ? (isEn ? "Restore conversation" : "Restaurar conversación") : (isEn ? "Archive conversation" : "Archivar conversación");
  return (
    <div className="grid h-[calc(100dvh-153px)] min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:h-[min(760px,calc(100dvh-220px))] lg:min-h-[500px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className={cn("min-h-0 border-r border-[#e3ebf1] bg-[#f8fbfd]", mobileThread && "hidden lg:block")}>
        <div className="border-b border-[#e3ebf1] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#162543]">{isEn ? "Messages" : "Mensajes"}</h2>
            <div className="grid grid-cols-2 rounded-xl border border-[#d6e4ed] bg-white p-1 text-[11px] font-extrabold shadow-sm">
              <button type="button" onClick={() => { if (showArchived) { setShowArchived(false); setActiveId(null); setMobileThread(false); } }} className={cn("h-8 rounded-lg px-2 transition", !showArchived ? "bg-[#009FD9] text-white shadow-sm" : "text-[#64748b] hover:bg-[#f3f8fb]")}>
                {isEn ? "Active" : "Activos"}
              </button>
              <button type="button" onClick={() => { if (!showArchived) { setShowArchived(true); setActiveId(null); setMobileThread(false); } }} className={cn("h-8 rounded-lg px-2 transition", showArchived ? "bg-[#009FD9] text-white shadow-sm" : "text-[#64748b] hover:bg-[#f3f8fb]")}>
                {isEn ? "Archived" : "Archivados"}
              </button>
            </div>
          </div>
          <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8291a5]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? "Search conversations" : "Buscar conversaciones"} className="h-10 w-full rounded-lg border border-[#d8e4ec] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9]" /></div>
        </div>
        <div className="h-[calc(100%-105px)] overflow-y-auto">
          {filtered.map((item) => { const person = personFor(item); const context = contextFor(item); const unread = user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count; return (
            <button key={item.id} type="button" onClick={() => selectConversation(item.id)} className={cn("flex w-full gap-3 border-b border-[#e7eef3] p-4 text-left transition hover:bg-white", item.id === activeId && "bg-white shadow-[inset_3px_0_0_#009FD9]")}>
              <Avatar className="h-11 w-11"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong><time className="text-[11px] text-[#8492a5]">{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-0.5 block truncate text-xs font-bold text-[#0090c7]">{context.label} · {context.title}</span><span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-[#6b7a90]">{item.last_message || (isEn ? "Conversation started" : "Conversación iniciada")}</span>{!!unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{unread}</span>}</span></span>
            </button>); })}
          {!filtered.length && <p className="p-6 text-center text-sm text-[#6b7a90]">{isEn ? "No matching conversations." : "No hay conversaciones que coincidan."}</p>}
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col", mobileThread ? "flex" : "hidden lg:flex")}>
        <header className="flex min-h-[65px] items-center gap-3 border-b border-[#e3ebf1] px-3 py-3 sm:px-5">
          <button type="button" onClick={() => setMobileThread(false)} className="grid h-9 w-9 place-items-center text-[#526277] lg:hidden" aria-label={isEn ? "Back to conversations" : "Volver a conversaciones"}><ArrowLeft className="h-5 w-5" /></button>
          <Avatar className="h-10 w-10"><AvatarImage src={activePerson?.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(activePerson?.name || "")}</AvatarFallback></Avatar>
          <div className="min-w-0 flex-1"><p className="text-sm font-extrabold leading-tight text-[#162543]">{activePerson?.name}</p><p className="mt-0.5 truncate text-xs font-semibold text-[#63748a]">{activeContext?.label} · {activeContext?.title}</p></div>
          {detailHref && <ChatActionButton label={detailLabel} onClick={() => router.push(detailHref)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#cfe3ee] bg-white px-2.5 text-xs font-bold text-[#008fc4] shadow-sm transition hover:bg-[#f2fbfe]"><span className="hidden xl:inline">{detailLabel}</span><ExternalLink className="h-4 w-4" /></ChatActionButton>}
          <ChatActionButton label={archiveLabel} onClick={() => void toggleArchiveActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9]">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</ChatActionButton>
        </header>
        <div className="flex items-center gap-2 border-b border-[#e7eef3] bg-[#f8fbfd] px-4 py-2 text-xs font-semibold text-[#607188]">{activeContext?.type === "booking" ? <CalendarDays className="h-4 w-4 text-[#009FD9]" /> : <BriefcaseBusiness className="h-4 w-4 text-[#009FD9]" />}{isEn ? "Conversation linked to this item" : "Conversación vinculada a este trabajo"}</div>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#f3f7fa] px-4 py-5 sm:px-6">
          {threadLoading ? <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div> : messages.map((message) => { const mine = message.sender_id === user?.id; return <div key={message.id} className={cn("flex", mine && "justify-end")}><div className={cn("max-w-[86%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[78%]", mine ? "rounded-br-sm bg-[#009FD9] text-white" : "rounded-bl-sm bg-white text-[#25364d]")}><p className="whitespace-pre-wrap break-words">{message.body}</p><time className={cn("mt-1 block text-right text-[10px]", mine ? "text-white/75" : "text-[#8996a8]")}>{timeLabel(message.created_at, locale)}</time></div></div>; })}
        </div>
        {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
        <form onSubmit={submit} className="flex items-end gap-2 border-t border-[#e3ebf1] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4"><textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 2000))} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} placeholder={isEn ? "Write a message" : "Escribe un mensaje"} className="max-h-28 min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-[#d8e5ee] px-4 py-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10" /><button type="submit" disabled={sending || !draft.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#009FD9] text-white disabled:bg-[#d8e4e9]" aria-label={isEn ? "Send" : "Enviar"}>{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}</button></form>
      </section>
    </div>
  );
}
