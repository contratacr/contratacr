"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, ArrowLeft, ChevronRight, Download, FileText, Flag, Loader2, MessageSquareMore, Paperclip, Search, SendHorizontal, Trash2, X } from "lucide-react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials, cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime, useNativeApp } from "@/hooks/use-native-app";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";
import { useContainedTouchScroll } from "@/hooks/use-contained-touch-scroll";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { createClient } from "@/lib/supabase/client";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { BrandLoadingMark, PanelEmptyState } from "@/components/ui/content-loading";
import { IMAGE_DOC_ACCEPT } from "@/lib/upload-validation";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { readCachedConversations, storeConversations } from "@/lib/direct-chat/conversations-cache";
import { ProgressiveImage } from "@/components/ui/progressive-image";

type Person = { id?: string; full_name?: string | null; avatar_url?: string | null };
type Conversation = {
  id: string; client_id: string; professional_profile_id: string; professional_id?: string | null;
  booking_id?: string | null; project_id?: string | null; proposal_id?: string | null;
  subject?: string | null; last_message?: string | null; last_message_at?: string | null;
  status?: "open" | "archived" | "blocked";
  client_unread_count?: number; professional_unread_count?: number;
  client_profile?: Person | null;
  client_has_app?: boolean;
  professional_has_app?: boolean;
  professional_whatsapp?: string | null;
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
const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

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

// A chat photo shows its exact frame with a soft tone and a centered loading
// circle until the file paints — never a bare white box (signed Supabase URLs
// have no blurred derivative to show, unlike Cloudinary sources).
function ChatImage({ href, alt }: { href: string; alt: string }) {
  const boxRef = useRef<HTMLSpanElement | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const check = () => {
      const img = box.querySelector("img");
      if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
    };
    check();
    const onLoad = () => setLoaded(true);
    box.addEventListener("load", onLoad, true);
    box.addEventListener("error", onLoad, true);
    return () => {
      box.removeEventListener("load", onLoad, true);
      box.removeEventListener("error", onLoad, true);
    };
  }, [href]);
  return (
    <span ref={boxRef} className="relative block aspect-[4/3] w-full">
      <ProgressiveImage src={href} alt={alt} fit="cover" wrapperClassName="block h-full w-full" className="h-full w-full" />
      {!loaded && (
        <span className="absolute inset-0 grid place-items-center bg-[#e5edf3]">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/30"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>
        </span>
      )}
    </span>
  );
}

