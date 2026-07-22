"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArchiveRestore, ArrowLeft, FileText, Loader2, MessageSquareMore, Paperclip, Search, Send, Trash2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useContainedTouchScroll } from "@/hooks/use-contained-touch-scroll";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { createClient } from "@/lib/supabase/client";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { PanelEmptyState } from "@/components/ui/content-loading";

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
type DirectAttachment = { path?: string; name: string; type: string; size: number; url?: string | null };
type DirectMessage = { id: string; sender_id: string; body: string; created_at: string; attachment_urls?: DirectAttachment[] };
type SelectedAttachment = { id: string; file: File; previewUrl?: string };
type PendingDraft = {
  professionalId?: string;
  bookingId?: string;
  projectId?: string;
  proposalId?: string;
  contextTitle?: string;
  draftMessage?: string;
};

const DRAFT_CONVERSATION_ID = "__draft__";
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function timeLabel(value?: string | null, locale = "es") {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
}

function ChatActionButton({ label, children, onClick, className }: { label: string; children: ReactNode; onClick: () => void; className?: string }) {
  return (
    <AppTooltip label={label}>
      <button type="button" onClick={onClick} aria-label={label} className={className}>
        {children}
      </button>
    </AppTooltip>
  );
}

function resizeMessageTextarea(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const nextHeight = Math.min(textarea.scrollHeight, 144);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 144 ? "auto" : "hidden";
}

function attachmentLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isImageAttachment(attachment: Pick<DirectAttachment, "type" | "name">) {
  return attachment.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(attachment.name);
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
  const [attachmentError, setAttachmentError] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [mobileThread, setMobileThread] = useState(!!searchParams.get("conversation"));
  const [threadCanScroll, setThreadCanScroll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAttachmentsRef = useRef<SelectedAttachment[]>([]);
  useContainedTouchScroll(scrollRef, mobileThread);

  useLayoutEffect(() => {
    if (!mobileThread) return;
    const shouldLockScroll = window.matchMedia("(max-width: 1023px)").matches;
    if (!shouldLockScroll) return;
    const root = document.documentElement;
    root.classList.add("contratacr-chat-thread-open");
    const releaseBodyScroll = lockBodyScroll();
    return () => {
      root.classList.remove("contratacr-chat-thread-open");
      releaseBodyScroll();
    };
  }, [mobileThread]);

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
        router.replace(`/mensajes?conversation=${existingDraftConversation.id}`, { scroll: false });
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
  const updateThreadScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setThreadCanScroll(el.scrollHeight > el.clientHeight + 1);
  }, []);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateThreadScrollState();
    const observer = new ResizeObserver(updateThreadScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateThreadScrollState]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateThreadScrollState();
    if (el.scrollHeight > el.clientHeight + 1) el.scrollTo({ top: el.scrollHeight });
    else el.scrollTo({ top: 0 });
  }, [messages, threadLoading, selectedAttachments, updateThreadScrollState]);
  useEffect(() => {
    resizeMessageTextarea(textareaRef.current);
  }, [draft]);
  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);
  useEffect(() => () => {
    selectedAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);
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
    params.delete("tab");
    if (nextArchived) params.set("chatStatus", "archived");
    else params.delete("chatStatus");

    if (nextConversationId) params.set("conversation", nextConversationId);
    else params.delete("conversation");

    const qs = params.toString();
    router.replace(`/mensajes${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  function selectConversation(id: string) {
    setActiveId(id); setMobileThread(true); setError("");
    if (id === DRAFT_CONVERSATION_ID) return;
    router.replace(`/mensajes${showArchived ? "?chatStatus=archived&" : "?"}conversation=${id}`, { scroll: false });
  }

  function addAttachments(files: FileList | null) {
    setAttachmentError("");
    if (!files?.length) return;
    if (activeId === DRAFT_CONVERSATION_ID) {
      setAttachmentError(isEn ? "Send the first message before attaching files." : "Envia el primer mensaje antes de adjuntar archivos.");
      return;
    }
    const next = [...selectedAttachments];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_ATTACHMENTS) {
        setAttachmentError(isEn ? "You can attach up to 3 files per message." : "Puedes adjuntar hasta 3 archivos por mensaje.");
        break;
      }
      if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
        setAttachmentError(isEn ? "Attach JPG, PNG, WEBP images or PDF files only." : "Adjunta solo imagenes JPG, PNG, WEBP o PDF.");
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachmentError(isEn ? "Each file must be 5 MB or less." : "Cada archivo debe pesar 5 MB o menos.");
        continue;
      }
      next.push({
        id: `${Date.now()}-${crypto.randomUUID()}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      });
    }
    setSelectedAttachments(next);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeAttachment(id: string) {
    setSelectedAttachments((current) => {
      const attachment = current.find((item) => item.id === id);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  function clearSelectedAttachments() {
    selectedAttachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
    setSelectedAttachments([]);
  }

  async function uploadSelectedAttachments(conversationId: string) {
    const uploaded: DirectAttachment[] = [];
    for (const attachment of selectedAttachments) {
      const formData = new FormData();
      formData.set("conversationId", conversationId);
      formData.set("file", attachment.file);
      const res = await fetch("/api/direct-chat/attachments", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      uploaded.push(json.attachment);
    }
    return uploaded;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!activeId || sending || (!draft.trim() && !selectedAttachments.length)) return;
    if (activeId === DRAFT_CONVERSATION_ID && selectedAttachments.length) {
      setAttachmentError(isEn ? "Send the first message before attaching files." : "Envia el primer mensaje antes de adjuntar archivos.");
      return;
    }
    const body = draft.trim(); const optimisticId = `pending-${Date.now()}`;
    const optimisticAttachments = selectedAttachments.map((attachment) => ({
      name: attachment.file.name,
      type: attachment.file.type,
      size: attachment.file.size,
      url: attachment.previewUrl ?? null,
    }));
    setDraft(""); setSending(true); setError(""); setAttachmentError("");
    setMessages((current) => [...current, { id: optimisticId, sender_id: user?.id || "", body: body || (isEn ? "Attachment" : "Archivo adjunto"), attachment_urls: optimisticAttachments, created_at: new Date().toISOString() }]);
    try {
      const attachmentUrls = activeId === DRAFT_CONVERSATION_ID ? [] : await uploadSelectedAttachments(activeId);
      const payload = activeId === DRAFT_CONVERSATION_ID
        ? {
          professionalId: pendingDraftPayload?.professionalId,
          bookingId: pendingDraftPayload?.bookingId,
          projectId: pendingDraftPayload?.projectId,
          proposalId: pendingDraftPayload?.proposalId,
          contextTitle: pendingDraftPayload?.contextTitle,
          message: body,
        }
        : { conversationId: activeId, message: body, attachmentUrls };
      const res = await fetch("/api/direct-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      clearSelectedAttachments();
      if (activeId === DRAFT_CONVERSATION_ID && json.conversationId) {
        setPendingDraft(null);
        setPendingDraftPayload(null);
        setActiveId(json.conversationId);
        router.replace(`/mensajes?conversation=${json.conversationId}`, { scroll: false });
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

  async function deleteArchivedActive() {
    if (!activeId || !showArchived || activeId === DRAFT_CONVERSATION_ID) return;
    const res = await fetch("/api/direct-chat", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId }) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || (isEn ? "Could not delete the conversation." : "No se pudo eliminar la conversación."));
      return;
    }
    const remaining = conversations.filter((item) => item.id !== activeId);
    const nextId = remaining[0]?.id ?? null;
    setConversations(remaining);
    setArchivedCount((count) => Math.max(0, count - 1));
    updateArchiveView(true, nextId);
  }

  function contextHref(item: Conversation) {
    if (item.booking_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_bookings" : "bookings"}&booking=${item.booking_id}`;
    if (item.project_id) return `/dashboard/profesional?tab=${user?.id === item.client_id ? "sent_projects" : "proposals"}&project=${item.project_id}`;
    const isClientSide = user?.id === item.client_id;
    return isClientSide && item.professionals?.slug ? `/profesionales/${item.professionals.slug}` : null;
  }

  if (loading) return (
    <div className="ccr-delayed-loading flex min-h-[calc(100dvh-153px)] flex-col items-center justify-center gap-2 px-4 text-center sm:min-h-[520px]" aria-busy="true" role="status">
      <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" aria-hidden />
      <p className="text-sm font-extrabold text-[#162543]">{isEn ? "Loading" : "Cargando"}</p>
    </div>
  );

  if (!displayedConversations.length) return (
    <PanelEmptyState
      icon={MessageSquareMore}
      title={showArchived ? (isEn ? "No archived conversations" : "No hay conversaciones archivadas") : (isEn ? "No conversations yet" : "No hay conversaciones todavía")}
      description={isEn ? "Messages related to profiles, requests and proposals will be organized here." : "Aquí se organizarán los mensajes relacionados con perfiles, solicitudes y propuestas."}
      action={(
        <button type="button" onClick={() => updateArchiveView(!showArchived)} className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-[#008fc4] hover:underline">
          {showArchived && <ArrowLeft className="h-4 w-4" />}
          {showArchived ? (isEn ? "Back" : "Volver") : (isEn ? "View archived" : "Ver archivadas")}
        </button>
      )}
    />
  );
  const activePerson = active ? personFor(active) : null;
  const activeContext = active ? contextFor(active) : null;
  const detailHref = active ? contextHref(active) : null;
  const archiveLabel = showArchived ? (isEn ? "Unarchive" : "Desarchivar") : (isEn ? "Archive" : "Archivar");
  const deleteLabel = isEn ? "Delete" : "Eliminar";
  const activePersonName = activePerson?.name || "";
  const activeContextTitle = activeContext?.title || "";
  const activeContextAction = active ? contextActionFor(active) : "";
  return (
    <div className={cn(
      "direct-chat-shell grid h-[calc(100dvh-153px)] min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:h-[min(760px,calc(100dvh-220px))] lg:min-h-[500px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]",
      mobileThread && "direct-chat-shell--thread",
    )}>
      <aside className={cn("min-h-0 border-r border-[#e3ebf1] bg-[#f8fbfd]", mobileThread && "hidden lg:block")}>
        <div className="border-b border-[#e3ebf1] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#162543]">{showArchived ? (isEn ? "Archived" : "Archivados") : (isEn ? "Messages" : "Mensajes")}</h2>
            {showArchived && (
              <button type="button" onClick={() => updateArchiveView(false)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-extrabold text-[#008fc4] transition hover:bg-[#eef9fd]">
                <ArrowLeft className="h-3.5 w-3.5" />
                {isEn ? "Back" : "Volver"}
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
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong><time className="shrink-0 text-[11px] text-[#8492a5]">{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-0.5 block line-clamp-2 text-xs font-bold leading-snug text-[#0090c7]">{summary}</span><span className="mt-1 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-xs text-[#6b7a90]">{item.last_message || (isEn ? "Conversation started" : "Conversación iniciada")}</span>{!!unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{unread}</span>}</span></span>
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
            {activeContextTitle && <p className="mt-0.5 line-clamp-2 text-xs font-semibold leading-snug text-[#63748a]">{activeContextTitle}</p>}
            {detailHref && (
              <button type="button" onClick={() => router.push(detailHref)} className="mt-0.5 block max-w-full truncate text-left text-xs font-extrabold text-[#008fc4] transition hover:text-[#007fac] hover:underline">
                {activeContextAction}
              </button>
            )}
          </div>
          <ChatActionButton label={archiveLabel} onClick={() => void toggleArchiveActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9]">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</ChatActionButton>
          {showArchived && (
            <ChatActionButton label={deleteLabel} onClick={() => void deleteArchivedActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-white text-red-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </ChatActionButton>
          )}
        </header>
        <div ref={scrollRef} className={cn("min-h-0 flex-1 space-y-2 bg-[#f3f7fa] px-4 py-5 sm:px-6", threadCanScroll ? "overflow-y-auto overscroll-contain" : "overflow-hidden overscroll-none touch-none")}>
          {threadLoading ? <div className="ccr-delayed-loading grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div> : messages.map((message) => {
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
                  "min-w-[86px] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_4px_12px_-8px_rgba(15,23,42,0.55)]",
                  mine
                    ? "max-w-[86%] rounded-br-md bg-[#009FD9] font-medium text-white sm:max-w-[78%]"
                    : "max-w-[calc(86%_-_2.25rem)] rounded-bl-md border border-[#e5edf3] bg-white text-[#25364d] sm:max-w-[72%]",
                )}>
                  {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
                  {!!message.attachment_urls?.length && (
                    <div className={cn("mt-2 grid gap-2", message.body && "pt-1")}>
                      {message.attachment_urls.map((attachment, index) => {
                        const href = attachment.url ?? undefined;
                        const image = isImageAttachment(attachment);
                        return (
                          <a
                            key={`${message.id}-${attachment.path ?? attachment.name}-${index}`}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "group overflow-hidden rounded-xl border text-left transition",
                              mine ? "border-white/30 bg-white/10 hover:bg-white/15" : "border-[#dce8f0] bg-[#f7fbfd] hover:border-[#b9d8e8]",
                            )}
                          >
                            {image && href ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={href} alt={attachment.name} className="max-h-52 w-full object-cover" />
                            ) : (
                              <span className="flex items-center gap-2 px-3 py-2.5">
                                <FileText className={cn("h-4 w-4 shrink-0", mine ? "text-white" : "text-[#009FD9]")} />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-xs font-extrabold">{attachment.name}</span>
                                  <span className={cn("block text-[10px]", mine ? "text-white/75" : "text-[#6b7a90]")}>{attachmentLabel(attachment.size)}</span>
                                </span>
                              </span>
                            )}
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <time className={cn("mt-1 block text-right text-[10px]", mine ? "text-white/75" : "text-[#8996a8]")}>{timeLabel(message.created_at, locale)}</time>
                </div>
              </div>
            );
          })}
        </div>
        {(error || attachmentError) && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error || attachmentError}</p>}
        <form onSubmit={submit} className="shrink-0 border-t border-[#e3ebf1] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
          {!!selectedAttachments.length && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {selectedAttachments.map((attachment) => (
                <div key={attachment.id} className="relative flex h-16 min-w-40 max-w-48 items-center gap-2 rounded-xl border border-[#d8e5ee] bg-[#f7fbfd] p-2 pr-8">
                  {attachment.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={attachment.previewUrl} alt={attachment.file.name} className="h-11 w-11 rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#e8f8ff] text-[#009FD9]"><FileText className="h-5 w-5" /></span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold text-[#162543]">{attachment.file.name}</span>
                    <span className="block text-[10px] font-semibold text-[#6b7a90]">{attachmentLabel(attachment.file.size)}</span>
                  </span>
                  <button type="button" onClick={() => removeAttachment(attachment.id)} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-white text-[#526277] shadow-sm hover:text-red-600" aria-label={isEn ? "Remove attachment" : "Quitar adjunto"}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            className="hidden"
            onChange={(event) => addAttachments(event.currentTarget.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || activeId === DRAFT_CONVERSATION_ID}
            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[18px] border border-[#d8e5ee] bg-[#f7fbfd] text-[#526277] transition hover:border-[#9fd8ec] hover:text-[#009FD9] disabled:opacity-45"
            aria-label={isEn ? "Attach file" : "Adjuntar archivo"}
            title={activeId === DRAFT_CONVERSATION_ID ? (isEn ? "Send the first message before attaching files." : "Envia el primer mensaje antes de adjuntar archivos.") : undefined}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, 2000));
              resizeMessageTextarea(e.currentTarget);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={isEn ? "Write a message" : "Escribe un mensaje"}
            className="max-h-36 min-h-[52px] min-w-0 flex-1 resize-none overflow-hidden rounded-[20px] border border-[#d8e5ee] px-4 py-3 text-[15px] leading-6 outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
          />
          <button
            type="submit"
            disabled={sending || (!draft.trim() && !selectedAttachments.length)}
            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[18px] bg-[#009FD9] text-white shadow-[0_8px_18px_-12px_rgba(0,159,217,0.85)] transition hover:bg-[#008fca] disabled:bg-[#d8e4e9] disabled:shadow-none"
            aria-label={isEn ? "Send" : "Enviar"}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
          </div>
        </form>
      </section>
    </div>
  );
}
