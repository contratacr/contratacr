"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, ArrowLeft, Loader2, MessageSquareMore, Search, Send } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useContainedTouchScroll } from "@/hooks/use-contained-touch-scroll";
import { createClient } from "@/lib/supabase/client";

type Person = { id?: string; full_name?: string | null; avatar_url?: string | null };
type Conversation = {
  id: string; client_id: string; professional_profile_id: string; professional_id?: string | null;
  booking_id?: string | null; project_id?: string | null; proposal_id?: string | null;
  subject?: string | null; last_message?: string | null; last_message_at?: string | null;
  status?: "open" | "archived" | "blocked";
  client_unread_count?: number; professional_unread_count?: number;
  client_profile?: Person | null;
  professionals?: { id?: string; slug?: string | null; business_name?: string | null; profiles?: Person | null } | null;
  context?: { type: "booking" | "project" | "proposal" | "profile"; title?: string | null; service_description?: string | null; status?: string | null; proposal_status?: string | null };
};
type DirectMessage = { id: string; sender_id: string; body: string; created_at: string };
type PendingDraft = {
  professionalId?: string;
  bookingId?: string;
  projectId?: string;
  proposalId?: string;
  contextTitle?: string;
  draftMessage?: string;
};

const DRAFT_CONVERSATION_ID = "__draft__";

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

function buildPendingDraft(searchParams: URLSearchParams, userId: string | undefined, isEn: boolean): { conversation: Conversation | null; payload: PendingDraft | null } {
  if (searchParams.get("draftChat") !== "1") return { conversation: null, payload: null };

  const professionalId = searchParams.get("professionalId") || undefined;
  const professionalName = searchParams.get("professionalName") || (isEn ? "Professional" : "Profesional");
  const bookingId = searchParams.get("bookingId") || undefined;
  const projectId = searchParams.get("projectId") || undefined;
  const proposalId = searchParams.get("proposalId") || undefined;
  const contextTitle = searchParams.get("contextTitle") || (isEn ? "General inquiry" : "Consulta general");
  const draftMessage = searchParams.get("draftMessage") || "";
  const contextType: "booking" | "project" | "proposal" | "profile" = bookingId ? "booking" : proposalId ? "proposal" : projectId ? "project" : "profile";
  const currentUserId = userId || "__current_user__";
  const pendingAsClient = Boolean(professionalId);
  const conversation: Conversation = {
    id: DRAFT_CONVERSATION_ID,
    client_id: pendingAsClient ? currentUserId : "__draft_client__",
    professional_id: professionalId,
    professional_profile_id: pendingAsClient ? "__draft_professional__" : currentUserId,
    booking_id: bookingId ?? null,
    project_id: projectId ?? null,
    proposal_id: proposalId ?? null,
    subject: contextTitle,
    last_message: isEn ? "New message" : "Nuevo mensaje",
    last_message_at: new Date().toISOString(),
    status: "open",
    client_unread_count: 0,
    professional_unread_count: 0,
    client_profile: pendingAsClient ? null : { full_name: professionalName },
    professionals: pendingAsClient
      ? { id: professionalId, business_name: null, profiles: { full_name: professionalName, avatar_url: null } }
      : null,
    context: {
      type: contextType,
      title: contextTitle,
      service_description: bookingId ? contextTitle : null,
      status: "open",
      proposal_status: proposalId ? "open" : null,
    },
  };
  return {
    conversation,
    payload: { professionalId, bookingId, projectId, proposalId, contextTitle, draftMessage },
  };
}

function findExistingDraftConversation(rows: Conversation[], payload: PendingDraft | null) {
  if (!payload) return null;
  return rows.find((item) => {
    if (payload.bookingId) return item.booking_id === payload.bookingId;
    if (payload.proposalId) return item.proposal_id === payload.proposalId;
    if (payload.projectId && payload.professionalId) return item.project_id === payload.projectId && item.professional_id === payload.professionalId;
    if (payload.professionalId) {
      return item.professional_id === payload.professionalId && !item.booking_id && !item.project_id && !item.proposal_id;
    }
    return false;
  }) ?? null;
}

