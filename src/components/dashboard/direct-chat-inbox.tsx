"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, ArrowLeft, ChevronLeft, Download, FileText, Loader2, MessageSquareMore, MoreHorizontal, Plus, Search, SendHorizontal, Trash2, X } from "lucide-react";
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
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date);
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const daysAgo = Math.floor((startOfToday - startOfDate) / 86_400_000);
  if (daysAgo === 1) return locale === "en" ? "Yesterday" : "Ayer";
  if (daysAgo >= 1 && daysAgo < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: "long" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", year: "2-digit" }).format(date);
}

function messageTimeLabel(value?: string | null, locale = "es") {
  if (!value) return "";
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function messageDateKey(value?: string | null) {
  if (!value) return "";
  return new Date(value).toDateString();
}

function messageDateLabel(value?: string | null, locale = "es") {
  if (!value) return "";
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return locale === "en" ? "Today" : "Hoy";
  if (date.toDateString() === yesterday.toDateString()) return locale === "en" ? "Yesterday" : "Ayer";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(date);
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
  const maxHeight = 132;
  const minHeight = 44;
  textarea.style.height = "auto";
  const nextHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight));
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  textarea.scrollTop = textarea.scrollHeight;
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

function demoConversations(userId: string | undefined): Conversation[] {
  const currentUserId = userId || "__current_user__";
  const now = Date.now();
  const demoOffsets = [
    35 * 60 * 1000,
    4 * 60 * 60 * 1000,
    26 * 60 * 60 * 1000,
    2 * 24 * 60 * 60 * 1000,
    4 * 24 * 60 * 60 * 1000,
    6 * 24 * 60 * 60 * 1000,
    8 * 24 * 60 * 60 * 1000,
    12 * 24 * 60 * 60 * 1000,
    18 * 24 * 60 * 60 * 1000,
    31 * 24 * 60 * 60 * 1000,
    45 * 24 * 60 * 60 * 1000,
    75 * 24 * 60 * 60 * 1000,
  ];
  const items = [
    ["demo-chat-electricidad", "Electro Vargas", "Mañana puedo revisar el tablero y enviarle el diagnóstico.", "Electricidad residencial"],
    ["demo-chat-limpieza", "Limpieza Brisa", "Sí, podemos coordinar una limpieza profunda para esta semana.", "Limpieza profunda"],
    ["demo-chat-jardineria", "Jardines del Oeste", "Le confirmo disponibilidad para mantenimiento mensual.", "Jardinería"],
    ["demo-chat-pintura", "Pinturas Solano", "El presupuesto incluye materiales y dos manos de pintura.", "Pintura de casa"],
    ["demo-chat-transporte", "Mudanzas CR Express", "Tenemos espacio el sábado en la mañana.", "Transporte y mudanza"],
    ["demo-chat-ac", "Frío Técnico CR", "Podemos hacer mantenimiento preventivo del aire acondicionado.", "Aire acondicionado"],
    ["demo-chat-fotografia", "Foto Estudio Central", "Le comparto opciones para la sesión corporativa.", "Fotografía profesional"],
    ["demo-chat-cerrajeria", "Cerrajería Rápida", "Llegamos en unos 40 minutos si confirma la ubicación.", "Cerrajería"],
    ["demo-chat-contabilidad", "Conta Clara Plus", "Puedo preparar la declaración y revisar facturas pendientes.", "Contabilidad"],
    ["demo-chat-web", "Pixel Studio CR", "Le propongo una estructura sencilla para la página.", "Desarrollo web"],
    ["demo-chat-mecanica", "Auto Servicio La Sabana", "La revisión inicial tarda aproximadamente una hora.", "Mecánica automotriz"],
    ["demo-chat-eventos", "Eventos Nativa", "Tengo disponibles paquetes con mobiliario y decoración.", "Organización de eventos"],
  ];
  return items.map(([id, name, message, subject], index) => ({
    id,
    client_id: currentUserId,
    professional_id: id,
    professional_profile_id: `${id}-profile`,
    subject,
    last_message: message,
    last_message_at: new Date(now - (demoOffsets[index] ?? (index + 3) * 36 * 60 * 1000)).toISOString(),
    status: "open",
    client_unread_count: index === 1 || index === 6 ? 1 : 0,
    professional_unread_count: 0,
    client_profile: null,
    professionals: {
      id,
      slug: null,
      business_name: name,
      profiles: { full_name: name, avatar_url: null },
    },
    context: { type: "profile", title: subject, status: "open" },
  }));
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
  const [imagePreview, setImagePreview] = useState<DirectAttachment | null>(null);
  const [mobileThread, setMobileThread] = useState(!!searchParams.get("conversation"));
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [threadMenuOpen, setThreadMenuOpen] = useState(false);
  const threadMenuRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAttachmentsRef = useRef<SelectedAttachment[]>([]);
  useContainedTouchScroll(scrollRef, mobileThread);

  useEffect(() => {
    if (!imagePreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    const releaseBodyScroll = lockBodyScroll();
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      releaseBodyScroll();
    };
  }, [imagePreview]);

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

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const updateKeyboardState = () => {
      const hiddenHeight = window.innerHeight - viewport.height - viewport.offsetTop;
      setKeyboardOpen(hiddenHeight > 120);
    };
    updateKeyboardState();
    viewport.addEventListener("resize", updateKeyboardState);
    viewport.addEventListener("scroll", updateKeyboardState);
    return () => {
      viewport.removeEventListener("resize", updateKeyboardState);
      viewport.removeEventListener("scroll", updateKeyboardState);
    };
  }, []);

  const displayedConversations = useMemo(
    () => {
      const base = pendingDraft && !showArchived
        ? [pendingDraft, ...conversations.filter((item) => item.id !== DRAFT_CONVERSATION_ID)]
        : conversations;
      if (showArchived || base.length >= 18) return base;
      const existingIds = new Set(base.map((item) => item.id));
      return [
        ...base,
        ...demoConversations(user?.id).filter((item) => !existingIds.has(item.id)).slice(0, 18 - base.length),
      ];
    },
    [conversations, pendingDraft, showArchived, user?.id],
  );
  const active = useMemo(() => displayedConversations.find((item) => item.id === activeId) ?? null, [activeId, displayedConversations]);
  const backConversationCount = displayedConversations.length;

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
    const labels = isEn ? { booking: "Request", project: "Post", proposal: "Proposal", profile: "General chat" } : { booking: "Solicitud", project: "Publicación", proposal: "Propuesta", profile: "Chat general" };
    return { type, label: labels[type], title: item.context?.service_description || item.context?.title || item.subject || (isEn ? "General inquiry" : "Consulta general") };
  }, [isEn]);
  const contextSummaryFor = useCallback((item: Conversation) => {
    const context = contextFor(item);
    if (context.type === "profile") return context.title;
    return `${context.label}: ${context.title}`;
  }, [contextFor]);
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
        const firstDesktopConversation = window.matchMedia("(min-width: 1024px)").matches ? rows[0]?.id || null : null;
        setActiveId((current) => current || (pendingDraft ? DRAFT_CONVERSATION_ID : firstDesktopConversation));
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
    if (id.startsWith("demo-chat-")) {
      const demo = demoConversations(user?.id).find((item) => item.id === id);
      const professionalId = demo?.professional_profile_id || "__demo_professional__";
      setMessages([
        {
          id: `${id}-incoming`,
          sender_id: professionalId,
          body: demo?.last_message || (isEn ? "I can help with that." : "Con gusto puedo ayudarle con eso."),
          created_at: demo?.last_message_at || new Date().toISOString(),
          attachment_urls: [],
        },
        {
          id: `${id}-outgoing`,
          sender_id: user?.id || "__current_user__",
          body: isEn ? "Great, please send me the details." : "Perfecto, por favor envieme los detalles.",
          created_at: new Date().toISOString(),
          attachment_urls: [],
        },
      ]);
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
  }, [isEn, user?.id]);

  useEffect(() => { queueMicrotask(() => void loadConversations()); }, [loadConversations]);
  useEffect(() => { if (activeId) queueMicrotask(() => void loadThread(activeId)); }, [activeId, loadThread]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages, threadLoading, selectedAttachments]);
  useLayoutEffect(() => {
    resizeMessageTextarea(textareaRef.current);
  }, [draft]);
  useEffect(() => {
    selectedAttachmentsRef.current = selectedAttachments;
  }, [selectedAttachments]);
  useEffect(() => {
    if (!threadMenuOpen) return;
    function closeOnOutside(event: MouseEvent | TouchEvent) {
      if (threadMenuRef.current?.contains(event.target as Node)) return;
      setThreadMenuOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setThreadMenuOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("touchstart", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("touchstart", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [threadMenuOpen]);
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
    setActiveId(id); setMobileThread(true); setError(""); setThreadMenuOpen(false);
    if (id === DRAFT_CONVERSATION_ID) return;
    if (id.startsWith("demo-chat-")) return;
    router.replace(`/mensajes${showArchived ? "?chatStatus=archived&" : "?"}conversation=${id}`, { scroll: false });
  }

  function closeMobileThread() {
    setThreadMenuOpen(false);
    setMobileThread(false);
    setActiveId(null);
    setMessages([]);

    const params = new URLSearchParams(searchParams.toString());
    params.delete("conversation");
    params.delete("draftChat");
    params.delete("professionalId");
    params.delete("professionalName");
    params.delete("bookingId");
    params.delete("projectId");
    params.delete("proposalId");
    params.delete("contextTitle");
    params.delete("draftMessage");
    const qs = params.toString();
    router.replace(`/mensajes${qs ? `?${qs}` : ""}`, { scroll: false });
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
      let targetConversationId = activeId;
      if (activeId === DRAFT_CONVERSATION_ID && selectedAttachments.length) {
        const openRes = await fetch("/api/direct-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            professionalId: pendingDraftPayload?.professionalId,
            bookingId: pendingDraftPayload?.bookingId,
            projectId: pendingDraftPayload?.projectId,
            proposalId: pendingDraftPayload?.proposalId,
            contextTitle: pendingDraftPayload?.contextTitle,
            openConversation: true,
          }),
        });
        const openJson = await openRes.json();
        if (!openRes.ok || !openJson.conversationId) throw new Error(openJson.error || "Error");
        targetConversationId = openJson.conversationId;
      }
      const attachmentUrls = selectedAttachments.length ? await uploadSelectedAttachments(targetConversationId) : [];
      const payload = activeId === DRAFT_CONVERSATION_ID && !selectedAttachments.length
        ? {
          professionalId: pendingDraftPayload?.professionalId,
          bookingId: pendingDraftPayload?.bookingId,
          projectId: pendingDraftPayload?.projectId,
          proposalId: pendingDraftPayload?.proposalId,
          contextTitle: pendingDraftPayload?.contextTitle,
          message: body,
        }
        : { conversationId: targetConversationId, message: body, attachmentUrls };
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

  if (loading) return (
    <div className="ccr-delayed-loading flex min-h-[calc(100dvh-153px)] flex-col items-center justify-center gap-2 px-4 text-center lg:min-h-[520px]" aria-busy="true" role="status">
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
  const archiveLabel = showArchived ? (isEn ? "Unarchive" : "Desarchivar") : (isEn ? "Archive" : "Archivar");
  const deleteLabel = isEn ? "Delete" : "Eliminar";
  const activePersonName = activePerson?.name || "";
  return (
    <div className={cn(
      "direct-chat-shell grid h-full w-full min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:min-h-0 lg:grid-cols-[310px_minmax(0,1fr)] lg:gap-3 lg:bg-transparent xl:grid-cols-[330px_minmax(0,1fr)] 2xl:grid-cols-[330px_minmax(0,1fr)_300px]",
      mobileThread && "direct-chat-shell--thread",
    )}>
      <aside className={cn("flex min-h-0 flex-col border-r border-[#e3ebf1] bg-[#f8fbfd] lg:overflow-hidden lg:rounded-xl lg:border lg:border-[#dfe8f0] lg:bg-white lg:shadow-sm", mobileThread && "hidden lg:block")}>
        <div className="shrink-0 border-b border-[#e3ebf1] p-4">
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
        <div className="ccr-direct-chat-list min-h-0 flex-1 overflow-y-scroll overscroll-contain">
          {!showArchived && archivedCount > 0 && (
            <button type="button" onClick={() => updateArchiveView(true)} className="flex w-full items-center gap-3 border-b border-[#e7eef3] bg-white px-4 py-3 text-left transition hover:bg-[#f3f8fb]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef8fd] text-[#009FD9]">
                <Archive className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-extrabold text-[#162543]">{isEn ? "Archived" : "Archivados"}</span>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8eef4] px-1.5 text-[10px] font-extrabold text-[#526277]">{archivedCount > 99 ? "99+" : archivedCount}</span>
            </button>
          )}
          {filtered.map((item) => { const person = personFor(item); const unread = user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count; const highlighted = item.id === activeId; const hasUnread = !!unread; return (
            <button key={item.id} type="button" onClick={() => selectConversation(item.id)} className={cn("flex w-full gap-3.5 border-b border-[#e7eef3] bg-white px-4 py-4 text-left transition hover:bg-[#f8fbfd] lg:gap-4 lg:py-5", highlighted && "lg:bg-white lg:shadow-[inset_3px_0_0_#009FD9]")}>
              <Avatar className="h-12 w-12 lg:h-[54px] lg:w-[54px]"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] text-base font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1 pt-0.5"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-[15px] font-extrabold leading-tight text-[#162543] lg:text-base">{person.name}</strong><time className={cn("shrink-0 text-[11px] font-semibold text-[#8492a5]", hasUnread && "font-extrabold text-[#102746]")}>{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-1.5 flex items-center gap-2"><span className="min-w-0 flex-1 truncate text-[13px] leading-snug text-[#6b7a90]">{item.last_message || (isEn ? "Conversation started" : "Conversación iniciada")}</span>{!!unread && <span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#102746] px-1.5 text-[11px] font-extrabold text-white shadow-sm shadow-[#102746]/20">{unread}</span>}</span></span>
            </button>); })}
          {!filtered.length && <p className="p-6 text-center text-sm text-[#6b7a90]">{isEn ? "No matching conversations." : "No hay conversaciones que coincidan."}</p>}
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col bg-white lg:overflow-hidden lg:rounded-xl lg:border lg:border-[#dfe8f0] lg:shadow-sm", mobileThread ? "flex" : "hidden lg:flex")}>
        <header className="ccr-direct-chat-thread-header grid min-h-[64px] shrink-0 grid-cols-[40px_minmax(0,1fr)_42px] items-center gap-2 border-b border-[#e3ebf1] bg-white px-3 py-2 shadow-[0_8px_22px_-24px_rgba(15,23,42,0.45)] sm:grid-cols-[44px_minmax(0,1fr)_44px] sm:gap-3 sm:px-5 lg:flex lg:min-h-[65px] lg:justify-between">
          <button
            type="button"
            onClick={closeMobileThread}
            className={cn(
              "grid shrink-0 place-items-center rounded-full text-[#526277] transition active:bg-[#eef6fb] lg:hidden",
              backConversationCount > 1 ? "h-14 w-14 grid-cols-[19px_auto] gap-0 bg-[#eef9fd] pr-1.5 font-extrabold text-[#102746]" : "h-10 w-10",
            )}
            aria-label={isEn ? "Back to conversations" : "Volver a conversaciones"}
          >
            {backConversationCount > 1 ? <ChevronLeft className="h-7 w-7 translate-x-1" strokeWidth={2.6} /> : <ArrowLeft className="h-5 w-5" />}
            {backConversationCount > 1 && <span className="text-[19px] leading-none">{backConversationCount}</span>}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" onClick={() => activePerson?.profileHref && router.push(activePerson.profileHref)} disabled={!activePerson?.profileHref} className={cn("shrink-0 rounded-full", activePerson?.profileHref && "transition hover:ring-2 hover:ring-[#9fd8ec]")}>
              <Avatar className="h-10 w-10"><AvatarImage src={activePerson?.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] text-sm font-bold text-[#009FD9]">{getInitials(activePersonName)}</AvatarFallback></Avatar>
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center">
                {activePerson?.profileHref ? (
                  <button type="button" onClick={() => router.push(activePerson.profileHref!)} className="min-w-0 max-w-full truncate text-left text-base font-extrabold leading-tight text-[#162543] transition hover:text-[#009FD9] hover:underline">
                    {activePerson.name}
                  </button>
                ) : (
                  <p className="min-w-0 max-w-full truncate text-base font-extrabold leading-tight text-[#162543]">{activePerson?.name}</p>
                )}
              </div>
            </div>
          </div>
          <div ref={threadMenuRef} className="relative">
            <ChatActionButton
              label={isEn ? "Chat options" : "Opciones del chat"}
              onClick={() => setThreadMenuOpen((open) => !open)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9] 2xl:hidden"
            >
              <MoreHorizontal className="h-5 w-5" />
            </ChatActionButton>
            {threadMenuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-56 overflow-hidden rounded-xl border border-[#dce7ef] bg-white py-1.5 text-sm font-bold text-[#25364d] shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setThreadMenuOpen(false);
                    void toggleArchiveActive();
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-[#f3f8fb]"
                >
                  {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  <span>{archiveLabel}</span>
                </button>
                {showArchived && (
                  <button
                    type="button"
                    onClick={() => {
                      setThreadMenuOpen(false);
                      void deleteArchivedActive();
                    }}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-red-600 transition hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>{deleteLabel}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
        <div ref={scrollRef} className="ccr-direct-chat-thread-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#f3f7fa] px-4 pb-4 pt-5 sm:px-6">
          {threadLoading ? <div className="ccr-delayed-loading grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div> : messages.map((message, index) => {
            const mine = message.sender_id === user?.id;
            const showDate = messageDateKey(message.created_at) !== messageDateKey(messages[index - 1]?.created_at);
            return (
              <div key={message.id} className="space-y-2">
                {showDate && (
                  <div className="flex justify-center py-1">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-extrabold text-[#6b7a90] shadow-sm ring-1 ring-[#dce8f0]">
                      {messageDateLabel(message.created_at, locale)}
                    </span>
                  </div>
                )}
              <div className={cn("flex items-end gap-2", mine && "justify-end")}>
                {!mine && (
                  <Avatar className="h-7 w-7 shrink-0 shadow-sm">
                    <AvatarImage src={activePerson?.avatar ?? undefined} alt={activePersonName} />
                    <AvatarFallback className="bg-[#e8f8ff] text-[10px] font-extrabold text-[#009FD9]">
                      {getInitials(activePersonName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                  <div className={cn(
                    "min-w-[86px] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_4px_12px_-8px_rgba(15,23,42,0.55)] break-words [overflow-wrap:anywhere]",
                    mine
                      ? "max-w-[86%] rounded-br-md bg-[#009FD9] font-medium text-white sm:max-w-[78%] lg:max-w-[36rem] xl:max-w-[40rem]"
                      : "max-w-[calc(86%_-_2.25rem)] rounded-bl-md border border-[#e5edf3] bg-white text-[#25364d] sm:max-w-[72%] lg:max-w-[36rem] xl:max-w-[40rem]",
                  )}>
                  {message.body && !(message.attachment_urls?.length && (message.body === "Archivo adjunto" || message.body === "Attachment")) && (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  )}
                  {!!message.attachment_urls?.length && (
                    <div className={cn("grid gap-2", message.body && message.body !== "Archivo adjunto" && message.body !== "Attachment" && "mt-2 pt-1")}>
                      {message.attachment_urls.map((attachment, index) => {
                        const href = attachment.url ?? undefined;
                        const image = isImageAttachment(attachment);
                        return image ? (
                          <button
                            key={`${message.id}-${attachment.path ?? attachment.name}-${index}`}
                            type="button"
                            onClick={() => href && setImagePreview(attachment)}
                            disabled={!href}
                            className={cn(
                              "group relative min-h-36 overflow-hidden rounded-xl border text-left transition",
                              mine ? "border-white/30 bg-white/10 hover:bg-white/15" : "border-[#dce8f0] bg-[#f7fbfd] hover:border-[#b9d8e8]",
                            )}
                            aria-label={isEn ? `Open ${attachment.name}` : `Abrir ${attachment.name}`}
                          >
                            {href ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={href} alt={attachment.name} className="max-h-72 min-h-36 w-full object-cover" />
                            ) : (
                              <span className="grid min-h-36 place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></span>
                            )}
                          </button>
                        ) : (
                          <a
                            key={`${message.id}-${attachment.path ?? attachment.name}-${index}`}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(
                              "group flex min-w-[220px] items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
                              mine ? "border-white/30 bg-white/10 hover:bg-white/15" : "border-[#dce8f0] bg-[#f7fbfd] hover:border-[#b9d8e8]",
                            )}
                          >
                            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg", mine ? "bg-white/15 text-white" : "bg-white text-[#009FD9]")}>
                              <FileText className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-extrabold">{attachment.name}</span>
                              <span className={cn("block text-[10px]", mine ? "text-white/75" : "text-[#6b7a90]")}>PDF · {attachmentLabel(attachment.size)}</span>
                            </span>
                            <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", mine ? "bg-white/15" : "bg-white")}>
                              <Download className="h-4 w-4" />
                            </span>
                          </a>
                        );
                      })}
                    </div>
                  )}
                  <time className={cn("mt-1 block text-right text-[10px]", mine ? "text-white/75" : "text-[#8996a8]")}>{messageTimeLabel(message.created_at, locale)}</time>
                </div>
              </div>
              </div>
            );
          })}
        </div>
        {(error || attachmentError) && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error || attachmentError}</p>}
        <form onSubmit={submit} className={cn(
          "ccr-direct-chat-composer shrink-0 border-t border-[#e3ebf1] bg-white px-3 pt-2 sm:px-4",
          keyboardOpen ? "pb-2 sm:pb-3" : "pb-[calc(1.75rem+env(safe-area-inset-bottom))] sm:pb-6",
        )}>
          {!!selectedAttachments.length && (
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {selectedAttachments.map((attachment) => (
                <div key={attachment.id} className="relative flex h-16 min-w-40 max-w-48 items-center gap-2 rounded-xl border border-[#d8e5ee] bg-[#f7fbfd] p-2 pr-8">
                  {attachment.previewUrl ? (
                     <button
                       type="button"
                       onClick={() => setImagePreview({
                         name: attachment.file.name,
                         type: attachment.file.type,
                         size: attachment.file.size,
                         url: attachment.previewUrl,
                       })}
                       className="h-11 w-11 shrink-0 overflow-hidden rounded-lg"
                       aria-label={isEn ? `Preview ${attachment.file.name}` : `Vista previa de ${attachment.file.name}`}
                     >
                       {/* eslint-disable-next-line @next/next/no-img-element */}
                       <img src={attachment.previewUrl} alt={attachment.file.name} className="h-full w-full object-cover" />
                     </button>
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
          <div className="flex items-end gap-2.5">
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
            disabled={sending || selectedAttachments.length >= MAX_ATTACHMENTS}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[#526277] transition hover:bg-[#eef9fd] hover:text-[#009FD9] disabled:opacity-45"
            aria-label={isEn ? "Attach file" : "Adjuntar archivo"}
          >
            <Plus className="h-8 w-8" strokeWidth={1.9} />
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
            className="ccr-direct-chat-textarea max-h-[132px] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto overscroll-contain rounded-[22px] border border-[#d8e5ee] bg-white px-4 py-2.5 pr-2 text-[15px] leading-6 outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
          />
          <button
            type="submit"
            disabled={sending || (!draft.trim() && !selectedAttachments.length)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white shadow-[0_8px_18px_-12px_rgba(0,159,217,0.85)] transition hover:bg-[#008fca] disabled:bg-[#cfdde5] disabled:shadow-none"
            aria-label={isEn ? "Send" : "Enviar"}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-[22px] w-[22px]" />}
          </button>
          </div>
        </form>
      </section>
      <aside className="hidden min-h-0 flex-col overflow-hidden rounded-xl border border-[#dfe8f0] bg-white px-5 py-6 shadow-sm 2xl:flex">
        <div className="flex flex-col items-center text-center">
          <button type="button" onClick={() => activePerson?.profileHref && router.push(activePerson.profileHref)} disabled={!activePerson?.profileHref} className={cn("rounded-full", activePerson?.profileHref && "transition hover:ring-2 hover:ring-[#9fd8ec]")}>
            <Avatar className="h-20 w-20"><AvatarImage src={activePerson?.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] text-xl font-bold text-[#009FD9]">{getInitials(activePersonName)}</AvatarFallback></Avatar>
          </button>
          <p className="mt-3 max-w-full truncate text-base font-extrabold text-[#162543]">{activePersonName}</p>
          {activePerson?.profileHref && (
            <button type="button" onClick={() => router.push(activePerson.profileHref!)} className="mt-2 rounded-full bg-[#eef8fd] px-4 py-2 text-xs font-extrabold text-[#008fc4] transition hover:bg-[#dff3fb]">
              {isEn ? "View profile" : "Ver perfil"}
            </button>
          )}
        </div>
        <div className="mt-8 space-y-3 border-t border-[#e7eef3] pt-5 text-sm font-bold text-[#526277]">
          <p>{isEn ? "Chat options" : "Opciones del chat"}</p>
          <button type="button" onClick={() => void toggleArchiveActive()} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-[#f3f8fb]">
            <span>{archiveLabel}</span>
            {showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          {showArchived && (
            <button type="button" onClick={() => void deleteArchivedActive()} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-red-600 transition hover:bg-red-50">
              <span>{deleteLabel}</span>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </aside>
      {imagePreview?.url && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[1000] flex flex-col bg-black/95 text-white" role="dialog" aria-modal="true" aria-label={imagePreview.name}>
          <div className="flex min-h-16 shrink-0 items-center gap-3 px-3 pt-[env(safe-area-inset-top)] sm:px-5">
            <button
              type="button"
              onClick={() => setImagePreview(null)}
              className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/10"
              aria-label={isEn ? "Close image" : "Cerrar imagen"}
            >
              <X className="h-6 w-6" />
            </button>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-sm">{imagePreview.name}</strong>
              <span className="text-xs text-white/65">{attachmentLabel(imagePreview.size)}</span>
            </div>
            {imagePreview.path && (
              <a
                href={imagePreview.url}
                target="_blank"
                rel="noreferrer"
                className="grid h-11 w-11 place-items-center rounded-full transition hover:bg-white/10"
                aria-label={isEn ? "Download image" : "Descargar imagen"}
              >
                <Download className="h-5 w-5" />
              </a>
            )}
          </div>
          <button
            type="button"
            onClick={() => setImagePreview(null)}
            className="flex min-h-0 flex-1 items-center justify-center p-3 sm:p-6"
            aria-label={isEn ? "Close image" : "Cerrar imagen"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview.url} alt={imagePreview.name} className="max-h-full max-w-full select-none object-contain" />
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