function attachmentLabel(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function isImageAttachment(attachment: Pick<DirectAttachment, "type" | "name">) {
  return attachment.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|gif|heic|heif)$/i.test(attachment.name);
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

// A session refresh can race these calls right after the app resumes; one
// retry after refreshing turns a spurious "No autorizado" into a normal load.
async function fetchWithSessionRetry(input: string, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  try { await createClient().auth.refreshSession(); } catch { /* the retry answers */ }
  return fetch(input, init);
}

// "Isaac Alberto Sanchez Monge" reads as "Isaac Sanchez" in the thread header:
// long legal names wrapped to two lines and pushed the actions off the bar.
function compactPersonName(name: string) {
  const words = name.trim().split(/\s+/);
  if (words.length >= 4) return `${words[0]} ${words[2]}`;
  if (words.length === 3) return `${words[0]} ${words[1]}`;
  return name;
}

const DRAFTS_STORAGE_PREFIX = "ccr:chat:drafts:";
const PENDING_DRAFT_STORAGE_PREFIX = "ccr:chat:pending-draft:";
type StoredPendingDraft = { payload: PendingDraft; name: string; text: string };
function readStoredDrafts(userId: string): Record<string, string> {
  try { return JSON.parse(window.localStorage.getItem(DRAFTS_STORAGE_PREFIX + userId) || "{}") as Record<string, string>; } catch { return {}; }
}
function writeStoredDrafts(userId: string, drafts: Record<string, string>) {
  try {
    if (Object.keys(drafts).length) window.localStorage.setItem(DRAFTS_STORAGE_PREFIX + userId, JSON.stringify(drafts));
    else window.localStorage.removeItem(DRAFTS_STORAGE_PREFIX + userId);
  } catch { /* drafts are a convenience */ }
}
function readStoredPendingDraft(userId: string): StoredPendingDraft | null {
  try { return JSON.parse(window.localStorage.getItem(PENDING_DRAFT_STORAGE_PREFIX + userId) || "null") as StoredPendingDraft | null; } catch { return null; }
}
function writeStoredPendingDraft(userId: string, value: StoredPendingDraft | null) {
  try {
    if (value) window.localStorage.setItem(PENDING_DRAFT_STORAGE_PREFIX + userId, JSON.stringify(value));
    else window.localStorage.removeItem(PENDING_DRAFT_STORAGE_PREFIX + userId);
  } catch { /* drafts are a convenience */ }
}

export function DirectChatInbox() {
  const locale = useLocale();
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const nativeApp = useNativeApp();
  const userId = user?.id ?? null;
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
  const [preparingAttachments, setPreparingAttachments] = useState(false);
  const [error, setError] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<SelectedAttachment[]>([]);
  const [imagePreview, setImagePreview] = useState<DirectAttachment | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [mobileThread, setMobileThread] = useState(!!searchParams.get("conversation"));
  const [storedDrafts, setStoredDrafts] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedAttachmentsRef = useRef<SelectedAttachment[]>([]);
  const draftConversationRef = useRef<string | null>(null);
  const urlDraftRef = useRef(searchParams.get("draftMessage") || "");
  const backHrefRef = useRef((() => {
    const raw = searchParams.get("back") || "";
    if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "";
    return raw.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
  })());
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
    const body = document.body;
    root.classList.add("contratacr-chat-thread-open");
    if (isNativeAppRuntime()) body.classList.add("contratacr-chat-thread-open");
    const releaseBodyScroll = lockBodyScroll();
    return () => {
      root.classList.remove("contratacr-chat-thread-open");
      body.classList.remove("contratacr-chat-thread-open");
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
    const labels = isEn ? { booking: "Request", project: "Project", proposal: "Proposal", profile: "Profile" } : { booking: "Solicitud", project: "Proyecto", proposal: "Propuesta", profile: "Perfil" };
    return { type, label: labels[type], title: item.context?.service_description || item.context?.title || item.subject || (isEn ? "General inquiry" : "Consulta general") };
  }, [isEn]);
  const contextSummaryFor = useCallback((item: Conversation) => {
    const context = contextFor(item);
    if (context.type === "profile") return context.title;
    return `${context.label} · ${context.title}`;
  }, [contextFor]);
  const contextActionFor = useCallback((item: Conversation) => {
    const type = item.context?.type ?? "profile";
    const labels = isEn ? { booking: "View request", project: "View project", proposal: "View proposal", profile: "View profile" } : { booking: "Ver solicitud", project: "Ver proyecto", proposal: "Ver propuesta", profile: "Ver perfil" };
    return labels[type];
  }, [isEn]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return displayedConversations;
    return displayedConversations.filter((item) => `${personFor(item).name} ${contextSummaryFor(item)} ${item.last_message ?? ""}`.toLocaleLowerCase(locale).includes(needle));
  }, [contextSummaryFor, displayedConversations, locale, personFor, query]);

  const loadConversations = useCallback(async (quiet = false) => {
    // Paint the warmed list at once; the network refresh below replaces it.
    const warm = !showArchived && !quiet ? (readCachedConversations() as Conversation[] | null) : null;
    if (warm) {
      setConversations(warm);
      setLoading(false);
    } else if (!quiet) {
      setLoading(true);
    }
    setError("");
    try {
      const res = await fetchWithSessionRetry(`/api/direct-chat${showArchived ? "?status=archived" : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      const rows = json.conversations ?? [];
      if (!showArchived) storeConversations(rows);
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
    // A thread opened before paints from the cache at once and refreshes quietly.
    const threadKey = userId ? `chat:thread:${userId}:${id}` : null;
    const warmEntry = threadKey ? getDashboardCache<DirectMessage[] | { rows: DirectMessage[]; signedAt: number }>(threadKey) : null;
    const warm = Array.isArray(warmEntry) ? warmEntry : warmEntry?.rows ?? null;
    const warmFresh = Boolean(warmEntry) && !Array.isArray(warmEntry) && Date.now() - (warmEntry as { signedAt: number }).signedAt < 45 * 60 * 1000;
    if (warm) setMessages(warm);
    else if (!quiet) setThreadLoading(true);
    try {
      const res = await fetchWithSessionRetry(`/api/direct-chat?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      const rows = (json.messages ?? []) as DirectMessage[];
      // Reuse this session's still-fresh signed attachment URLs: the server
      // mints a new token per load, which defeated the browser cache and
      // re-downloaded every image on each open.
      const merged = warmFresh && warm ? rows.map((row) => {
        const cached = warm.find((w) => w.id === row.id);
        if (!cached?.attachment_urls?.length || !row.attachment_urls?.length) return row;
        return { ...row, attachment_urls: row.attachment_urls.map((a) => {
          const kept = cached.attachment_urls?.find((x) => x.path && x.path === a.path && x.url);
          return kept ? { ...a, url: kept.url } : a;
        }) };
      }) : rows;
      if (threadKey) setDashboardCache(threadKey, { rows: merged, signedAt: warmFresh && warmEntry && !Array.isArray(warmEntry) ? warmEntry.signedAt : Date.now() });
      setMessages(merged);
      setConversations((prev) => prev.map((item) => item.id === id ? { ...item, client_unread_count: 0, professional_unread_count: 0 } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load the conversation." : "No se pudo cargar la conversación.");
    } finally { if (!quiet) setThreadLoading(false); }
  }, [isEn, userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // A guest deep-link lands on login and returns to this exact chat after
      // signing in or registering (the login page honors /mensajes redirects).
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    queueMicrotask(() => void loadConversations());
  }, [authLoading, user, router, loadConversations]);
  useEffect(() => {
    if (authLoading || !user || !activeId) return;
    queueMicrotask(() => void loadThread(activeId));
  }, [authLoading, user, activeId, loadThread]);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
  }, [messages, threadLoading, selectedAttachments]);
  // ── Composer drafts survive leaving the chat ────────────────────────────
  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => setStoredDrafts(readStoredDrafts(userId)));
  }, [userId]);
  const pendingDraftName = pendingDraft
    ? pendingDraft.professionals?.profiles?.full_name || pendingDraft.client_profile?.full_name || ""
    : "";
  useEffect(() => {
    if (!userId || !activeId) return;
    if (draftConversationRef.current !== activeId) {
      // Conversation switch: recover ITS saved text instead of persisting the
      // previous conversation's words under the wrong id.
      draftConversationRef.current = activeId;
      const saved = readStoredDrafts(userId)[activeId];
      const urlDraft = urlDraftRef.current;
      urlDraftRef.current = "";
      setDraft(saved ?? (activeId === DRAFT_CONVERSATION_ID ? pendingDraftPayload?.draftMessage || "" : urlDraft));
      return;
    }
    const text = draft.trim() ? draft : "";
    setStoredDrafts((current) => {
      if ((current[activeId] ?? "") === text) return current;
      const next = { ...current };
      if (text) next[activeId] = text; else delete next[activeId];
      writeStoredDrafts(userId, next);
      return next;
    });
    if (activeId === DRAFT_CONVERSATION_ID && pendingDraftPayload) {
      writeStoredPendingDraft(userId, text ? { payload: pendingDraftPayload, name: pendingDraftName, text } : null);
    }
  }, [draft, activeId, userId, pendingDraftPayload, pendingDraftName]);
  // A draft chat that kept its text comes back in the list on the next visit;
  // one that was left empty is simply gone.
  useEffect(() => {
    if (!userId || pendingDraft) return;
    if (searchParams.get("draftChat") === "1" || searchParams.get("conversation")) return;
    const stored = readStoredPendingDraft(userId);
    if (!stored?.text.trim()) return;
    const params = new URLSearchParams({ draftChat: "1" });
    if (stored.payload.professionalId) params.set("professionalId", stored.payload.professionalId);
    if (stored.name) params.set("professionalName", stored.name);
    if (stored.payload.bookingId) params.set("bookingId", stored.payload.bookingId);
    if (stored.payload.projectId) params.set("projectId", stored.payload.projectId);
    if (stored.payload.proposalId) params.set("proposalId", stored.payload.proposalId);
    if (stored.payload.contextTitle) params.set("contextTitle", stored.payload.contextTitle);
    params.set("draftMessage", stored.text);
    const revived = buildPendingDraft(params, userId, isEn);
    if (revived.conversation) {
      queueMicrotask(() => {
        setPendingDraft(revived.conversation);
        setPendingDraftPayload(revived.payload);
      });
    }
  }, [userId, pendingDraft, searchParams, isEn]);
  const keepComposerVisible = useCallback(() => {
    if (!mobileThread) return;
    window.setTimeout(() => {
      const scroller = scrollRef.current;
      if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
      textareaRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 120);
  }, [mobileThread]);
  useEffect(() => {
    resizeMessageTextarea(textareaRef.current);
    const frame = window.requestAnimationFrame(() => resizeMessageTextarea(textareaRef.current));
    return () => window.cancelAnimationFrame(frame);
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
    backHrefRef.current = "";
    setActiveId(id); setMobileThread(true); setError("");
    if (id === DRAFT_CONVERSATION_ID) return;
    router.replace(`/mensajes${showArchived ? "?chatStatus=archived&" : "?"}conversation=${id}`, { scroll: false });
  }

  function openActiveProfile() {
    if (!activePerson?.profileHref) return;
    const path = window.location.pathname.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
    const from = encodeURIComponent(path + window.location.search);
    router.push(`${activePerson.profileHref}?from=${from}`);
  }

  function closeThread() {
    // Opened from outside (a profile, request or project): back goes THERE.
    if (backHrefRef.current) {
      const target = backHrefRef.current;
      backHrefRef.current = "";
      router.push(target);
      return;
    }
    // Leaving an empty draft chat drops it from the list; typed text keeps it.
    if (activeId === DRAFT_CONVERSATION_ID && !draft.trim()) {
      setPendingDraft(null);
      setPendingDraftPayload(null);
      if (userId) writeStoredPendingDraft(userId, null);
      setActiveId(conversations[0]?.id ?? null);
    }
    setMobileThread(false);
  }

  async function addAttachments(files: FileList | null) {
    setAttachmentError("");
    if (!files?.length) return;
    if (activeId === DRAFT_CONVERSATION_ID) {
      setAttachmentError(isEn ? "Send the first message before attaching files." : "Envia el primer mensaje antes de adjuntar archivos.");
      return;
    }
    setPreparingAttachments(true);
    const next = [...selectedAttachments];
    try {
      for (const file of Array.from(files)) {
        if (next.length >= MAX_ATTACHMENTS) {
          setAttachmentError(isEn ? "You can attach up to 3 files per message." : "Puedes adjuntar hasta 3 archivos por mensaje.");
          break;
        }
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        try {
          const ready = isPdf
            ? file
            : await prepareImageForUpload(file, { maxDimension: 1600, targetBytes: 3.8 * 1024 * 1024 });
          if (ready.size > MAX_ATTACHMENT_BYTES) {
            setAttachmentError(isEn ? "Each file must be 4 MB or less." : "Cada archivo debe pesar 4 MB o menos.");
            continue;
          }
          next.push({
            id: `${Date.now()}-${crypto.randomUUID()}`,
            file: ready,
            previewUrl: !isPdf ? URL.createObjectURL(ready) : undefined,
          });
        } catch (attachmentError) {
          const code = getImageUploadPreparationErrorCode(attachmentError);
          setAttachmentError(code === "too_large"
            ? (isEn ? "That image is too large. Choose a lighter image." : "La imagen es muy pesada. Elige una imagen más liviana.")
            : (isEn ? "Attach JPG, PNG, WEBP, AVIF, HEIC, HEIF, GIF, or PDF files only." : "Adjunta solo archivos JPG, PNG, WEBP, AVIF, HEIC, HEIF, GIF o PDF."));
        }
      }
      setSelectedAttachments(next);
    } finally {
      setPreparingAttachments(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function reportAndBlockActive() {
    if (!active || active.id === DRAFT_CONVERSATION_ID) return;
    if (reportReason.trim().length < 3) return;
    setReportBusy(true);
    setError("");
    const response = await fetchWithSessionRetry("/api/direct-chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: active.id, action: "block_and_report", reason: reportReason }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(result.error || (isEn ? "Could not report this user." : "No se pudo reportar al usuario."));
      setReportBusy(false);
      return;
    }
    setReportBusy(false);
    setReportOpen(false);
    setReportReason("");
    setMessages([]);
    setActiveId(null);
    setMobileThread(false);
    await loadConversations();
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
      const res = await fetchWithSessionRetry("/api/direct-chat/attachments", { method: "POST", body: formData });
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
        const openRes = await fetchWithSessionRetry("/api/direct-chat", {
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
      const res = await fetchWithSessionRetry("/api/direct-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      clearSelectedAttachments();
      if (userId) {
        setStoredDrafts((current) => {
          const next = { ...current };
          delete next[activeId];
          delete next[DRAFT_CONVERSATION_ID];
          writeStoredDrafts(userId, next);
          return next;
        });
        writeStoredPendingDraft(userId, null);
      }
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
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId, status: showArchived ? "open" : "archived" }) });
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || (isEn ? "Could not update the conversation." : "No se pudo actualizar la conversación.")); return; }
    const remaining = conversations.filter((item) => item.id !== activeId);
    const nextId = remaining[0]?.id ?? null;
    setConversations(remaining);
    setArchivedCount((count) => showArchived ? Math.max(0, count - 1) : count + 1);
    updateArchiveView(showArchived, nextId);
  }

  async function deleteArchivedActive() {
    if (!activeId || !showArchived || activeId === DRAFT_CONVERSATION_ID) return;
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId }) });
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
    <div className="ccr-delayed-loading flex min-h-[calc(100dvh-153px)] items-center justify-center px-4 sm:min-h-[520px]" aria-busy="true" role="status">
      <BrandLoadingMark />
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
  const otherHasApp = active
    ? (activePerson?.role === "professional" ? active.professional_has_app : active.client_has_app)
    : undefined;
  // Last resort after a full day without an answer from a professional who is
  // not in the app: let the client continue on WhatsApp instead of losing them.
  const whatsappEscape = (() => {
    if (!active || !user?.id || activePerson?.role !== "professional" || otherHasApp || !active.professional_whatsapp) return null;
    const last = messages[messages.length - 1];
    if (!last || last.sender_id !== user.id) return null;
    if (Date.now() - new Date(last.created_at).getTime() < 24 * 60 * 60 * 1000) return null;
    const digits = active.professional_whatsapp.replace(/\D/g, "");
    const number = digits.length === 8 ? `506${digits}` : digits;
    const text = isEn
      ? "Hi, I wrote to you on ContrataCR and wanted to follow up."
      : "Hola, te escribí por ContrataCR y quería dar seguimiento.";
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  })();
  const activeContextTitle = activeContext?.title || "";
  const activeContextAction = active ? contextActionFor(active) : "";
  // One compact, descriptive line: "Solicitud · Cámaras de seguridad" instead
  // of a bare uppercase label stacked over the title.
  const headerContextLine = activeContext
    ? activeContext.type !== "profile" && activeContextTitle
      ? `${activeContext.label} · ${activeContextTitle}`
      : activeContextTitle
    : "";
  return (
    <div className={cn(
      "direct-chat-shell grid h-[calc(100dvh-153px)] min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:h-[min(760px,calc(100dvh-220px))] lg:min-h-[500px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]",
      mobileThread && "direct-chat-shell--thread",
    )}>
      <aside className={cn("flex min-h-0 flex-col border-r border-[#e3ebf1] bg-[#f8fbfd]", mobileThread && "hidden lg:block")}>
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
        <div className="ccr-direct-chat-list min-h-0 flex-1 overflow-y-auto">
          {!showArchived && (nativeApp || archivedCount > 0) && (
            <button type="button" onClick={() => updateArchiveView(true)} className="flex w-full items-center gap-3 border-b border-[#e7eef3] bg-white px-4 py-3 text-left transition hover:bg-[#f3f8fb]">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eef8fd] text-[#009FD9]">
                <Archive className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1 text-sm font-extrabold text-[#162543]">{isEn ? "Archived" : "Archivados"}</span>
              {archivedCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8eef4] px-1.5 text-[10px] font-extrabold text-[#526277]">{archivedCount > 99 ? "99+" : archivedCount}</span>}
            </button>
          )}
          {filtered.map((item) => { const person = personFor(item); const unread = user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count; return (
            <button key={item.id} type="button" onClick={() => selectConversation(item.id)} className={cn("flex w-full gap-3 border-b border-[#e7eef3] p-4 text-left transition hover:bg-white", item.id === activeId && "lg:bg-white lg:shadow-[inset_3px_0_0_#009FD9]")}>
              <Avatar className="h-11 w-11"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong><time className="shrink-0 text-[11px] text-[#8492a5]">{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-1 flex items-center gap-2"><span className={cn("min-w-0 flex-1 truncate text-xs", storedDrafts[item.id] ? "italic text-[#8a94a6]" : "text-[#6b7a90]")}>{storedDrafts[item.id] ? `${isEn ? "Draft" : "Borrador"}: ${storedDrafts[item.id]}` : item.last_message || (isEn ? "Conversation started" : "Conversación iniciada")}</span>{!!unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{unread}</span>}</span></span>
            </button>); })}
          {!filtered.length && <p className="p-6 text-center text-sm text-[#6b7a90]">{isEn ? "No matching conversations." : "No hay conversaciones que coincidan."}</p>}
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col", mobileThread ? "flex" : "hidden lg:flex")}>
        <header className="ccr-direct-chat-thread-header flex min-h-[65px] shrink-0 items-center gap-2.5 border-b border-[#e3ebf1] bg-white px-3 py-2.5 shadow-[0_8px_22px_-24px_rgba(15,23,42,0.45)] sm:gap-3 sm:px-5 sm:py-3">
          <button type="button" data-native-back="conversations" onClick={closeThread} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#526277] transition active:bg-[#eef6fb] lg:hidden" aria-label={isEn ? "Back to conversations" : "Volver a conversaciones"}><ArrowLeft className="h-5 w-5" /></button>
          <button type="button" onClick={openActiveProfile} disabled={!activePerson?.profileHref} className={cn("shrink-0 rounded-full", activePerson?.profileHref && "transition hover:ring-2 hover:ring-[#9fd8ec]")}>
            <Avatar className="h-9 w-9 sm:h-10 sm:w-10"><AvatarImage src={activePerson?.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] text-sm font-bold text-[#009FD9]">{getInitials(activePersonName)}</AvatarFallback></Avatar>
          </button>
          <div className="min-w-0 flex-1">
            {activePerson?.profileHref ? (
              <button type="button" onClick={openActiveProfile} className="flex !min-h-0 min-w-0 max-w-full items-center gap-0.5 text-left text-[15px] font-extrabold leading-tight text-[#162543] transition hover:text-[#009FD9]">
                <span className="min-w-0 truncate">{compactPersonName(activePerson.name)}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[#8ea0b5]" />
              </button>
            ) : (
              <p className={nativeApp ? "text-[15px] font-extrabold leading-tight text-[#162543] truncate" : "truncate text-[15px] font-extrabold leading-tight text-[#162543]"}>{activePerson ? compactPersonName(activePerson.name) : ""}</p>
            )}

          </div>
          {nativeApp && <ChatActionButton label={isEn ? "Report and block" : "Reportar y bloquear"} onClick={() => setReportOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-white text-red-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"><Flag className="h-4 w-4" /></ChatActionButton>}
          <ChatActionButton label={archiveLabel} onClick={() => void toggleArchiveActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9]">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</ChatActionButton>
          {showArchived && (
            <ChatActionButton label={deleteLabel} onClick={() => void deleteArchivedActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-red-100 bg-white text-red-500 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </ChatActionButton>
          )}
        </header>
        <div ref={scrollRef} className="ccr-direct-chat-thread-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#f3f7fa] px-4 py-5 sm:px-6">
          {!threadLoading && headerContextLine && activeContext?.type !== "profile" && (
            <button
              type="button"
              onClick={() => {
                if (!detailHref) return;
                const chatPath = activeId ? `/mensajes?conversation=${encodeURIComponent(activeId)}` : "/mensajes";
                router.push(`${detailHref}&returnTo=${encodeURIComponent(chatPath)}`);
              }}
              disabled={!detailHref}
              className="mx-auto flex max-w-full items-center gap-2 rounded-full border border-[#cfe8f4] bg-[#eaf7fd] px-3.5 py-1.5 text-xs font-bold text-[#00789f] transition enabled:hover:bg-[#ddf1fb]"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 truncate">{headerContextLine}</span>
              {detailHref && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            </button>
          )}
          {threadLoading ? <div className="ccr-delayed-loading grid h-full place-items-center"><Loader2 className="h-6 w-6 animate-spin text-[#009FD9]" /></div> : messages.map((message) => {
            const mine = message.sender_id === user?.id;
            const uploading = message.id.startsWith("pending-");
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
                              <ChatImage href={href} alt={attachment.name} />
                            ) : (
                              <span className="grid aspect-[4/3] w-full place-items-center"><Loader2 className="h-5 w-5 animate-spin" /></span>
                            )}
                            {uploading && href && (
                              <span className="absolute inset-0 grid place-items-center bg-black/25">
                                <span className="grid h-10 w-10 place-items-center rounded-full bg-black/45"><Loader2 className="h-5 w-5 animate-spin text-white" /></span>
                              </span>
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
                              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
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
                  <time className={cn("mt-1 block text-right text-[10px]", mine ? "text-white/75" : "text-[#8996a8]")}>{timeLabel(message.created_at, locale)}</time>
                </div>
              </div>
            );
          })}
        </div>
        {nativeApp && whatsappEscape && (
          <div className="border-t border-[#e3ebf1] bg-[#fffbeb] px-4 py-2.5 text-xs font-semibold text-[#8a6d1f]">
            <p>{isEn ? "No reply in the app for over a day." : "Más de un día sin respuesta en la app."}</p>
            <a href={whatsappEscape} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#25D366] px-3 text-[13px] font-extrabold text-white">
              {isEn ? "Continue on WhatsApp" : "Continuar por WhatsApp"}
            </a>
          </div>
        )}
        {(error || attachmentError) && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error || attachmentError}</p>}
        <form onSubmit={submit} className="ccr-direct-chat-composer shrink-0 border-t border-[#e3ebf1] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
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
          <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={IMAGE_DOC_ACCEPT}
            multiple
            disabled={sending || preparingAttachments}
            className="hidden"
            onChange={(event) => { void addAttachments(event.currentTarget.files); }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || preparingAttachments || selectedAttachments.length >= MAX_ATTACHMENTS}
            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[18px] border border-[#d8e5ee] bg-[#f7fbfd] text-[#526277] transition hover:border-[#9fd8ec] hover:text-[#009FD9] disabled:opacity-45"
            aria-label={isEn ? "Attach file" : "Adjuntar archivo"}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <textarea
            ref={(el) => {
              textareaRef.current = el;
              resizeMessageTextarea(el);
            }}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value.slice(0, 2000));
              resizeMessageTextarea(e.currentTarget);
              keepComposerVisible();
            }}
            onFocus={keepComposerVisible}
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
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
          </div>
        </form>
      </section>
      {nativeApp && reportOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[1000] grid place-items-center bg-[#0f172a]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="chat-report-title">
          <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div><h2 id="chat-report-title" className="text-lg font-extrabold text-[#162543]">{isEn ? "Report and block" : "Reportar y bloquear"}</h2><p className="mt-1 text-sm leading-5 text-[#64748b]">{isEn ? "The conversation is blocked immediately and ContrataCR receives the report for review within 24 hours." : "La conversación se bloquea inmediatamente y ContrataCR recibe el reporte para revisarlo en un máximo de 24 horas."}</p></div>
              <button type="button" onClick={() => setReportOpen(false)} aria-label={isEn ? "Close" : "Cerrar"} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#64748b] hover:bg-[#f1f5f9]"><X className="h-5 w-5" /></button>
            </div>
            <label className="mt-5 block text-sm font-bold text-[#334155]" htmlFor="chat-report-reason">{isEn ? "What happened?" : "¿Qué ocurrió?"}</label>
            <textarea id="chat-report-reason" value={reportReason} onChange={(event) => setReportReason(event.target.value.slice(0, 1000))} rows={4} autoFocus className="mt-2 w-full resize-none rounded-2xl border border-[#d8e5ee] p-3 text-sm outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10" placeholder={isEn ? "Describe the abusive content or conduct" : "Describe el contenido o la conducta abusiva"} />
            <div className="mt-5 flex gap-3"><button type="button" onClick={() => setReportOpen(false)} className="flex-1 rounded-xl border border-[#d8e5ee] px-4 py-3 text-sm font-bold text-[#526277]">{isEn ? "Cancel" : "Cancelar"}</button><button type="button" disabled={reportBusy || reportReason.trim().length < 3} onClick={() => void reportAndBlockActive()} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{reportBusy ? (isEn ? "Sending..." : "Enviando...") : (isEn ? "Report and block" : "Reportar y bloquear")}</button></div>
          </div>
        </div>,
        document.body,
      )}
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
