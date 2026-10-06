"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Archive, ArchiveRestore, ArrowLeft, Ban, Check, ChevronRight, Copy, Download, FileText, Flag, Loader2, MessageSquareMore, MessageSquareText, MoreHorizontal, Paperclip, Pencil, Reply, Search, SendHorizontal, Trash2, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
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
import { PanelEmptyState, Skeleton } from "@/components/ui/content-loading";
import { IMAGE_DOC_ACCEPT } from "@/lib/upload-validation";
import { FilaDeslizable, iconoDeAccion, vibrarSuave } from "@/components/ui/fila-deslizable";
import { dentroDeLaVentanaDeEdicion } from "@/lib/direct-chat/edicion-de-mensajes";
import { getImageUploadPreparationErrorCode, prepareImageForUpload } from "@/lib/client-image-upload";
import { readCachedConversations, storeConversations } from "@/lib/direct-chat/conversations-cache";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { avisarMomentoDeNotificacion } from "@/lib/push-moment";

type Person = { id?: string; full_name?: string | null; avatar_url?: string | null };
type Conversation = {
  id: string; client_id: string; professional_profile_id: string; professional_id?: string | null;
  booking_id?: string | null; project_id?: string | null; proposal_id?: string | null;
  subject?: string | null; last_message?: string | null; last_message_at?: string | null;
  status?: "open" | "archived" | "blocked";
  blocked_by?: string | null;
  client_unread_count?: number; professional_unread_count?: number;
  client_profile?: Person | null;
  client_has_app?: boolean;
  professional_has_app?: boolean;
  professional_whatsapp?: string | null;
  professionals?: { id?: string; slug?: string | null; business_name?: string | null; profiles?: Person | null } | null;
  contexts?: Array<{
    type: "booking" | "project" | "proposal" | "profile";
    bookingId?: string | null;
    projectId?: string | null;
    proposalId?: string | null;
    title?: string | null;
    status?: string | null;
    at?: string | null;
  }>;
  context?: { type: "booking" | "project" | "proposal" | "profile"; title?: string | null; service_description?: string | null; status?: string | null; proposal_status?: string | null };
};
type DirectAttachment = { path?: string; name: string; type: string; size: number; url?: string | null };
type DirectMessage = { id: string; sender_id: string; body: string; created_at: string; attachment_urls?: DirectAttachment[]; edited_at?: string | null; deleted_at?: string | null; read_at?: string | null; delivered_at?: string | null; reply_to_id?: string | null };
type SelectedAttachment = { id: string; file: File; previewUrl?: string };
type PendingDraft = {
  professionalId?: string;
  bookingId?: string;
  projectId?: string;
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

// El marco de una foto del chat no depende de la foto: lo decide cuántas venían
// en el mensaje, que se sabe antes de descargar nada. Así el hueco gris nace ya
// del tamaño definitivo y la imagen entra dentro sin mover una sola línea del
// hilo. Una sola foto va apaisada; dos o más, en cuadrados. La imagen se
// recorta al marco, como en WhatsApp, y el original se ve al tocarla.
const MARCO_SOLA = 4 / 3;
const MARCO_MOSAICO = 1;

function ChatImage({ href, alt, marco }: { href: string; alt: string; marco: number }) {
  const [cargada, setCargada] = useState(false);

  return (
    <span className="relative block w-full overflow-hidden" style={{ aspectRatio: marco }}>
      <ProgressiveImage
        src={href}
        alt={alt}
        fit="cover"
        wrapperClassName="block h-full w-full"
        className="h-full w-full"
        onLoad={() => setCargada(true)}
        onError={() => setCargada(true)}
      />
      {!cargada && <span className="ccr-image-skeleton absolute inset-0" aria-hidden />}
    </span>
  );
}

// LA LÍNEA ENTRE CHATS, COMO WHATSAPP: empieza donde empieza el nombre (16 de
// margen + 44 de foto + 12 de separación = 72px) y termina donde termina la
// hora (16 del borde). No cruza la foto: la foto ya separa una fila de otra.
function SeparadorDeChat() {
  return <span aria-hidden className="ccr-separador-chat pointer-events-none absolute bottom-0 left-[72px] right-4 h-px bg-[#e9eef3]" />;
}

/** «No leído»: el MISMO icono de Mensajes de la barra de arriba, con su globo
 *  lleno en azul claro en la esquina, como cuando hay algo sin leer. «Leído» es
 *  ese mismo icono sin el globo. */
function IconoNoLeido({ className, anillo = "ring-[#009FD9]" }: { className?: string; anillo?: string }) {
  return (
    <span className={cn("relative inline-flex", className)} aria-hidden>
      <MessageSquareText className="h-5 w-5" />
      <span className={cn("absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[#7fdcff] ring-2", anillo)} />
    </span>
  );
}

/** La conversación que se abre SOLA: solo en computadora, donde se ve al lado de
 *  la lista. En el teléfono, ninguna hasta que la persona toca una. */
function conversacionAlLado(id: string | undefined): string | null {
  if (!id || typeof window === "undefined") return null;
  return window.matchMedia("(min-width: 1024px)").matches ? id : null;
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
  const contextTitle = searchParams.get("contextTitle") || (isEn ? "General inquiry" : "Consulta general");
  const draftMessage = searchParams.get("draftMessage") || "";
  // «proposal» sigue existiendo como tipo porque hay conversaciones guardadas
  // que nacieron de una propuesta; lo que ya no se puede es abrir una nueva asi.
  const contextType: "booking" | "project" | "proposal" | "profile" = bookingId ? "booking" : projectId ? "project" : "profile";
  const currentUserId = userId || "__current_user__";
  const pendingAsClient = Boolean(professionalId);
  const conversation: Conversation = {
    id: DRAFT_CONVERSATION_ID,
    client_id: pendingAsClient ? currentUserId : "__draft_client__",
    professional_id: professionalId,
    professional_profile_id: pendingAsClient ? "__draft_professional__" : currentUserId,
    booking_id: bookingId ?? null,
    project_id: projectId ?? null,
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
    },
  };
  return {
    conversation,
    payload: { professionalId, bookingId, projectId, contextTitle, draftMessage },
  };
}