export function DirectChatInbox() {
  const locale = useLocale();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const initialPendingDraft = useMemo(() => buildPendingDraft(searchParams, user?.id, isEn), [isEn, searchParams, user?.id]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [pendingDraft, setPendingDraft] = useState<Conversation | null>(initialPendingDraft.conversation);
  const [pendingDraftPayload, setPendingDraftPayload] = useState<PendingDraft | null>(initialPendingDraft.payload);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("conversation") || (initialPendingDraft.conversation ? DRAFT_CONVERSATION_ID : null));
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState(initialPendingDraft.payload?.draftMessage ?? "");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(searchParams.get("chatStatus") === "archived");
  const [archivedCount, setArchivedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileThread, setMobileThread] = useState(!!searchParams.get("conversation"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useContainedTouchScroll(scrollRef, mobileThread);
  const displayedConversations = useMemo(
    () => pendingDraft && !showArchived
      ? [pendingDraft, ...conversations.filter((item) => item.id !== DRAFT_CONVERSATION_ID)]
      : conversations,
    [conversations, pendingDraft, showArchived],
  );
  const active = useMemo(() => displayedConversations.find((item) => item.id === activeId) ?? null, [activeId, displayedConversations]);

  useEffect(() => {
    const next = buildPendingDraft(searchParams, user?.id, isEn);
    if (!next.conversation) return;
    queueMicrotask(() => {
      setPendingDraft(next.conversation);
      setPendingDraftPayload(next.payload);
      setActiveId(DRAFT_CONVERSATION_ID);
      setMobileThread(true);
      setDraft((current) => current || next.payload?.draftMessage || "");
    });
  }, [isEn, searchParams, user?.id]);

  const personFor = useCallback((item: Conversation) => user?.id === item.client_id
    ? {
      role: "professional" as const,
      name: item.professionals?.business_name || item.professionals?.profiles?.full_name || (isEn ? "Professional" : "Profesional"),
      avatar: item.professionals?.profiles?.avatar_url,
      profileHref: item.professionals?.slug ? `/profesionales/${item.professionals.slug}` : null,
    }
    : {
      role: "client" as const,
      name: item.client_profile?.full_name || (isEn ? "Client" : "Cliente"),
      avatar: item.client_profile?.avatar_url,
      profileHref: null,
    }, [isEn, user?.id]);
  const contextFor = useCallback((item: Conversation) => {
    const type = item.context?.type ?? "profile";
    const labels = isEn ? { booking: "Request", project: "Post", proposal: "Proposal", profile: "Profile" } : { booking: "Solicitud", project: "Publicación", proposal: "Propuesta", profile: "Perfil" };
    return { type, label: labels[type], title: item.context?.service_description || item.context?.title || item.subject || (isEn ? "General inquiry" : "Consulta general") };
  }, [isEn]);
  const contextSummaryFor = useCallback((item: Conversation) => {
    const context = contextFor(item);
    if (context.type === "profile") return context.title;
    return `${context.label} · ${context.title}`;
  }, [contextFor]);
  const contextActionFor = useCallback((item: Conversation) => {
    const type = item.context?.type ?? "profile";
    const labels = isEn ? { booking: "View request", project: "View post", proposal: "View proposal", profile: "View profile" } : { booking: "Ver solicitud", project: "Ver publicación", proposal: "Ver propuesta", profile: "Ver perfil" };
    return labels[type];
  }, [isEn]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return displayedConversations;
    return displayedConversations.filter((item) => `${personFor(item).name} ${contextSummaryFor(item)} ${item.last_message ?? ""}`.toLocaleLowerCase(locale).includes(needle));
  }, [contextSummaryFor, displayedConversations, locale, personFor, query]);

  const loadConversations = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await fetch(`/api/direct-chat${showArchived ? "?status=archived" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      const rows = json.conversations ?? [];
      const existingDraftConversation = findExistingDraftConversation(rows, pendingDraftPayload);
      setConversations(rows);
      if (existingDraftConversation) {
        setPendingDraft(null);
        setPendingDraftPayload(null);
        setDraft("");
        setActiveId(existingDraftConversation.id);
        router.replace(`/dashboard/profesional?tab=chat&conversation=${existingDraftConversation.id}`, { scroll: false });
      } else {
        setActiveId((current) => current || (pendingDraft ? DRAFT_CONVERSATION_ID : rows[0]?.id || null));
      }
      if (showArchived) {
        setArchivedCount(json.conversations?.length ?? 0);
      } else {
        fetch("/api/direct-chat?status=archived", { cache: "no-store" })
          .then((archivedRes) => archivedRes.ok ? archivedRes.json() : { conversations: [] })
          .then((archivedJson) => setArchivedCount(Array.isArray(archivedJson.conversations) ? archivedJson.conversations.length : 0))
          .catch(() => setArchivedCount(0));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load messages." : "No se pudieron cargar los mensajes.");
    } finally { if (!quiet) setLoading(false); }
  }, [isEn, pendingDraft, pendingDraftPayload, router, showArchived]);

  const loadThread = useCallback(async (id: string, quiet = false) => {
    if (id === DRAFT_CONVERSATION_ID) {
      setMessages([]);
      setThreadLoading(false);
      return;
    }
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
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
  }, [draft]);
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

  function updateArchiveView(nextArchived: boolean, nextConversationId?: string | null) {
    setShowArchived(nextArchived);
    setPendingDraft(null);
    setPendingDraftPayload(null);
    setActiveId(nextConversationId ?? null);
    setMobileThread(false);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "chat");
    if (nextArchived) params.set("chatStatus", "archived");
    else params.delete("chatStatus");

    if (nextConversationId) params.set("conversation", nextConversationId);
    else params.delete("conversation");

    router.replace(`/dashboard/profesional?${params.toString()}`, { scroll: false });
  }

  function selectConversation(id: string) {
    setActiveId(id); setMobileThread(true); setError("");
    if (id === DRAFT_CONVERSATION_ID) return;
    router.replace(`/dashboard/profesional?tab=chat${showArchived ? "&chatStatus=archived" : ""}&conversation=${id}`, { scroll: false });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!activeId || !draft.trim() || sending) return;
    const body = draft.trim(); const optimisticId = `pending-${Date.now()}`;
    setDraft(""); setSending(true); setError("");
    setMessages((current) => [...current, { id: optimisticId, sender_id: user?.id || "", body, created_at: new Date().toISOString() }]);
    try {
      const payload = activeId === DRAFT_CONVERSATION_ID
        ? {
          professionalId: pendingDraftPayload?.professionalId,
          bookingId: pendingDraftPayload?.bookingId,
          projectId: pendingDraftPayload?.projectId,
          proposalId: pendingDraftPayload?.proposalId,
          contextTitle: pendingDraftPayload?.contextTitle,
          message: body,
        }
        : { conversationId: activeId, message: body };
      const res = await fetch("/api/direct-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      if (activeId === DRAFT_CONVERSATION_ID && json.conversationId) {
        setPendingDraft(null);
        setPendingDraftPayload(null);
        setActiveId(json.conversationId);
        router.replace(`/dashboard/profesional?tab=chat&conversation=${json.conversationId}`, { scroll: false });
        await Promise.all([loadThread(json.conversationId, true), loadConversations(true)]);
      } else {
        await Promise.all([loadThread(activeId, true), loadConversations(true)]);
      }
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
    const nextId = remaining[0]?.id ?? null;
    setConversations(remaining);
    setArchivedCount((count) => showArchived ? Math.max(0, count - 1) : count + 1);
    updateArchiveView(showArchived, nextId);
  }

  function contextHref(item: Conversation) {
    if (item.booking_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_bookings" : "bookings"}&booking=${item.booking_id}`;
    if (item.project_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_projects" : "proposals"}&project=${item.project_id}`;
    const isClientSide = user?.id === item.client_id;
    return isClientSide && item.professionals?.slug ? `/profesionales/${item.professionals.slug}` : null;
  }

  if (loading) return <div className="flex min-h-[360px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" /></div>;

  if (!displayedConversations.length) return (
    <div className="py-16 text-center">
      <MessageSquareMore className="mx-auto h-10 w-10 text-[#009FD9]" />
      <h3 className="mt-4 text-lg font-extrabold text-[#162543]">
        {showArchived ? (isEn ? "No archived conversations" : "No hay conversaciones archivadas") : (isEn ? "No conversations yet" : "No hay conversaciones todavía")}
      </h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-[#64748b]">
        {isEn ? "Messages related to profiles, requests and proposals will be organized here." : "Aquí se organizarán los mensajes relacionados con perfiles, solicitudes y propuestas."}
      </p>
      <button type="button" onClick={() => updateArchiveView(!showArchived)} className="mt-5 text-sm font-bold text-[#008fc4] hover:underline">
        {showArchived ? (isEn ? "View active conversations" : "Ver conversaciones activas") : (isEn ? "View archived" : "Ver archivadas")}
      </button>
    </div>
  );
  const activePerson = active ? personFor(active) : null;
  const activeContext = active ? contextFor(active) : null;
  const detailHref = active ? contextHref(active) : null;
  const archiveLabel = showArchived ? (isEn ? "Unarchive" : "Desarchivar") : (isEn ? "Archive" : "Archivar");
  const activePersonName = activePerson?.name || "";
  const activeContextTitle = activeContext?.title || "";
  const activeContextAction = active ? contextActionFor(active) : "";
  return (
    <div className={cn(
      "direct-chat-shell grid h-[calc(var(--app-visual-viewport-height)_-_4rem)] min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:h-[min(760px,calc(100dvh-220px))] lg:min-h-[500px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]",
      mobileThread && "direct-chat-shell--thread",
    )}>
      <aside className={cn("min-h-0 border-r border-[#e3ebf1] bg-[#f8fbfd]", mobileThread && "hidden lg:block")}>
        <div className="border-b border-[#e3ebf1] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#162543]">{showArchived ? (isEn ? "Archived" : "Archivados") : (isEn ? "Messages" : "Mensajes")}</h2>
            {showArchived && (
              <button type="button" onClick={() => updateArchiveView(false)} className="rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-[#008fc4] transition hover:bg-[#eef9fd]">
                {isEn ? "Active" : "Activos"}
              </button>
            )}
          </div>
          <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8291a5]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? "Search conversations" : "Buscar conversaciones"} className="h-10 w-full rounded-lg border border-[#d8e4ec] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#009FD9]" /></div>
        </div>
        <div className="h-[calc(100%-105px)] overflow-y-auto">
          {!showArchived && archivedCount > 0 && (
            <button type="button" onClick={() => updateArchiveView(true)} className="flex w-full items-center gap-3 border-b border-[#e7eef3] bg-white px-4 py-3 text-left transition hover:bg-[#f3f8fb]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef8fd] text-[#009FD9]">
                <Archive className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-extrabold text-[#162543]">{isEn ? "Archived" : "Archivados"}</span>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8eef4] px-1.5 text-[10px] font-extrabold text-[#526277]">{archivedCount > 99 ? "99+" : archivedCount}</span>
            </button>
          )}
          {filtered.map((item) => { const person = personFor(item); const summary = contextSummaryFor(item); const unread = user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count; return (
            <button key={item.id} type="button" onClick={() => selectConversation(item.id)} className={cn("flex w-full gap-3 border-b border-[#e7eef3] p-4 text-left transition hover:bg-white", item.id === activeId && "bg-white shadow-[inset_3px_0_0_#009FD9]")}>
              <Avatar className="h-11 w-11"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong><time className="text-[11px] text-[#8492a5]">{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-0.5 block truncate text-xs font-bold text-[#0090c7]">{summary}</span><span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-[#6b7a90]">{item.last_message || (isEn ? "Conversation started" : "Conversación iniciada")}</span>{!!unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{unread}</span>}</span></span>
            </button>); })}
          {!filtered.length && <p className="p-6 text-center text-sm text-[#6b7a90]">{isEn ? "No matching conversations." : "No hay conversaciones que coincidan."}</p>}
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col", mobileThread ? "flex" : "hidden lg:flex")}>
        <header className="flex min-h-[65px] items-center gap-3 border-b border-[#e3ebf1] px-3 py-3 sm:px-5">
          <button type="button" onClick={() => setMobileThread(false)} className="grid h-9 w-9 place-items-center text-[#526277] lg:hidden" aria-label={isEn ? "Back to conversations" : "Volver a conversaciones"}><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={() => activePerson?.profileHref && router.push(activePerson.profileHref)} disabled={!activePerson?.profileHref} className={cn("shrink-0 rounded-full", activePerson?.profileHref && "transition hover:ring-2 hover:ring-[#9fd8ec]")}>
            <Avatar className="h-10 w-10"><AvatarImage src={activePerson?.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(activePersonName)}</AvatarFallback></Avatar>
          </button>
          <div className="min-w-0 flex-1">
            {activePerson?.profileHref ? (
              <button type="button" onClick={() => router.push(activePerson.profileHref!)} className="block max-w-full truncate text-left text-sm font-extrabold leading-tight text-[#162543] transition hover:text-[#009FD9] hover:underline">
                {activePerson.name}
              </button>
            ) : (
              <p className="truncate text-sm font-extrabold leading-tight text-[#162543]">{activePerson?.name}</p>
            )}
            {active && activeContext && activeContext.type !== "profile" && <p className="mt-0.5 truncate text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#008fc4]">{activeContext.label}</p>}
            {activeContextTitle && <p className="mt-0.5 truncate text-xs font-semibold text-[#63748a]">{activeContextTitle}</p>}
            {detailHref && (
              <button type="button" onClick={() => router.push(detailHref)} className="mt-0.5 block max-w-full truncate text-left text-xs font-extrabold text-[#008fc4] transition hover:text-[#007fac] hover:underline">
                {activeContextAction}
              </button>
            )}
          </div>
          <ChatActionButton label={archiveLabel} onClick={() => void toggleArchiveActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9]">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</ChatActionButton>
        </header>
        <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#f3f7fa] px-4 py-5 sm:px-6">
          {threadLoading ? <div className="grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div> : messages.map((message) => {
            const mine = message.sender_id === user?.id;
            return (
              <div key={message.id} className={cn("flex items-end gap-2", mine && "justify-end")}>
                {!mine && (
                  <Avatar className="h-7 w-7 shrink-0 shadow-sm">
                    <AvatarImage src={activePerson?.avatar ?? undefined} alt={activePersonName} />
                    <AvatarFallback className="bg-[#e8f8ff] text-[10px] font-extrabold text-[#009FD9]">
                      {getInitials(activePersonName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className={cn(
                  "rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm",
                  mine
                    ? "max-w-[86%] rounded-br-sm bg-[#009FD9] text-white sm:max-w-[78%]"
                    : "max-w-[calc(86%_-_2.25rem)] rounded-bl-sm bg-white text-[#25364d] sm:max-w-[72%]",
                )}>
                  <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  <time className={cn("mt-1 block text-right text-[10px]", mine ? "text-white/75" : "text-[#8996a8]")}>{timeLabel(message.created_at, locale)}</time>
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error}</p>}
        <form onSubmit={submit} className="shrink-0 flex items-end gap-2 border-t border-[#e3ebf1] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={isEn ? "Write a message" : "Escribe un mensaje"}
            className="max-h-32 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-[#d8e5ee] px-4 py-2.5 text-sm leading-relaxed outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#009FD9] text-white disabled:bg-[#d8e4e9]"
            aria-label={isEn ? "Send" : "Enviar"}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </form>
      </section>
    </div>
  );
}