function findExistingDraftConversation(rows: Conversation[], payload: PendingDraft | null) {
  if (!payload) return null;
  return rows.find((item) => {
    if (payload.bookingId) return item.booking_id === payload.bookingId;
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

export function DirectChatInbox({ alCambiarSubvista }: {
  /** Archivados y Bloqueados son vistas dentro de Mensajes: la página las pone
   *  en la barra de arriba («← Archivados») con esta flecha de vuelta. */
  alCambiarSubvista?: (subvista: { titulo: string; volver: () => void } | null) => void;
} = {}) {
  const locale = useLocale();
  const tChat = useTranslations("directChat");
  const isEn = locale === "en";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const nativeApp = useNativeApp();
  const userId = user?.id ?? null;
  const initialPendingDraft = useMemo(() => buildPendingDraft(searchParams, user?.id, isEn), [isEn, searchParams, user?.id]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Espejo de la lista para consultarla sin volver a disparar la carga del hilo
  // cada vez que la lista cambia.
  const conversationsRef = useRef<Conversation[]>([]);
  useEffect(() => { conversationsRef.current = conversations; }, [conversations]);
  const [pendingDraft, setPendingDraft] = useState<Conversation | null>(initialPendingDraft.conversation);
  const [pendingDraftPayload, setPendingDraftPayload] = useState<PendingDraft | null>(initialPendingDraft.payload);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get("conversation") || (initialPendingDraft.conversation ? DRAFT_CONVERSATION_ID : null));
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState(initialPendingDraft.payload?.draftMessage ?? "");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(searchParams.get("chatStatus") === "archived");
  const [archivedCount, setArchivedCount] = useState(0);
  // Los bloqueados son una bandeja aparte y no un filtro de la principal: son
  // conversaciones que ya no reciben nada, y mezclarlas con las vivas obligaría
  // a distinguirlas en cada fila.
  const [vistaBloqueados, setVistaBloqueados] = useState(false);
  const [bloqueadas, setBloqueadas] = useState<Conversation[]>([]);
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null);
  // La conversación tal como la devuelve el servidor al abrir el hilo. Hace
  // falta aparte de la lista porque una bloqueada NO está en la lista —se
  // esconde a propósito— y aun así se puede abrir desde la ficha o por enlace.
  const [hiloAbierto, setHiloAbierto] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const bandejasRef = useRef<{ open: Conversation[] | null; archived: Conversation[] | null }>({ open: null, archived: null });
  // La bandeja que se ve AHORA. Una respuesta que llega tarde de la otra solo
  // alimenta su memoria: sin esto, ir y volver rápido pintaba en Chats la
  // lista de Archivados.
  const bandejaVisibleRef = useRef(showArchived);
  // Chats que se acaban de mover de bandeja (archivar / desarchivar). Hasta que
  // el servidor lo confirme —y un par de segundos más, por las lecturas que ya
  // venían en camino—, ninguna recarga los devuelve a la bandeja de donde
  // salieron: eso era el parpadeo de «se va, vuelve y se va».
  const movimientosPendientes = useRef(new Map<string, "open" | "archived">());
  // Lo mismo para leído / no leído: tocarlo varias veces seguidas dejaba varias
  // peticiones en camino y una recarga en vivo traía un estado intermedio que
  // deshacía el último toque. Manda siempre la ÚLTIMA elección de cada chat.
  const lecturasPendientes = useRef(new Map<string, { leer: boolean; turno: number }>());
  const turnoDeLectura = useRef(0);
  // "Sin usuario" puede ser una sesión caída o una red que aún no responde;
  // solo lo primero justifica mandar al login.
  const [sesionSinConfirmar, setSesionSinConfirmar] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  // Fila con acciones descubiertas por deslizamiento; solo una a la vez.
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  const [confirmaEliminar, setConfirmaEliminar] = useState<string | null>(null);
  // La conversación cuya hoja de acciones está abierta (pulsación larga).
  const [hojaDeFila, setHojaDeFila] = useState<string | null>(null);
  // Arrastrar la hoja hacia abajo la cierra.
  const arrastreDeLaHoja = useRef<{ id: number; y: number } | null>(null);
  // El menú de un mensaje guarda DÓNDE está la burbuja, no dónde cayó el dedo:
  // así sale siempre en el mismo sitio respecto al mensaje, como en WhatsApp.
  const [menuMensaje, setMenuMensaje] = useState<{ id: string; caja: { top: number; left: number; right: number; bottom: number; width: number }; mio: boolean } | null>(null);
  const burbujaDelMenu = useRef<HTMLElement | null>(null);
  // El mensaje propio que se está corrigiendo: su texto pasa al compositor y
  // «enviar» guarda la edición en vez de mandar uno nuevo.
  // Si alguna de las dos partes apagó las confirmaciones de lectura, el «visto»
  // no se muestra; lo que llegue en vivo tampoco lo enciende.
  const vistosVisibles = useRef(true);
  const [editando, setEditando] = useState<{ id: string; original: string } | null>(null);
  // RESPONDER CITANDO (migración 228): el mensaje al que se responde, mientras
  // se escribe. Se manda con el envío y se borra al salir.
  const [respondiendoA, setRespondiendoA] = useState<string | null>(null);
  // El mensaje cuya hoja «¿Eliminar mensaje?» está abierta.
  const [mensajeAEliminar, setMensajeAEliminar] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const pulsacionLarga = useRef<number | null>(null);

  useEffect(() => {
    if (!menuMensaje) return;
    const cerrar = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuMensaje(null); };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [menuMensaje]);

  function abrirMenuMensaje(id: string, burbuja: HTMLElement, mio: boolean) {
    if (id.startsWith("pending-")) return;
    const r = burbuja.getBoundingClientRect();
    burbujaDelMenu.current = burbuja;
    vibrarSuave();
    setMenuMensaje({ id, caja: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width }, mio });
  }

  function empezarRespuesta(mensaje: DirectMessage) {
    setMenuMensaje(null);
    if (editando) cancelarEdicion();
    setRespondiendoA(mensaje.id);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  // Llevar al mensaje citado y marcarlo un instante, como WhatsApp.
  function irAlMensaje(id: string) {
    const nodo = document.getElementById(`msg-${id}`);
    if (!nodo) return;
    nodo.scrollIntoView({ block: "center", behavior: "smooth" });
    nodo.classList.add("ccr-mensaje-senalado");
    window.setTimeout(() => nodo.classList.remove("ccr-mensaje-senalado"), 1400);
  }

  function empezarEdicion(mensaje: DirectMessage) {
    setMenuMensaje(null);
    setRespondiendoA(null);
    setEditando({ id: mensaje.id, original: mensaje.body });
    setDraft(mensaje.body);
    window.requestAnimationFrame(() => {
      const campo = textareaRef.current;
      if (!campo) return;
      campo.focus();
      campo.setSelectionRange(campo.value.length, campo.value.length);
      resizeMessageTextarea(campo);
    });
  }

  function cancelarEdicion() {
    setEditando(null);
    setDraft("");
  }

  // Optimista, como el envío: la burbuja cambia al instante y, si el servidor
  // lo rechaza (pasaron los 15 minutos, moderación), vuelve a su texto.
  async function guardarEdicion() {
    if (!editando) return;
    const texto = draft.trim();
    const { id, original } = editando;
    setEditando(null);
    setDraft("");
    if (!texto || texto === original.trim()) return;
    setMessages((actuales) => actuales.map((m) => m.id === id ? { ...m, body: texto, edited_at: new Date().toISOString() } : m));
    const res = await fetchWithSessionRetry("/api/direct-chat/mensaje", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: id, body: texto }) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessages((actuales) => actuales.map((m) => m.id === id ? { ...m, body: original } : m));
      setError(json.error || tChat("editFailed"));
    }
  }

  async function eliminarMensaje(id: string, alcance: "everyone" | "me") {
    setMensajeAEliminar(null);
    const antes = messages;
    setMessages((actuales) => alcance === "me"
      ? actuales.filter((m) => m.id !== id)
      : actuales.map((m) => m.id === id ? { ...m, body: "", attachment_urls: [], deleted_at: new Date().toISOString() } : m));
    if (editando?.id === id) cancelarEdicion();
    const res = await fetchWithSessionRetry("/api/direct-chat/mensaje", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: id, scope: alcance }) });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMessages(antes);
      setError(json.error || tChat("deleteMessageFailed"));
    }
  }

  async function copiarMensaje(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Sin permiso de portapapeles: se copia con el camino viejo.
      const area = document.createElement("textarea");
      area.value = texto;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } catch { /* nada más que hacer */ }
      area.remove();
    }
    setMenuMensaje(null);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1600);
  }
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

  // La flecha de la barra llama siempre a la versión actual de «volver».
  const volverDeSubvista = useRef<() => void>(() => {});
  volverDeSubvista.current = () => { if (vistaBloqueados) setVistaBloqueados(false); else updateArchiveView(false); };
  const subvistaEnLaBarra = nativeApp && (showArchived || vistaBloqueados) && !mobileThread
    ? (vistaBloqueados ? tChat("blocked") : tChat("archived"))
    : null;
  useEffect(() => {
    if (!alCambiarSubvista) return;
    alCambiarSubvista(subvistaEnLaBarra ? { titulo: subvistaEnLaBarra, volver: () => volverDeSubvista.current() } : null);
  }, [alCambiarSubvista, subvistaEnLaBarra]);
  useEffect(() => () => alCambiarSubvista?.(null), [alCambiarSubvista]);

  const displayedConversations = useMemo(
    () => pendingDraft && !showArchived
      ? [pendingDraft, ...conversations.filter((item) => item.id !== DRAFT_CONVERSATION_ID)]
      : conversations,
    [conversations, pendingDraft, showArchived],
  );
  const active = useMemo(() => displayedConversations.find((item) => item.id === activeId) ?? null, [activeId, displayedConversations]);
  // Lo que se sabe del hilo abierto: la lista si lo tiene, o lo que trajo el
  // servidor si no (una bloqueada nunca está en la lista).
  const conversacionAbierta = active ?? (hiloAbierto && hiloAbierto.id === activeId ? hiloAbierto : null);
  const conversacionBloqueada = conversacionAbierta?.status === "blocked";
  const bloqueadaPorMi = conversacionBloqueada && !!user?.id && conversacionAbierta?.blocked_by === user.id;

  // La línea de la última conversación cierra la lista cuando esta termina
  // antes del final de la pantalla. Si la lista se desplaza, esa línea queda
  // colgando contra la barra de abajo, así que ahí no va.
  const listaRef = useRef<HTMLDivElement | null>(null);
  const [listaCabe, setListaCabe] = useState(true);

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
    const labels = isEn ? { booking: "Appointment", project: "Project", proposal: "Reply", profile: "Profile" } : { booking: "Cita", project: "Proyecto", proposal: "Respuesta", profile: "Perfil" };
    return { type, label: labels[type], title: item.context?.service_description || item.context?.title || item.subject || (isEn ? "General inquiry" : "Consulta general") };
  }, [isEn]);
  const contextSummaryFor = useCallback((item: Conversation) => {
    const context = contextFor(item);
    if (context.type === "profile") return context.title;
    return `${context.label} · ${context.title}`;
  }, [contextFor]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase(locale);
    if (!needle) return displayedConversations;
    return displayedConversations.filter((item) => `${personFor(item).name} ${contextSummaryFor(item)} ${item.last_message ?? ""}`.toLocaleLowerCase(locale).includes(needle));
  }, [contextSummaryFor, displayedConversations, locale, personFor, query]);

  // ¿La lista termina antes del final de la pantalla? Se vuelve a medir cuando
  // cambia el alto —al filtrar, al llegar una conversación, al aparecer o
  // esconderse la barra de abajo—, no solo al montar.
  useEffect(() => {
    const nodo = listaRef.current;
    if (!nodo) return;
    const medir = () => setListaCabe(nodo.scrollHeight <= nodo.clientHeight + 1);
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(nodo);
    if (nodo.firstElementChild) observador.observe(nodo.firstElementChild);
    window.addEventListener("resize", medir);
    return () => { observador.disconnect(); window.removeEventListener("resize", medir); };
  }, [filtered.length, showArchived]);

  // La vista previa de una conversación es una línea y una fecha: cuando el
  // mensaje acaba de salir de aquí, se sabe sin preguntarle al servidor. La fila
  // sube al tope, igual que haría la recarga.
  const ponerAlDiaVistaPrevia = useCallback((conversationId: string | null, mensaje: DirectMessage) => {
    if (!conversationId) return;
    setConversations((previas) => {
      const indice = previas.findIndex((item) => item.id === conversationId);
      if (indice < 0) return previas;
      const actualizada = {
        ...previas[indice],
        last_message: mensaje.body ?? previas[indice].last_message,
        last_message_at: mensaje.created_at ?? new Date().toISOString(),
      };
      const resto = previas.filter((_, i) => i !== indice);
      return [actualizada, ...resto];
    });
  }, []);

  const loadConversations = useCallback(async (quiet = false) => {
    // Paint the warmed list at once; the network refresh below replaces it.
    // Cada bandeja guarda su última lista en memoria: pasar de Chats a
    // Archivados pinta lo que ya se tenía y refresca detrás, sin esqueleto.
    const enMemoria = bandejasRef.current[showArchived ? "archived" : "open"];
    const warm = quiet ? null : enMemoria ?? (!showArchived ? (readCachedConversations() as Conversation[] | null) : null);
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
      const bandejaPedida = showArchived ? "archived" : "open";
      const rows = ((json.conversations ?? []) as Conversation[]).filter((fila) => {
        const destino = movimientosPendientes.current.get(fila.id);
        return !destino || destino === bandejaPedida;
      }).map((fila) => {
        const eleccion = lecturasPendientes.current.get(fila.id);
        if (!eleccion) return fila;
        const valor = eleccion.leer ? 0 : 1;
        return user?.id === fila.client_id ? { ...fila, client_unread_count: valor } : { ...fila, professional_unread_count: valor };
      });
      if (!showArchived) storeConversations(rows);
      bandejasRef.current[showArchived ? "archived" : "open"] = rows;
      if (bandejaVisibleRef.current !== showArchived) return;
      const existingDraftConversation = findExistingDraftConversation(rows, pendingDraftPayload);
      setConversations(rows);
      if (existingDraftConversation) {
        setPendingDraft(null);
        setPendingDraftPayload(null);
        setDraft("");
        setActiveId(existingDraftConversation.id);
        sincronizarUrl(`conversation=${existingDraftConversation.id}`);
      } else {
        // En computadora la conversación se ve al lado de la lista y se abre la
        // primera. En el teléfono NO: ahí solo se ve la lista, y abrirla por
        // detrás la marcaba como leída (y «vista» para el otro) sin que nadie
        // la hubiera abierto.
        setActiveId((current) => current || (pendingDraft ? DRAFT_CONVERSATION_ID : conversacionAlLado(rows[0]?.id)));
      }
      if (showArchived) {
        setArchivedCount(json.conversations?.length ?? 0);
      } else if (!quiet) {
        // El conteo de archivadas es una segunda petición completa (seis
        // consultas en el servidor). En una recarga silenciosa —la que dispara
        // cada mensaje que llega— no cambia nada que se vea, así que solo se
        // pide cuando la persona abre o recarga Mensajes de verdad.
        fetch("/api/direct-chat?status=archived", { cache: "no-store" })
          .then((archivedRes) => archivedRes.ok ? archivedRes.json() : { conversations: [] })
          .then((archivedJson) => {
            const archivadas = Array.isArray(archivedJson.conversations) ? archivedJson.conversations as Conversation[] : [];
            // Ya vino la lista entera: queda lista para cuando se abra la bandeja.
            bandejasRef.current.archived = archivadas;
            setArchivedCount(archivadas.length);
          })
          .catch(() => setArchivedCount(0));
        // Los bloqueados se piden en el mismo momento y por la misma razón: la
        // entrada solo existe si hay algo adentro, así que hace falta saberlo
        // antes de pintar la lista. Quien nunca bloqueó no ve una puerta vacía.
        fetch("/api/direct-chat?status=blocked", { cache: "no-store" })
          .then((res) => res.ok ? res.json() : { conversations: [] })
          .then((json) => setBloqueadas(Array.isArray(json.conversations) ? json.conversations as Conversation[] : []))
          .catch(() => setBloqueadas([]));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load messages." : "No se pudieron cargar los mensajes.");
    } finally { if (!quiet) setLoading(false); }
  }, [isEn, pendingDraft, pendingDraftPayload, showArchived, user?.id]);

  // Al recargar el hilo, cada mensaje volvía como un objeto nuevo aunque fuera
  // el mismo: React rehacía todas las burbujas y las imágenes se volvían a
  // pedir, y eso se veía como un parpadeo al enviar. Los mensajes que no
  // cambiaron conservan su objeto, así el navegador no vuelve a pintarlos.
  const conservarMensajes = useCallback((previos: DirectMessage[], nuevos: DirectMessage[]) => {
    const porId = new Map(previos.map((mensaje) => [mensaje.id, mensaje]));
    let iguales = previos.length === nuevos.length;
    const fusionados = nuevos.map((nuevo, indice) => {
      const anterior = porId.get(nuevo.id);
      if (!anterior) { iguales = false; return nuevo; }
      const mismo =
        anterior.body === nuevo.body &&
        anterior.created_at === nuevo.created_at &&
        (anterior.attachment_urls?.length ?? 0) === (nuevo.attachment_urls?.length ?? 0);
      if (!mismo) { iguales = false; return nuevo; }
      if (previos[indice]?.id !== nuevo.id) iguales = false;
      return anterior;
    });
    return iguales ? previos : fusionados;
  }, []);

  const loadThread = useCallback(async (id: string, quiet = false, vacia = false) => {
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
    else if (!quiet && !vacia) setThreadLoading(true);
    try {
      const res = await fetchWithSessionRetry(`/api/direct-chat?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      if (json.conversation) setHiloAbierto(json.conversation as Conversation);
      // ¿Se muestran los «visto» en este chat? (confirmaciones de lectura).
      vistosVisibles.current = json.vistos !== false;
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
      setMessages((previos) => conservarMensajes(previos, merged));
      setConversations((prev) => prev.map((item) => item.id === id ? { ...item, client_unread_count: 0, professional_unread_count: 0 } : item));
    } catch (err) {
      setError(err instanceof Error ? err.message : isEn ? "Could not load the conversation." : "No se pudo cargar la conversación.");
    } finally { if (!quiet) setThreadLoading(false); }
  }, [conservarMensajes, isEn, userId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      // Antes de expulsar, preguntarle a Supabase: solo la ausencia CONFIRMADA
      // de sesión manda al login. Si hay sesión o no se puede comprobar, se
      // queda en Mensajes con la opción de reintentar.
      let cancelado = false;
      void (async () => {
        let confirmadoSinSesion = false;
        try {
          const { data, error } = await createClient().auth.getSession();
          confirmadoSinSesion = !error && !data.session;
        } catch {
          confirmadoSinSesion = false;
        }
        if (cancelado) return;
        if (!confirmadoSinSesion) {
          setSesionSinConfirmar(true);
          setLoading(false);
          return;
        }
        // A guest deep-link lands on login and returns to this exact chat after
        // signing in or registering (the login page honors /mensajes redirects).
        router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      })();
      return () => { cancelado = true; };
    }
    queueMicrotask(() => {
      setSesionSinConfirmar(false);
      void loadConversations();
    });
  }, [authLoading, user, router, loadConversations]);
  useEffect(() => {
    if (authLoading || !user || !activeId) return;
    // Una conversación sin ningún mensaje escrito no muestra esqueleto: la
    // lista ya lo sabe por su última fecha, y prometer burbujas para terminar
    // en un hilo vacío es exactamente lo que se veía como un fallo.
    const sinMensajes = !conversationsRef.current.find((item) => item.id === activeId)?.last_message_at;
    queueMicrotask(() => void loadThread(activeId, false, sinMensajes));
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
    // Los avisos en vivo llegan de a ráfagas: al enviar un mensaje caen un
    // INSERT y un UPDATE casi juntos, y cada uno recargaba la lista entera
    // (seis consultas del servidor cada vez). Se junta lo que llegue en tres
    // cuartos de segundo y se pide UNA sola vez.
    let pendiente: number | null = null;
    const recargarPronto = () => {
      if (pendiente) window.clearTimeout(pendiente);
      pendiente = window.setTimeout(() => { pendiente = null; void loadConversations(true); }, 750);
    };
    // El canal de conversaciones va FILTRADO por las dos caras de una
    // conversación: sin filtro, el servidor evaluaba cada cambio de la
    // plataforma entera contra cada persona conectada. Los mensajes sueltos no
    // se pueden filtrar (la fila no dice de quién es la conversación), pero el
    // hilo abierto se reconoce aquí mismo.
    const channel = supabase.channel(`direct-chat-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_conversations", filter: `client_id=eq.${user.id}` }, recargarPronto)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_conversations", filter: `professional_profile_id=eq.${user.id}` }, recargarPronto)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as DirectMessage & { conversation_id?: string };
        // Lo que uno mismo acaba de mandar ya está en pantalla y ya actualizó
        // su vista previa: no hay nada que volver a pedir.
        if (row.sender_id === user.id) return;
        if (row.conversation_id === activeId) void loadThread(activeId, true);
        recargarPronto();
      })
      // La otra persona editó o eliminó un mensaje del hilo abierto.
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "direct_messages" }, (payload) => {
        const row = payload.new as DirectMessage & { conversation_id?: string };
        if (row.conversation_id !== activeId) return;
        // Mis mensajes: lo único que cambia desde el otro lado es el visto.
        if (row.sender_id === user.id) {
          const leido = vistosVisibles.current ? row.read_at : null;
          if (leido || row.delivered_at) setMessages((actuales) => actuales.map((m) => m.id === row.id ? { ...m, read_at: leido ?? m.read_at, delivered_at: row.delivered_at ?? m.delivered_at } : m));
          return;
        }
        if (!row.edited_at && !row.deleted_at) return;
        void loadThread(activeId, true);
      }).subscribe();
    return () => {
      if (pendiente) window.clearTimeout(pendiente);
      void supabase.removeChannel(channel);
    };
  }, [activeId, loadConversations, loadThread, user]);

  // Desbloquear devuelve la conversación a la bandeja y deja que las dos partes
  // se escriban otra vez. El REPORTE no se retira: que dos personas vuelvan a
  // hablar no borra lo que pasó, y moderación decide por su lado.
  async function desbloquear(conversationId: string) {
    setDesbloqueando(conversationId);
    try {
      const res = await fetchWithSessionRetry("/api/direct-chat", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, action: "unblock" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || tChat("unblockFailed"));
        return;
      }
      const quedan = bloqueadas.filter((item) => item.id !== conversationId);
      setBloqueadas(quedan);
      // Sin nada que mostrar, la bandeja se cierra sola: quedarse en una lista
      // vacía obliga a buscar cómo salir.
      if (!quedan.length) setVistaBloqueados(false);
      await Promise.all([loadConversations(true), activeId === conversationId ? loadThread(conversationId, true) : Promise.resolve()]);
    } finally {
      setDesbloqueando(null);
    }
  }

  function updateArchiveView(nextArchived: boolean, nextConversationId?: string | null) {
    // Cambiar de bandeja enciende «cargando» EN EL MISMO cambio de estado. Sin
    // esto React pintaba un cuadro intermedio —la bandeja nueva con la lista
    // vieja, que no tiene nada de esa bandeja— y durante medio segundo se leía
    // «No hay conversaciones archivadas» antes de que llegara la respuesta.
    bandejaVisibleRef.current = nextArchived;
    if (nextArchived !== showArchived) {
      const guardada = bandejasRef.current[nextArchived ? "archived" : "open"];
      if (guardada) setConversations(guardada);
      else setLoading(true);
    }
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
    sincronizarUrl(qs);
  }

  // Abrir un chat no es cambiar de pantalla: la conversación ya está en memoria
  // y solo falta reflejarla en la dirección. Pasar por el router dispara el
  // respaldo de ruta —la marca a pantalla completa— encima de una pantalla que
  // no se fue a ningún lado. Next admite mover la URL a mano y se entera igual.
  function sincronizarUrl(consulta: string) {
    if (typeof window === "undefined") return;
    const destino = window.location.pathname + (consulta ? "?" + consulta : "");
    window.history.replaceState(window.history.state, "", destino);
  }

  function selectConversation(id: string) {
    backHrefRef.current = "";
    if (editando) cancelarEdicion();
    setActiveId(id); setMobileThread(true); setError("");
    if (id === DRAFT_CONVERSATION_ID) return;
    sincronizarUrl(`${showArchived ? "chatStatus=archived&" : ""}conversation=${id}`);
  }

  function openActiveProfile() {
    if (!activePerson?.profileHref) return;
    const path = window.location.pathname.replace(/^\/(?:es|en)(?=\/|$)/u, "") || "/";
    const from = encodeURIComponent(path + window.location.search);
    router.push(`${activePerson.profileHref}?from=${from}`);
  }

  function closeThread() {
    // Salir del hilo a media edición la descarta: el texto no es un borrador.
    if (editando) cancelarEdicion();
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
    if (editando) { void guardarEdicion(); return; }
    if (!activeId || sending || (!draft.trim() && !selectedAttachments.length)) return;
    const body = draft.trim(); const optimisticId = `pending-${Date.now()}`;
    const citado = respondiendoA;
    const optimisticAttachments = selectedAttachments.map((attachment) => ({
      name: attachment.file.name,
      type: attachment.file.type,
      size: attachment.file.size,
      url: attachment.previewUrl ?? null,
    }));
    setDraft(""); setRespondiendoA(null); setSending(true); setError(""); setAttachmentError("");
    setMessages((current) => [...current, { id: optimisticId, sender_id: user?.id || "", body: body || (isEn ? "Attachment" : "Archivo adjunto"), attachment_urls: optimisticAttachments, created_at: new Date().toISOString(), reply_to_id: citado }]);
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
          contextTitle: pendingDraftPayload?.contextTitle,
          message: body,
        }
        : { conversationId: targetConversationId, message: body, attachmentUrls, ...(citado ? { replyToId: citado } : {}) };
      const res = await fetchWithSessionRetry("/api/direct-chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Error");
      avisarMomentoDeNotificacion("mensaje");
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
        sincronizarUrl(`conversation=${json.conversationId}`);
        await Promise.all([loadThread(json.conversationId, true), loadConversations(true)]);
      } else if (json.message) {
        setMessages((current) => current.map((mensaje) => (mensaje.id === optimisticId ? (json.message as DirectMessage) : mensaje)));
        // La lista de conversaciones se pone al día AQUÍ, con lo que ya se
        // sabe: el mensaje que se acaba de mandar. Volver a pedirla entera
        // costaba seis consultas en el servidor por cada mensaje enviado, para
        // cambiar una línea de vista previa y una fecha.
        ponerAlDiaVistaPrevia(activeId, json.message as DirectMessage);
      } else {
        await Promise.all([loadThread(activeId, true), loadConversations(true)]);
      }
    } catch (err) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId)); setDraft(body); setRespondiendoA(citado);
      setError(err instanceof Error ? err.message : isEn ? "Could not send the message." : "No se pudo enviar el mensaje.");
    } finally { setSending(false); }
  }

  // Archivar o desarchivar una fila desde el gesto, sin abrir el chat.
  // Optimista: la fila sale al instante y pasa a la otra bandeja en memoria,
  // así al abrirla ya está ahí; si el servidor falla, se recarga la lista.
  async function archivarFila(id: string, archivar: boolean) {
    setFilaAbierta(null);
    const fila = conversations.find((item) => item.id === id);
    const remaining = conversations.filter((item) => item.id !== id);
    setConversations(remaining);
    const origen = archivar ? "open" : "archived";
    const destino = archivar ? "archived" : "open";
    bandejasRef.current[origen] = remaining;
    const enDestino = bandejasRef.current[destino];
    if (fila && enDestino) bandejasRef.current[destino] = [fila, ...enDestino.filter((item) => item.id !== id)];
    setArchivedCount((count) => archivar ? count + 1 : Math.max(0, count - 1));
    if (activeId === id) setActiveId(conversacionAlLado(remaining[0]?.id));
    movimientosPendientes.current.set(id, destino);
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id, status: archivar ? "archived" : "open" }) });
    if (!res.ok) {
      movimientosPendientes.current.delete(id);
      const json = await res.json().catch(() => ({}));
      setError(json.error || (isEn ? "Could not update the conversation." : "No se pudo actualizar la conversación."));
      bandejasRef.current[destino] = null;
      void loadConversations(true);
      return;
    }
    window.setTimeout(() => { if (movimientosPendientes.current.get(id) === destino) movimientosPendientes.current.delete(id); }, 3000);
  }

  // Marcar leída o no leída desde el gesto, sin abrir el chat. Optimista: la
  // fila cambia al instante y la petición confirma detrás.
  async function marcarLeida(id: string, leer: boolean) {
    setFilaAbierta(null);
    // El icono de Mensajes de arriba cambia YA, sin esperar al servidor.
    const conversacion = conversations.find((c) => c.id === id);
    const antes = conversacion ? Number((user?.id === conversacion.client_id ? conversacion.client_unread_count : conversacion.professional_unread_count) ?? 0) : 0;
    const delta = (leer ? 0 : 1) - antes;
    if (delta) window.dispatchEvent(new CustomEvent("ccr:mensajes-sin-leer", { detail: delta }));
    setConversations((actuales) => actuales.map((c) => c.id !== id ? c : (
      user?.id === c.client_id
        ? { ...c, client_unread_count: leer ? 0 : 1 }
        : { ...c, professional_unread_count: leer ? 0 : 1 }
    )));
    const turno = ++turnoDeLectura.current;
    lecturasPendientes.current.set(id, { leer, turno });
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id, read: leer }) });
    // Una respuesta vieja no decide nada si después hubo otro toque.
    if (lecturasPendientes.current.get(id)?.turno !== turno) return;
    if (!res.ok) { lecturasPendientes.current.delete(id); void loadConversations(true); }
    window.dispatchEvent(new Event("directMessagesChanged"));
    window.setTimeout(() => { if (lecturasPendientes.current.get(id)?.turno === turno) lecturasPendientes.current.delete(id); }, 3000);
  }

  // Eliminar vive solo en la hoja de «Más» y pide un segundo toque de confirmación.
  async function eliminarFila(id: string) {
    if (confirmaEliminar !== id) { setConfirmaEliminar(id); return; }
    setConfirmaEliminar(null);
    setFilaAbierta(null);
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: id }) });
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || (isEn ? "Could not delete the conversation." : "No se pudo eliminar la conversación.")); return; }
    const remaining = conversations.filter((item) => item.id !== id);
    setConversations(remaining);
    bandejasRef.current[showArchived ? "archived" : "open"] = remaining;
    if (showArchived) setArchivedCount((count) => Math.max(0, count - 1));
    if (activeId === id) setActiveId(conversacionAlLado(remaining[0]?.id));
  }

  async function toggleArchiveActive() {
    if (!activeId) return;
    const res = await fetchWithSessionRetry("/api/direct-chat", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: activeId, status: showArchived ? "open" : "archived" }) });
    if (!res.ok) { const json = await res.json().catch(() => ({})); setError(json.error || (isEn ? "Could not update the conversation." : "No se pudo actualizar la conversación.")); return; }
    const remaining = conversations.filter((item) => item.id !== activeId);
    const nextId = conversacionAlLado(remaining[0]?.id);
    setConversations(remaining);
    bandejasRef.current = { open: null, archived: null };
    setArchivedCount((count) => showArchived ? Math.max(0, count - 1) : count + 1);
    updateArchiveView(showArchived, nextId);
  }

  if (sesionSinConfirmar && !user) return (
    <PanelEmptyState
      plano
      icon={MessageSquareMore}
      title={isEn ? "We could not load your messages" : "No pudimos cargar tus mensajes"}
      description={isEn
        ? "Check your connection and try again. Your conversations are safe."
        : "Revisa tu conexión y vuelve a intentarlo. Tus conversaciones están a salvo."}
      action={(
        <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-[#008fc4] hover:underline">
          {isEn ? "Try again" : "Reintentar"}
        </button>
      )}
    />
  );

  // Hoja de acciones de una conversación: sale al dejar la fila pulsada (o con
  // el botón derecho en computadora). Es la otra mitad del gesto: deslizar da
  // lo frecuente —archivar— y la hoja da todo, incluido reportar, que antes
  // vivía en la cabecera del hilo.
  const mensajeDelMenu = menuMensaje ? messages.find((m) => m.id === menuMensaje.id) ?? null : null;
  const esPropioYReciente = (m: DirectMessage | null) => Boolean(m && m.sender_id === user?.id && !m.deleted_at && dentroDeLaVentanaDeEdicion(m.created_at));
  const puedeEditarDelMenu = esPropioYReciente(mensajeDelMenu) && Boolean(mensajeDelMenu?.body.trim()) && !(mensajeDelMenu?.attachment_urls?.length && (mensajeDelMenu.body === "Archivo adjunto" || mensajeDelMenu.body === "Attachment"));
  const mensajeEliminable = mensajeAEliminar ? messages.find((m) => m.id === mensajeAEliminar) ?? null : null;
  const puedeEliminarParaTodos = esPropioYReciente(mensajeEliminable);
  const filaDeLaHoja = conversations.find((c) => c.id === hojaDeFila) ?? null;
  const personaDeLaHoja = filaDeLaHoja ? personFor(filaDeLaHoja) : null;
  const hojaSinLeer = filaDeLaHoja ? Boolean(user?.id === filaDeLaHoja.client_id ? filaDeLaHoja.client_unread_count : filaDeLaHoja.professional_unread_count) : false;

  // `app-sheet-compact-screen` es lo que evita que el armazón nativo la estire
  // a pantalla completa: esta hoja mide lo que miden sus opciones y se apoya en
  // el borde de abajo, como la de WhatsApp.
  const hojaDeAcciones = filaDeLaHoja && (
    <div className="app-modal-screen app-sheet-compact-screen fixed inset-0 z-[200] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#071426]/45 backdrop-blur-[2px]" onClick={() => { setHojaDeFila(null); setConfirmaEliminar(null); }} />
      <div className="app-bottom-sheet app-sheet-compact relative z-10 w-full max-w-md rounded-t-[22px] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-18px_48px_-24px_rgba(15,23,42,0.55)]">
        {/* Se cierra con la X o arrastrando la hoja hacia abajo, como en
            WhatsApp; el renglón «Cancelar» era una opción más que competía con
            las que sí hacen algo. */}
        <div
          className="cursor-grab touch-none pb-1 pt-1"
          onPointerDown={(event) => { arrastreDeLaHoja.current = { id: event.pointerId, y: event.clientY }; }}
          onPointerMove={(event) => {
            const d = arrastreDeLaHoja.current;
            if (!d || event.pointerId !== d.id) return;
            const paso = event.clientY - d.y;
            if (paso > 70) { arrastreDeLaHoja.current = null; setHojaDeFila(null); }
          }}
          onPointerUp={() => { arrastreDeLaHoja.current = null; }}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-[#dbe5ee]" />
        </div>
        <div className="flex items-center gap-2 px-5 pb-2">
          <p className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-[#162543]">{personaDeLaHoja?.name ?? ""}</p>
          <button type="button" onClick={() => { setHojaDeFila(null); setConfirmaEliminar(null); }} aria-label={tChat("cancel")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef2f6] text-[#526277] transition hover:bg-[#e2e9f0]">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Lo mismo que el deslizado hacia la derecha, para quien no lo conoce. */}
        <button type="button" onClick={() => { const id = filaDeLaHoja.id; setHojaDeFila(null); void marcarLeida(id, hojaSinLeer); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold text-[#162543] transition hover:bg-[#f2f8fb]">
          {hojaSinLeer ? <MessageSquareText className="h-5 w-5 text-[#009FD9]" /> : <IconoNoLeido className="text-[#009FD9]" anillo="ring-white" />}
          {hojaSinLeer ? (isEn ? "Mark as read" : "Marcar como leído") : (isEn ? "Mark as unread" : "Marcar como no leído")}
        </button>
        <button type="button" onClick={() => { const id = filaDeLaHoja.id; setHojaDeFila(null); void archivarFila(id, !showArchived); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold text-[#162543] transition hover:bg-[#f2f8fb]">
          {showArchived ? <ArchiveRestore className="h-5 w-5 text-[#009FD9]" /> : <Archive className="h-5 w-5 text-[#009FD9]" />}
          {showArchived ? tChat("unarchive") : tChat("archive")}
        </button>
        {!showArchived && (
          <button type="button" onClick={() => { setActiveId(filaDeLaHoja.id); setHojaDeFila(null); setReportOpen(true); }} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold text-red-600 transition hover:bg-red-50">
            <Flag className="h-5 w-5" />
            {tChat("reportAndBlock")}
          </button>
        )}
        {/* Eliminar va SIEMPRE, no solo en archivadas, y aparte de lo demás:
            es lo único de la hoja que no se deshace. El borrado es por persona
            —la otra parte conserva su hilo—, y el segundo toque confirma. */}
        <button
          type="button"
          onClick={() => {
            const id = filaDeLaHoja.id;
            if (confirmaEliminar !== id) { setConfirmaEliminar(id); return; }
            setHojaDeFila(null);
            void eliminarFila(id);
          }}
          className="mt-1 flex w-full items-center gap-3 border-t border-[#eef2f6] px-5 py-3.5 text-left text-[15px] font-bold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="h-5 w-5" />
          {confirmaEliminar === filaDeLaHoja.id ? tChat("confirmDelete") : tChat("delete")}
        </button>
      </div>
    </div>
  );

  if (loading) return (
    <div className="ccr-delayed-loading min-h-[calc(100dvh-153px)] bg-white sm:min-h-[520px]" aria-busy="true" role="status">
      <span className="sr-only">{tChat("loadingConversations")}</span>
      <div className="border-b border-[#e5e7eb] p-3"><Skeleton className="h-10 w-full rounded-full" /></div>
      {Array.from({ length: 6 }).map((_, fila) => (
        <div key={fila} className="flex gap-3 border-b border-[#eef2f6] p-4 last:border-b-0">
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              <Skeleton className={`h-3.5 rounded-full ${["w-32", "w-24", "w-36", "w-28", "w-32", "w-24"][fila]}`} />
              <Skeleton className="ml-auto h-2.5 w-9 rounded-full" />
            </div>
            <Skeleton className={`h-3 rounded-full ${["w-52", "w-40", "w-44", "w-56", "w-36", "w-48"][fila]}`} />
          </div>
        </div>
      ))}
    </div>
  );

  // Archivados vacío NO reemplaza la pantalla: se queda con su encabezado
  // «← Archivados» y el vacío va dentro de la lista (más abajo).
  if (!displayedConversations.length && !showArchived) return (
    <PanelEmptyState
      plano
      icon={MessageSquareMore}
      title={isEn ? "No conversations yet" : "No hay conversaciones todavía"}
      description={isEn ? "Messages about profiles, projects, promotions and jobs are organized here." : "Aquí se organizan los mensajes sobre perfiles, proyectos, promociones y empleos."}
      action={(
        <button type="button" onClick={() => updateArchiveView(true)} className="inline-flex items-center justify-center gap-1.5 text-sm font-bold text-[#008fc4] hover:underline">
          {tChat("viewArchived")}
        </button>
      )}
    />
  );
  // Con `conversacionAbierta` y no con `active`: una bloqueada no está en la
  // lista y aun así el hilo tiene que saber con quién es.
  const activePerson = conversacionAbierta ? personFor(conversacionAbierta) : null;
  const conversacionesSinLeer = displayedConversations.filter((item) => {
    if (item.id === activeId) return false;
    return (user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count) ?? 0;
  }).length;

  const archiveLabel = showArchived ? (isEn ? "Unarchive" : "Desarchivar") : (isEn ? "Archive" : "Archivar");
  const activePersonName = activePerson?.name || "";
  // Cómo se nombra un mensaje citado: quién lo escribió y una línea de lo que
  // decía (o «Foto», «Archivo», «Mensaje eliminado»).
  const autorDeMensaje = (m: DirectMessage | null | undefined) => !m ? "" : m.sender_id === user?.id ? tChat("you") : activePersonName;
  const resumenDeMensaje = (m: DirectMessage | null | undefined) => {
    if (!m) return tChat("originalMessage");
    if (m.deleted_at) return tChat("messageDeleted");
    const soloAdjunto = Boolean(m.attachment_urls?.length) && (m.body === "Archivo adjunto" || m.body === "Attachment");
    if (m.body.trim() && !soloAdjunto) return m.body;
    return m.attachment_urls?.some(isImageAttachment) ? tChat("photo") : tChat("file");
  };
  const otherHasApp = active
    ? (activePerson?.role === "professional" ? conversacionAbierta?.professional_has_app : conversacionAbierta?.client_has_app)
    : undefined;
  // Last resort after a full day without an answer from a professional who is
  // not in the app: let the client continue on WhatsApp instead of losing them.
  const whatsappEscape = (() => {
    if (!conversacionAbierta || !user?.id || activePerson?.role !== "professional" || otherHasApp || !conversacionAbierta.professional_whatsapp) return null;
    const last = messages[messages.length - 1];
    if (!last || last.sender_id !== user.id) return null;
    if (Date.now() - new Date(last.created_at).getTime() < 24 * 60 * 60 * 1000) return null;
    const digits = conversacionAbierta.professional_whatsapp.replace(/\D/g, "");
    const number = digits.length === 8 ? `506${digits}` : digits;
    const text = isEn
      ? "Hi, I wrote to you on ContrataCR and wanted to follow up."
      : "Hola, te escribí por ContrataCR y quería dar seguimiento.";
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  })();
  return (
    <div className={cn(
      "direct-chat-shell grid h-[calc(100dvh-153px)] min-h-[360px] grid-cols-[minmax(0,1fr)] overflow-hidden bg-white lg:h-[min(760px,calc(100dvh-220px))] lg:min-h-[500px] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]",
      mobileThread && "direct-chat-shell--thread",
    )}>
      <aside className={cn("flex min-h-0 flex-col bg-white lg:border-r lg:border-[#e5e7eb]", mobileThread && "hidden lg:block")}>
        <div className={cn("shrink-0 border-b border-[#e5e7eb] p-4", nativeApp && "border-b-0 px-4 pb-2 pt-2", subvistaEnLaBarra && "hidden")}>
          {/* Archivados y Bloqueados son una pantalla DENTRO de Mensajes: su
              encabezado cambia a «← Archivados», con la flecha a la izquierda
              como en WhatsApp. El «Volver» chico a la derecha, lejos del
              título, no se leía como la salida. */}
          <div className={cn("flex items-center gap-1", subvistaEnLaBarra && "hidden")}>
            {(showArchived || vistaBloqueados) && (
              <button
                type="button"
                onClick={() => { if (vistaBloqueados) setVistaBloqueados(false); else updateArchiveView(false); }}
                aria-label={tChat("back")}
                className="-ml-2 grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#162543] transition active:bg-[#eef6fb] hover:bg-[#eef9fd]"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <h2 className={cn("text-lg font-extrabold text-[#162543]", nativeApp && !showArchived && !vistaBloqueados && "sr-only")}>{vistaBloqueados ? tChat("blocked") : showArchived ? tChat("archived") : tChat("messages")}</h2>
          </div>
          {/* El mismo campo que Profesionales, Empleos y Proyectos (MarketplaceSearch):
              solo cambia el texto. Filtra en vivo, sin pantalla de búsqueda. */}
          {!vistaBloqueados && !subvistaEnLaBarra && (
            <div className={cn("flex h-11 w-full items-center gap-3 rounded-[10px] border border-[#e5e7eb] bg-white px-4 transition-colors focus-within:ring-2 focus-within:ring-[#009FD9]/20", (showArchived || !nativeApp) && "mt-3")}>
              <Search className="h-5 w-5 shrink-0 text-[#162543]" />
              <div className="relative min-w-0 flex-1">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={isEn ? "Search conversations" : "Buscar conversaciones"} className="h-11 w-full min-w-0 bg-transparent pr-9 text-[15px] font-semibold text-[#162543] outline-none placeholder:text-[#8f9aaa] lg:text-base lg:font-normal lg:text-gray-700 lg:placeholder:text-gray-400" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label={isEn ? "Clear search" : "Borrar búsqueda"} className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#8b96a5] hover:bg-[#edf3f7]"><X className="h-4 w-4" /></button>}
              </div>
            </div>
          )}
        </div>
        <div ref={listaRef} data-lista-cabe={listaCabe ? "true" : "false"} className="ccr-direct-chat-list min-h-0 flex-1 overflow-y-auto">
          {vistaBloqueados ? (
            <div>
              <p className="border-b border-[#eef2f6] bg-[#f7fafc] px-4 py-3 text-xs leading-5 text-[#64748b]">{tChat("blockedHint")}</p>
              {bloqueadas.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[#8492a5]">{tChat("blockedEmpty")}</p>
              ) : bloqueadas.map((item) => {
                const person = personFor(item);
                return (
                  <div key={item.id} className="flex items-center gap-3 border-b border-[#eef2f6] bg-white p-4 last:border-b-0">
                    <Avatar className="h-11 w-11"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
                    <strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong>
                    <button
                      type="button"
                      disabled={desbloqueando === item.id}
                      onClick={() => void desbloquear(item.id)}
                      className="shrink-0 rounded-lg border border-[#d8e4ec] px-3 py-2 text-xs font-extrabold text-[#008fc4] transition hover:bg-[#eef9fd] disabled:opacity-50"
                    >
                      {desbloqueando === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : tChat("unblock")}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}
          {!vistaBloqueados && !showArchived && bloqueadas.length > 0 && (
            <button type="button" onClick={() => setVistaBloqueados(true)} className="relative flex w-full items-center gap-3 bg-white px-4 py-3 text-left transition hover:bg-[#f3f8fb]">
              <span className="grid w-11 shrink-0 place-items-center text-[#526277]">
                <Flag className="h-[18px] w-[18px]" />
              </span>
              <strong className="min-w-0 flex-1 text-sm text-[#162543]">{tChat("blocked")}</strong>
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8eef4] px-1.5 text-[10px] font-extrabold text-[#526277]">{bloqueadas.length > 99 ? "99+" : bloqueadas.length}</span>
              <SeparadorDeChat />
            </button>
          )}
          {!vistaBloqueados && !showArchived && (nativeApp || archivedCount > 0) && (
            // Como WhatsApp: el icono suelto, del alto de la palabra y centrado
            // en la columna de las fotos, para que «Archivados» empiece donde
            // empiezan los nombres y se lea con su mismo tamaño y color.
            <button type="button" onClick={() => updateArchiveView(true)} className="relative flex w-full items-center gap-3 bg-white px-4 py-3 text-left transition hover:bg-[#f3f8fb]">
              <span className="grid w-11 shrink-0 place-items-center text-[#526277]">
                <Archive className="h-[18px] w-[18px]" />
              </span>
              <strong className="min-w-0 flex-1 text-sm text-[#162543]">{tChat("archived")}</strong>
              {archivedCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#e8eef4] px-1.5 text-[10px] font-extrabold text-[#526277]">{archivedCount > 99 ? "99+" : archivedCount}</span>}
              <SeparadorDeChat />
            </button>
          )}
          {!vistaBloqueados && filtered.map((item) => { const person = personFor(item); const unread = user?.id === item.client_id ? item.client_unread_count : item.professional_unread_count; const fila = (
            <button type="button" onClick={() => { if (filaAbierta) { setFilaAbierta(null); setConfirmaEliminar(null); return; } selectConversation(item.id); }} className={cn("flex w-full gap-3 bg-white p-4 text-left transition hover:bg-[#f7fafc]", item.id === activeId && "lg:bg-[#f2f9fd] lg:shadow-[inset_3px_0_0_#009FD9]")}>
              <Avatar className="h-11 w-11"><AvatarImage src={person.avatar ?? undefined} /><AvatarFallback className="bg-[#e8f8ff] font-bold text-[#009FD9]">{getInitials(person.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1"><span className="flex items-center gap-2"><strong className="min-w-0 flex-1 truncate text-sm text-[#162543]">{person.name}</strong><time className="shrink-0 text-[11px] text-[#8492a5]">{timeLabel(item.last_message_at, locale)}</time></span><span className="mt-1 flex items-center gap-2"><span className={cn("min-w-0 flex-1 truncate text-xs", storedDrafts[item.id] ? "italic text-[#8a94a6]" : "text-[#6b7a90]")}>{storedDrafts[item.id] ? `${tChat("draft")}: ${storedDrafts[item.id]}` : item.last_message || tChat("started")}</span>{!!unread && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold text-white">{unread}</span>}</span></span>
            </button>);
            if (item.id === DRAFT_CONVERSATION_ID) return <div key={item.id} className="ccr-fila-chat relative">{fila}<SeparadorDeChat /></div>;
            return (
              <FilaDeslizable
                key={item.id}
                className="ccr-fila-chat"
                onContextMenu={(event) => { event.preventDefault(); setHojaDeFila(item.id); }}
                abierta={filaAbierta === item.id}
                ancho={showArchived ? 176 : 176}
                anchoIzquierda={88}
                onEstado={(abrir) => { setFilaAbierta(abrir ? item.id : null); if (!abrir) setConfirmaEliminar(null); }}
                onPulsacionLarga={() => setHojaDeFila(item.id)}
                resaltada={hojaDeFila === item.id}
                onCompletarDerecha={() => void archivarFila(item.id, !showArchived)}
                onCompletarIzquierda={() => void marcarLeida(item.id, !!unread)}
                accionesIzquierda={(completando) => (
                  <button type="button" onClick={() => void marcarLeida(item.id, !!unread)} className="relative min-w-[88px] flex-1 shrink-0 bg-[#009FD9] text-white">
                    <span className="absolute top-1/2 flex w-16 -translate-y-1/2 flex-col items-center gap-1" style={iconoDeAccion(completando, "right")}>
                      {unread ? <MessageSquareText className="h-5 w-5" /> : <IconoNoLeido />}
                      <span className="text-[11px] font-extrabold">{unread ? (isEn ? "Read" : "Leído") : (isEn ? "Unread" : "No leído")}</span>
                    </span>
                  </button>
                )}
                acciones={(completando) => showArchived ? (
                  <>
                    {/* En Archivados también «Más», no «Eliminar»: borrar es irreversible y
                        vive solo dentro de la hoja, con su doble confirmación. */}
                    <button type="button" tabIndex={completando ? -1 : 0} onClick={() => { setFilaAbierta(null); setHojaDeFila(item.id); }} className={cn("flex shrink-0 flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap bg-[#162543] text-white transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", completando ? "w-0" : "w-[88px]")}>
                      <MoreHorizontal className="h-5 w-5" />
                      <span className="text-[11px] font-extrabold">{isEn ? "More" : "Más"}</span>
                    </button>
                    <button type="button" onClick={() => void archivarFila(item.id, false)} className="relative flex-1 shrink-0 bg-[#009FD9] text-white">
                      <span className="absolute top-1/2 flex w-16 -translate-y-1/2 flex-col items-center gap-1" style={iconoDeAccion(completando, "left")}>
                      <ArchiveRestore className="h-5 w-5" />
                      <span className="text-[11px] font-extrabold">{tChat("unarchive")}</span>
                      </span>
                    </button>
                  </>
                ) : (
                  <>
                    {/* «Más» a la par de «Archivar», como WhatsApp: abre la misma
                        hoja de abajo que la pulsación larga. */}
                    <button type="button" tabIndex={completando ? -1 : 0} onClick={() => { setFilaAbierta(null); setHojaDeFila(item.id); }} className={cn("flex shrink-0 flex-col items-center justify-center gap-1 overflow-hidden whitespace-nowrap bg-[#162543] text-white transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", completando ? "w-0" : "w-[88px]")}>
                      <MoreHorizontal className="h-5 w-5" />
                      <span className="text-[11px] font-extrabold">{isEn ? "More" : "Más"}</span>
                    </button>
                    <button type="button" onClick={() => void archivarFila(item.id, true)} className="relative flex-1 shrink-0 bg-[#009FD9] text-white">
                      <span className="absolute top-1/2 flex w-16 -translate-y-1/2 flex-col items-center gap-1" style={iconoDeAccion(completando, "left")}>
                      <Archive className="h-5 w-5" />
                      <span className="text-[11px] font-extrabold">{tChat("archive")}</span>
                      </span>
                    </button>
                  </>
                )}
              >
                {fila}
                <SeparadorDeChat />
              </FilaDeslizable>
            ); })}
          {!vistaBloqueados && showArchived && !displayedConversations.length ? (
            <PanelEmptyState plano icon={Archive} title={tChat("archivedEmptyTitle")} description={tChat("archivedEmptyHint")} />
          ) : !filtered.length && <p className="p-6 text-center text-sm text-[#6b7a90]">{isEn ? "No matching conversations." : "No hay conversaciones que coincidan."}</p>}
        </div>
      </aside>

      <section className={cn("min-h-0 flex-col", mobileThread ? "flex" : "hidden lg:flex")}>
        <header className="ccr-direct-chat-thread-header flex min-h-[65px] shrink-0 items-center gap-2.5 border-b border-[#e5e7eb] bg-white px-3 py-2.5 shadow-[0_8px_22px_-24px_rgba(15,23,42,0.45)] sm:gap-3 sm:px-5 sm:py-3">
          <button type="button" data-native-back="conversations" onClick={closeThread} className="inline-flex h-10 shrink-0 items-center gap-1 rounded-full pl-1 pr-1.5 text-[#162543] transition active:bg-[#eef6fb] lg:hidden" aria-label={isEn ? "Back to conversations" : "Volver a conversaciones"}>
            <ArrowLeft className="h-5 w-5 shrink-0" />
            {conversacionesSinLeer > 0 && (
              <span className="text-[13px] font-extrabold tabular-nums text-[#009FD9]">{conversacionesSinLeer > 99 ? "99+" : conversacionesSinLeer}</span>
            )}
          </button>
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
          {/* La cabecera solo dice con quién estás hablando. Archivar, reportar
              y eliminar viven en la FILA de la lista —deslizándola o dejándola
              pulsada—, como en WhatsApp: son acciones sobre la conversación,
              no sobre lo que estás leyendo, y arriba invitaban a tocarlas por
              accidente con el pulgar. En computadora, donde no hay gesto, la
              fila las ofrece con el botón derecho. */}
          {!nativeApp && (
            <ChatActionButton label={archiveLabel} onClick={() => void toggleArchiveActive()} className="grid h-9 w-9 place-items-center rounded-lg border border-[#d6e4ed] bg-[#f7fbfd] text-[#526277] shadow-sm transition hover:border-[#9fd8ec] hover:bg-[#eef9fd] hover:text-[#009FD9]">{showArchived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</ChatActionButton>
          )}
        </header>
        {/* Orígenes del hilo: la conversación es de la persona y cada solicitud,
            proyecto o propuesta se va anclando aquí. Se muestra el más reciente
            y, si hay más, se despliegan hasta cuatro como en los fijados de
            WhatsApp. */}
        <div ref={scrollRef} className="ccr-direct-chat-thread-scroll min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-[#f3f7fa] px-4 py-5 sm:px-6">
          {threadLoading ? (
            <div className="ccr-delayed-loading space-y-3 py-2" aria-busy="true" role="status">
              <span className="sr-only">{tChat("loadingMessages")}</span>
              {[
                { mio: false, ancho: "w-40" },
                { mio: true, ancho: "w-32" },
                { mio: false, ancho: "w-52" },
                { mio: true, ancho: "w-44" },
                { mio: false, ancho: "w-36" },
              ].map((burbuja, indice) => (
                <div key={indice} className={cn("flex", burbuja.mio && "justify-end")}>
                  <Skeleton className={cn("h-9 rounded-2xl", burbuja.ancho)} />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            // A pantalla completa en la app, dos líneas sueltas en medio de la
            // nada se veían como un error de carga: el mismo vacío del resto.
            <PanelEmptyState
              plano
              tamano="compacto"
              icon={MessageSquareMore}
              title={tChat("threadEmpty")}
              description={tChat("threadEmptySub")}
              className="h-full"
            />
          ) : messages.map((message) => {
            const mine = message.sender_id === user?.id;
            const uploading = message.id.startsWith("pending-");
            // Con fotos, la burbuja toma de una vez su ancho máximo. Si no, se
            // encoge mientras la imagen viaja y se abre de golpe al llegar.
            const fotos = message.attachment_urls?.filter(isImageAttachment).length ?? 0;
            return (
              <div key={message.id} id={`msg-${message.id}`} className={cn("flex items-end gap-2 rounded-2xl", mine && "justify-end")}>
                {!mine && (
                  <Avatar className="h-7 w-7 shrink-0 shadow-sm">
                    <AvatarImage src={activePerson?.avatar ?? undefined} alt={activePersonName} />
                    <AvatarFallback className="bg-[#e8f8ff] text-[10px] font-extrabold text-[#009FD9]">
                      {getInitials(activePersonName)}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div
                  onContextMenu={(event) => {
                    if (uploading) return;
                    event.preventDefault();
                    abrirMenuMensaje(message.id, event.currentTarget, mine);
                  }}
                  onPointerDown={(event) => {
                    if (event.pointerType === "mouse" || uploading) return;
                    const burbuja = event.currentTarget;
                    if (pulsacionLarga.current) window.clearTimeout(pulsacionLarga.current);
                    pulsacionLarga.current = window.setTimeout(() => abrirMenuMensaje(message.id, burbuja, mine), 450);
                  }}
                  onPointerMove={() => { if (pulsacionLarga.current) window.clearTimeout(pulsacionLarga.current); }}
                  onPointerUp={() => { if (pulsacionLarga.current) window.clearTimeout(pulsacionLarga.current); }}
                  onPointerCancel={() => { if (pulsacionLarga.current) window.clearTimeout(pulsacionLarga.current); }}
                  className={cn(
                  "min-w-[86px] rounded-[18px] px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_4px_12px_-8px_rgba(15,23,42,0.55)]",
                  nativeApp ? "select-none [-webkit-touch-callout:none]" : "select-text",
                  menuMensaje?.id === message.id && "ring-2 ring-[#009FD9]/35",
                  message.deleted_at
                    ? cn("max-w-[86%] border border-dashed border-[#d6e1ea] bg-[#f7fafc] text-[#6b7a90] shadow-none sm:max-w-[78%]", mine ? "rounded-br-md" : "rounded-bl-md")
                    : mine
                    ? "max-w-[86%] rounded-br-md bg-[#009FD9] font-medium text-white sm:max-w-[78%]"
                    : "max-w-[calc(86%_-_2.25rem)] rounded-bl-md border border-[#e5e7eb] bg-white text-[#25364d] sm:max-w-[72%]",
                  fotos > 0 && (mine ? "w-[86%] sm:w-[78%]" : "w-[calc(86%_-_2.25rem)] sm:w-[72%]"),
                )}>
                  {message.reply_to_id && !message.deleted_at && (() => {
                    const citada = messages.find((m) => m.id === message.reply_to_id);
                    return (
                      <button
                        type="button"
                        onClick={(event) => { event.stopPropagation(); irAlMensaje(message.reply_to_id!); }}
                        className={cn("mb-1.5 block w-full min-w-0 rounded-md border-l-[3px] px-2.5 py-1.5 text-left", mine ? "border-white/40 bg-white/15" : "border-[#009FD9] bg-[#f2f9fd]")}
                        data-cita
                      >
                        <span className={cn("block truncate text-[12px] font-extrabold", mine ? "text-white" : "text-[#009FD9]")}>{autorDeMensaje(citada) || tChat("originalMessage")}</span>
                        {citada && <span className={cn("block truncate text-[12.5px] font-medium", mine ? "text-white/85" : "text-[#526277]")}>{resumenDeMensaje(citada)}</span>}
                      </button>
                    );
                  })()}
                  {message.deleted_at ? (
                    <p className="flex items-center gap-1.5 italic"><Ban className="h-3.5 w-3.5 shrink-0" aria-hidden />{mine ? tChat("youDeletedMessage") : tChat("messageDeleted")}</p>
                  ) : <>
                  {message.body && !(message.attachment_urls?.length && (message.body === "Archivo adjunto" || message.body === "Attachment")) && (
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                  )}
                  {!!message.attachment_urls?.length && (() => {
                    const mosaico = fotos >= 2;
                    return (
                    <div className={cn("grid gap-2", mosaico && "grid-cols-2", message.body && message.body !== "Archivo adjunto" && message.body !== "Attachment" && "mt-2 pt-1")}>
                      {message.attachment_urls.map((attachment, index) => {
                        const href = attachment.url ?? undefined;
                        const image = isImageAttachment(attachment);
                        // En mosaico, una última foto impar ocupa el ancho entero
                        // en vez de dejar media fila vacía.
                        const solitaria = mosaico && fotos % 2 === 1 && index === fotos - 1;
                        const marco = !mosaico || solitaria ? MARCO_SOLA : MARCO_MOSAICO;
                        return image ? (
                          <button
                            key={`${message.id}-${attachment.path ?? attachment.name}-${index}`}
                            type="button"
                            onClick={() => href && setImagePreview(attachment)}
                            disabled={!href}
                            className={cn(
                              "group relative overflow-hidden rounded-xl border text-left transition",
                              solitaria && "col-span-2",
                              mine ? "border-white/30 bg-white/10 hover:bg-white/15" : "border-[#dce8f0] bg-[#f7fbfd] hover:border-[#b9d8e8]",
                            )}
                            aria-label={isEn ? `Open ${attachment.name}` : `Abrir ${attachment.name}`}
                          >
                            {href ? (
                              <ChatImage key={href} href={href} alt={attachment.name} marco={marco} />
                            ) : (
                              <span className="ccr-image-skeleton block w-full" style={{ aspectRatio: marco }} aria-hidden />
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
                              "group flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-left transition",
                              mosaico ? "col-span-2" : "min-w-[220px]",
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
                    );
                  })()}
                  </>}
                  <time className={cn("mt-1 block text-right text-[10px]", mine && !message.deleted_at ? "text-white/75" : "text-[#8996a8]")}>
                    {message.edited_at && !message.deleted_at && <span className="mr-1">{tChat("edited")} ·</span>}
                    {timeLabel(message.created_at, locale)}
                  </time>
                </div>
              </div>
            );
          })}
          {/* EL ESTADO, COMO iMESSAGE: texto gris bajo tu ÚLTIMO mensaje, solo si
              la conversación termina en él (si el otro ya contestó, sobra). Los
              checks de color no se entendían sobre la burbuja azul. */}
          {(() => {
            const ultimo = messages[messages.length - 1];
            if (!ultimo || ultimo.sender_id !== user?.id || ultimo.deleted_at) return null;
            const texto = ultimo.id.startsWith("pending-")
              ? tChat("sending")
              : ultimo.read_at
                ? tChat("seenAt", { hora: timeLabel(ultimo.read_at, locale) })
                : ultimo.delivered_at ? tChat("delivered") : tChat("sent");
            return <p className="-mt-1 pr-1 text-right text-[11px] font-semibold text-[#8996a8]" aria-live="polite">{texto}</p>;
          })()}
        </div>
        {nativeApp && whatsappEscape && (
          <div className="border-t border-[#e5e7eb] bg-[#fffbeb] px-4 py-2.5 text-xs font-semibold text-[#8a6d1f]">
            <p>{isEn ? "No reply in the app for over a day." : "Más de un día sin respuesta en la app."}</p>
            <a href={whatsappEscape} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex min-h-9 items-center gap-2 rounded-lg bg-[#25D366] px-3 text-[13px] font-extrabold text-white">
              {isEn ? "Continue on WhatsApp" : "Continuar por WhatsApp"}
            </a>
          </div>
        )}
        {(error || attachmentError) && <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">{error || attachmentError}</p>}
        {/* UNA CONVERSACIÓN BLOQUEADA SE ABRE, NO SE ESCONDE. Antes tocar
            «Mensaje» en la ficha de alguien bloqueado daba un error suelto y
            ninguna pista de qué pasó. Ahora el hilo se abre con sus mensajes,
            dice que está bloqueado en el lugar del compositor y, a quien
            bloqueó, le da el botón para deshacerlo. A la otra persona solo le
            dice que no puede escribir: no le toca decidir. */}
        {conversacionBloqueada ? (
          <div className="shrink-0 border-t border-[#e5e7eb] bg-[#fbf3f3] px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-center">
            <p className="text-sm font-extrabold text-[#8f2f2f]">{tChat("blockedTitle")}</p>
            <p className="mt-1 text-xs leading-5 text-[#7a6363]">
              {bloqueadaPorMi ? tChat("blockedMineHint") : tChat("blockedOtherHint")}
            </p>
            {bloqueadaPorMi && (
              <button
                type="button"
                disabled={desbloqueando === activeId}
                onClick={() => { if (activeId) void desbloquear(activeId); }}
                className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg border border-[#d8e4ec] bg-white px-4 text-sm font-extrabold text-[#008fc4] transition hover:bg-[#eef9fd] disabled:opacity-50"
              >
                {desbloqueando === activeId ? <Loader2 className="h-4 w-4 animate-spin" /> : tChat("unblock")}
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="ccr-direct-chat-composer shrink-0 border-t border-[#e5e7eb] bg-white p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] sm:p-4">
            {!!selectedAttachments.length && (
              <div className="ccr-carril mb-2 flex gap-2 overflow-x-auto pb-1">
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
            {respondiendoA && !editando && (() => {
              const citada = messages.find((m) => m.id === respondiendoA);
              return (
                <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-[#009FD9] bg-[#f2f9fd] py-2 pl-3 pr-2" data-respuesta-en-curso>
                  <Reply className="h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-extrabold text-[#009FD9]">{tChat("replyingTo", { name: autorDeMensaje(citada) })}</span>
                    <span className="block truncate text-[13px] text-[#526277]">{resumenDeMensaje(citada)}</span>
                  </span>
                  <button type="button" onClick={() => setRespondiendoA(null)} aria-label={tChat("cancelReply")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#526277] hover:bg-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}
            {editando && (
              // Sin X aquí: la salida de la edición ocupa el lugar del clip,
              // como en WhatsApp —editando no se adjunta nada—.
              <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-[#009FD9] bg-[#f2f9fd] py-2 pl-3 pr-3">
                <Pencil className="h-4 w-4 shrink-0 text-[#009FD9]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-extrabold text-[#009FD9]">{tChat("editingMessage")}</span>
                  <span className="block truncate text-[13px] text-[#526277]">{editando.original}</span>
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={IMAGE_DOC_ACCEPT}
              multiple
              disabled={sending || preparingAttachments}
              className="hidden"
              onChange={(event) => { void addAttachments(event.currentTarget.files); }}
            />
            {editando ? (
              <button
                type="button"
                onClick={cancelarEdicion}
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8e5ee] bg-[#f7fbfd] text-[#526277] transition after:absolute after:-inset-1 after:content-[''] hover:text-[#162543]"
                aria-label={tChat("cancelEdit")}
              >
                <X className="h-5 w-5" />
              </button>
            ) : (
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending || preparingAttachments || selectedAttachments.length >= MAX_ATTACHMENTS}
                className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#d8e5ee] bg-[#f7fbfd] text-[#526277] transition after:absolute after:-inset-1 after:content-[''] hover:border-[#9fd8ec] hover:text-[#009FD9] disabled:opacity-45"
                aria-label={isEn ? "Attach file" : "Adjuntar archivo"}
              >
                <Paperclip className="h-5 w-5" />
              </button>
            )}
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
              className="max-h-36 min-h-12 min-w-0 flex-1 resize-none overflow-hidden rounded-[20px] border border-[#d8e5ee] px-4 py-2.5 text-[15px] leading-6 outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/10"
            />
            <button
              type="submit"
              disabled={sending || (!draft.trim() && !selectedAttachments.length)}
              className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white transition after:absolute after:-inset-1 after:content-[''] hover:bg-[#008fca] disabled:bg-[#d8e4e9]"
              aria-label={editando ? tChat("saveEdit") : isEn ? "Send" : "Enviar"}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : editando ? <Check className="h-5 w-5" strokeWidth={2.6} /> : <SendHorizontal className="h-5 w-5" />}
            </button>
            </div>
          </form>
        )}
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

      {mensajeDelMenu && menuMensaje && createPortal(
        // COMO WHATSAPP: el fondo se oscurece, el mensaje queda ENCIMA —una
        // copia exacta en su mismo lugar— y el menú sale pegado a él, debajo y
        // del lado de la burbuja; si abajo no cabe, arriba. Siempre en el mismo
        // sitio respecto al mensaje, nunca donde cayó el dedo.
        <div className="fixed inset-0 z-[1100]" role="presentation">
          <div className="absolute inset-0 bg-[#071426]/40 backdrop-blur-[2px]" onClick={() => setMenuMensaje(null)} />
          <div
            aria-hidden
            className="pointer-events-none absolute"
            style={{ top: menuMensaje.caja.top, left: menuMensaje.caja.left, width: menuMensaje.caja.width }}
            ref={(nodo) => {
              const original = burbujaDelMenu.current;
              if (!nodo || !original || nodo.firstChild) return;
              const copia = original.cloneNode(true) as HTMLElement;
              copia.style.maxWidth = "none";
              copia.style.width = "100%";
              copia.classList.remove("ring-2");
              nodo.appendChild(copia);
            }}
          />
          <div
            className="absolute w-52"
            style={(() => {
              const { caja, mio } = menuMensaje;
              // Hasta cuatro opciones: responder, copiar, editar y eliminar.
              const alto = 4 * 48 + 8;
              const abajo = caja.bottom + 8;
              const cabeAbajo = abajo + alto <= window.innerHeight - 24;
              const top = cabeAbajo ? abajo : Math.max(caja.top - 8 - alto, 72);
              const horizontal = mio
                ? { right: Math.max(12, window.innerWidth - caja.right) }
                : { left: Math.max(12, caja.left) };
              return { top, ...horizontal };
            })()}
          >
        <div role="menu" className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_16px_36px_-18px_rgba(15,23,42,0.55)]">
            {!mensajeDelMenu.deleted_at && (
              <button type="button" role="menuitem" onClick={() => empezarRespuesta(mensajeDelMenu)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-bold text-[#162543] active:bg-[#f2f8fb]">
                <Reply className="h-4 w-4 text-[#526277]" />{tChat("replyMessage")}
              </button>
            )}
            {!mensajeDelMenu.deleted_at && !!mensajeDelMenu.body.trim() && (
              <button type="button" role="menuitem" onClick={() => void copiarMensaje(mensajeDelMenu.body)} className="flex w-full items-center gap-3 border-t border-[#eef2f6] px-4 py-3 text-left text-sm font-bold text-[#162543] active:bg-[#f2f8fb]">
                <Copy className="h-4 w-4 text-[#526277]" />{tChat("copy")}
              </button>
            )}
            {puedeEditarDelMenu && (
              <button type="button" role="menuitem" onClick={() => empezarEdicion(mensajeDelMenu)} className="flex w-full items-center gap-3 border-t border-[#eef2f6] px-4 py-3 text-left text-sm font-bold text-[#162543] active:bg-[#f2f8fb]">
                <Pencil className="h-4 w-4 text-[#526277]" />{tChat("editMessage")}
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => { setMenuMensaje(null); setMensajeAEliminar(mensajeDelMenu.id); }} className="flex w-full items-center gap-3 border-t border-[#eef2f6] px-4 py-3 text-left text-sm font-bold text-red-600 active:bg-red-50">
              <Trash2 className="h-4 w-4" />{tChat("deleteMessage")}
            </button>
          </div>
          </div>
        </div>,
        document.body,
      )}

      {mensajeEliminable && createPortal(
        // Tarjeta centrada (6-oct-2026): dos botones no necesitan una hoja.
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tChat("deleteMessageTitle")}>
          <div className="absolute inset-0 bg-[#071426]/45 backdrop-blur-[2px]" onClick={() => setMensajeAEliminar(null)} />
          <div className="app-centered-modal relative z-10 w-full max-w-sm overflow-hidden rounded-2xl bg-white pb-2 pt-2 shadow-2xl">
            <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-2">
              <p className="text-[16px] font-extrabold text-[#162543]">{tChat("deleteMessageTitle")}</p>
              <button type="button" onClick={() => setMensajeAEliminar(null)} aria-label={tChat("cancel")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef2f6] text-[#526277]">
                <X className="h-4 w-4" />
              </button>
            </div>
            {puedeEliminarParaTodos && (
              <button type="button" onClick={() => void eliminarMensaje(mensajeEliminable.id, "everyone")} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold text-red-600 active:bg-red-50">
                <Trash2 className="h-5 w-5" />{tChat("deleteForEveryone")}
              </button>
            )}
            <button type="button" onClick={() => void eliminarMensaje(mensajeEliminable.id, "me")} className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-[15px] font-bold text-red-600 active:bg-red-50">
              <Trash2 className="h-5 w-5" />{tChat("deleteForMe")}
            </button>
          </div>
        </div>,
        document.body,
      )}

      {copiado && createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[1100] flex justify-center px-6" role="status">
          <span className="rounded-full bg-[#162543] px-4 py-2 text-[13px] font-bold text-white shadow-lg">{tChat("copied")}</span>
        </div>,
        document.body,
      )}

      {hojaDeAcciones && createPortal(hojaDeAcciones, document.body)}
    </div>
  );
}
