"use client";

import { irAlInicio } from "@/lib/ir-al-inicio";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { confirmarSalidaSinGuardar } from "@/lib/confirmar-salida";
import { lockBodyScroll } from "@/lib/body-scroll-lock";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAvisosSinLeer } from "@/hooks/use-avisos-sin-leer";
import { useLocale, useTranslations } from "next-intl";
import { Headset, ArrowLeft, SendHorizontal, Shield, Plus, Clock3, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSombrasDeBorde } from "@/components/ui/modal";
import { createClient } from "@/lib/supabase/client";
import { SupportModal } from "@/components/support/support-modal";
import { SupportForm } from "@/components/support/support-form";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { Button } from "@/components/ui/button";
import { SectionHeadline } from "@/components/dashboard/section-headline";
import { supportTicketRef } from "@/lib/support-ticket";
import { LONG_TEXT_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { PanelEmptyState, PanelFilterEmpty, PanelListSkeleton } from "@/components/ui/content-loading";
import { getDashboardCache, setDashboardCache } from "@/lib/dashboard-prefetch-cache";

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
  "Citas, solicitudes o publicaciones": "subject4",
  "Citas, proyectos o publicaciones": "subject4",
  "Requests, projects, or proposals": "subject4",
  "Requests, posts, or proposals": "subject4",
  "Otro": "subject5",
  "Other": "subject5",
};

type SupportThreadState = { open: boolean; title: string | null; reference: string | null };

// One expired-token retry after refreshing the session — a stale token was
// surfacing as "No pudimos cargar soporte" right after resuming the app.
async function fetchWithSessionRetry(input: string, init?: RequestInit) {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  try { await createClient().auth.refreshSession(); } catch { /* retry answers */ }
  return fetch(input, init);
}

// El compositor crece con el texto hasta un tope, como el de Mensajes.
// En escritorio el hilo no puede estirar la página: su alto tiene que ser el
// espacio que de verdad queda debajo de donde arranca (la cabecera del panel, la
// tarjeta de perfil y el navbar varían por sección y por rol, así que una resta
// fija siempre se queda corta o se pasa).
function useAltoDisponible(ref: { current: HTMLDivElement | null }, activo: boolean) {
  const [alto, setAlto] = useState<number | null>(null);
  useLayoutEffect(() => {
    const medir = () => {
      const el = ref.current;
      if (!activo || !el || window.innerWidth < 1024) {
        setAlto(null);
        return;
      }
      const arriba = el.getBoundingClientRect().top;
      const disponible = Math.round(window.innerHeight - arriba - 40);
      setAlto(Math.max(360, Math.min(720, disponible)));
    };
    medir();
    window.addEventListener("resize", medir);
    const t = window.setTimeout(medir, 120);
    return () => {
      window.removeEventListener("resize", medir);
      window.clearTimeout(t);
    };
  }, [ref, activo]);
  return alto;
}

function ajustarAlto(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const alto = Math.min(textarea.scrollHeight, 144);
  textarea.style.height = `${alto}px`;
  textarea.style.overflowY = textarea.scrollHeight > 144 ? "auto" : "hidden";
}

export function SupportTickets({
  initialTicketId,
  initialNewSupport,
  onThreadChange,
}: {
  initialTicketId?: string | null;
  initialNewSupport?: boolean;
  onThreadChange?: (state: SupportThreadState) => void;
}) {
  const { user } = useAuth();
  const t = useTranslations("supportTickets");
  const tSub = useTranslations("proPanel.subtitles");
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
  const dia = (d: string) => new Date(d).toLocaleDateString(dateLocale, { day: "numeric", month: "long" });
  const hora = (d: string) => new Date(d).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });
  const fmt = (d: string) => new Date(d).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const [items, setItems] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  // Caché de sesión de la lista: al volver a Soporte se pinta lo último visto y
  // la consulta se repite por detrás. El esqueleto solo sale la primera vez.
  const claveCache = user ? `support:tickets:${user.id}` : null;
  useEffect(() => {
    if (!claveCache) return;
    const cacheados = getDashboardCache<Ticket[]>(claveCache);
    // queueMicrotask: la regla de lint no permite setState síncrono en un efecto.
    if (cacheados) queueMicrotask(() => { setItems(cacheados); setLoading(false); });
  }, [claveCache]);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<string>("open");
  // Ticket ids with an UNREAD admin reply (from the notifications table) → drives
  // the per-ticket "Nueva respuesta" marker and the dashboard Soporte badge
  // (via onUnreadChange). Filter tabs keep only their normal item count.

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
  // La separacion entre la cabecera, la charla y el campo de escribir sale de
  // aqui: sombra solo cuando hay conversacion por encima o por debajo. `openId`
  // como clave porque el hilo se monta despues de esta pantalla.
  const sombrasDelHilo = useSombrasDeBorde(messagesRef, openId);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const altoHilo = useAltoDisponible(threadRef, !!openId);

  const keepLatestMessageVisible = useCallback((behavior: ScrollBehavior = "auto") => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  }, []);

  useLayoutEffect(() => {
    const native = isNativeAppRuntime();
    // Solo el HILO va a pantalla completa, igual que el chat de mensajes: un
    // encabezado, sin barra inferior. El formulario nuevo es una sección normal.
    if (!openId || !window.matchMedia("(max-width: 1023px)").matches) return;
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
  }, [openId]);

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

  // Qué tiquetes traen respuesta sin leer sale de la lista compartida de avisos
  // sin leer, la misma que alimenta los globos del panel: antes esta pantalla
  // repetía la consulta filtrada por `support_reply`.
  const avisosSinLeer = useAvisosSinLeer(user?.id ?? null);
  const unread = useMemo(() => {
    const ids = new Set<string>();
    for (const aviso of avisosSinLeer) {
      if (aviso.type !== "support_reply") continue;
      const ticketId = (aviso.data as { ticketId?: string } | null)?.ticketId;
      if (ticketId) ids.add(ticketId);
    }
    return ids;
  }, [avisosSinLeer]);



  const closeThread = useCallback(() => {
    setOpenId(null);
    setTicket(null);
    setMessages([]);
  }, []);


  // Cada paso de Soporte abre desde su comienzo: la lista, el formulario de un
  // caso nuevo y la conversación. Entrar, salir y volver a entrar dejaba la
  // pantalla donde estaba y el paso abría por la mitad.
  useEffect(() => { irAlInicio(); }, [showNewTicketPage, openId]);

  const load = useCallback((esperandoNuevo = false) => {
    // El esqueleto solo cuando no hay NADA que mostrar. Volver a Soporte con la
    // lista ya cargada lo hacía aparecer otra vez —y encima tapaba los filtros—
    // aunque no hubiera nada nuevo que traer.
    //
    // Al ACABAR DE CREAR un tiquete sí se pide: la caché guardada es la lista
    // SIN él —para el primero, una lista vacía—, así que mientras llegaba la
    // nueva se pintaba «Todavía no tienes tiquetes» y un instante después el
    // tiquete recién creado. Eso es el parpadeo.
    if (esperandoNuevo || !claveCache || !getDashboardCache<Ticket[]>(claveCache)) setLoading(true);
    setLoadError(false);
    fetchWithSessionRetry("/api/support")
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data?.error ?? "support-load-failed");
        return data;
      })
      .then(({ tickets }) => {
        setItems(tickets ?? []);
        if (claveCache) setDashboardCache(claveCache, tickets ?? []);
      })
      .catch(() => {
        setItems([]);
        setLoadError(true);
      })
      .finally(() => setLoading(false));
  }, [claveCache]);

  useEffect(() => {
    if (!openId && !showNewTicketPage) queueMicrotask(() => { load(); });
  }, [openId, showNewTicketPage, load]);

  const openTicket = useCallback(async (id: string, { silencioso = false }: { silencioso?: boolean } = {}) => {
    setOpenId(id);
    // La conversación se abre YA: el asunto, el estado y la referencia ya están
    // en la fila que se acaba de tocar, así que el encabezado y el compositor se
    // pintan de inmediato y lo único que espera son los mensajes. Antes toda la
    // pantalla se iba a un esqueleto antes de llegar al chat.
    const deLaLista = items.find((fila) => fila.id === id);
    if (deLaLista) setTicket(deLaLista);
    if (!silencioso) setThreadLoading(true);
    fetchWithSessionRetry(`/api/support?id=${id}`)
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
      // La lista compartida se entera por este aviso y el globo baja solo.
      window.dispatchEvent(new Event("notificationsChanged"));
    }
  }, [user, items]);

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
    const texto = reply.trim();
    if (!texto || !openId) return;
    // El mensaje aparece de una vez, como en Mensajes: la burbuja se pinta
    // antes de la ida y vuelta y luego se reemplaza por la fila guardada. Si
    // el envío falla, se quita y el texto vuelve al compositor.
    const idProvisional = `pendiente-${Date.now()}`;
    const provisional: Message = {
      id: idProvisional,
      sender_role: "user",
      sender_name: null,
      body: texto,
      created_at: new Date().toISOString(),
    };
    setMessages((previos) => [...previos, provisional]);
    setReply("");
    setSending(true);
    const res = await fetch("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: openId, body: texto }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setSending(false);
    if (res?.ok) {
      if (data?.message) {
        setMessages((previos) => {
          const sinProvisional = previos.filter((m) => m.id !== idProvisional);
          return sinProvisional.some((m) => m.id === data.message.id) ? sinProvisional : [...sinProvisional, data.message];
        });
        if (data.status) setTicket((actual) => actual ? { ...actual, status: data.status } : actual);
      } else {
        void openTicket(openId, { silencioso: true });
      }
    } else {
      setMessages((previos) => previos.filter((m) => m.id !== idProvisional));
      setReply(texto);
      void showMessage({ title: errorTitle, description: t("sendError"), tone: "danger" });
    }
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
    if (res.ok) void openTicket(openId, { silencioso: true });
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
      // Con un tiquete a medio escribir, el guardián pide confirmación.
      confirmarSalidaSinGuardar(() => {
        setShowNewTicketPage(false);
        closeThread();
      });
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
    load(true);
  }

  if (showNewTicketPage) {
    return (
      <>
        <div className="ccr-support-new-ticket flex min-h-0 flex-1 flex-col bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f4f7fa] py-5">
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
      {/* Acotado en TODOS los anchos, no solo en escritorio: un hilo largo tiene
          que desplazarse dentro de su panel con el compositor fijo abajo, no
          estirar la página. Misma forma que usa Mensajes. Las reglas de la app
          nativa son más específicas y siguen mandando allí. */}
      <div
        ref={threadRef}
        style={altoHilo ? { height: altoHilo } : undefined}
        // EN COMPUTADORA EL ALTO SIGUE AL CONTENIDO. Eran 720 px fijos, asi
        // que un caso de un solo mensaje dejaba media pantalla en blanco
        // debajo. Ahora crece con la conversacion y se detiene donde estaba:
        // corto se ve corto, largo se desplaza. En el telefono no cambia —un
        // chat ahi ocupa la pantalla entera—.
        // EL CHAT LLENA LA TARJETA. Estaba 20 px adentro por cada lado —el
        // relleno de la seccion— y con el lienzo tenido quedaba una caja de
        // 814 px flotando dentro de una de 864: el blanco de los costados se
        // leia como una franja, y una charla encajonada no parece un chat.
        // Los margenes negativos anulan ese relleno en computadora; el borde
        // inferior redondeado es el de la propia tarjeta.
        className="ccr-support-thread flex h-[calc(100dvh-153px)] min-h-[360px] flex-col lg:-mx-5 lg:-mb-5 lg:h-auto lg:min-h-[380px] lg:max-h-[min(720px,calc(100dvh-260px))] lg:overflow-hidden lg:rounded-b-2xl"
      >
        {!ticket ? (
          <div className="grid min-h-0 flex-1 place-items-center px-4">
            <PanelListSkeleton rows={2} />
          </div>
        ) : (
          <div className="ccr-support-thread-card flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
            {/* SIN LINEAS DURAS. La cabecera, el lienzo y el campo de escribir
                estaban separados por dos bordes de 1 px que partian la tarjeta
                en tres cajas y dejaban el gris del medio como un recuadro
                metido adentro. Es lo que Intercom llama su Messenger «sin
                bordes»: una sola superficie continua, y la separacion aparece
                SOLA —en sombra— solo cuando hay conversacion por encima o por
                debajo. Con un mensaje no hay ninguna linea; con veinte, las
                dos. */}
            <header className={`grid min-h-[68px] shrink-0 grid-cols-[40px_minmax(0,1fr)] items-center gap-2 bg-white px-3 py-2.5 transition-shadow sm:grid-cols-[44px_minmax(0,1fr)] sm:gap-3 sm:px-5 ${sombrasDelHilo.arriba ? "shadow-[0_8px_12px_-6px_rgba(15,23,42,0.14)]" : ""}`}>
              <button onClick={closeThread} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#526277] transition active:bg-[#eef6fb]" aria-label={t("backToTickets")}>
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#ccecf8] shadow-sm ccr-caja-icono-plana">
                  <Headset className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-base font-extrabold leading-tight text-[#162543]">{ticketSubject(ticket)}</h3>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLOR[ticket.status] ?? ""}`}>{statusLabel(ticket.status)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs font-semibold text-[#6b7280]">{t("caseRef", { ref: supportTicketRef(ticket.id, ticket.created_at, ticket.case_number) })}</p>
                </div>
              </div>
            </header>

            {/* El primer mensaje ARRIBA, como en un chat: Isaac lo pidio dos
                veces y la segunda con razon. Apoyar el bloque sobre el campo
                dejaba el hueco encima y se leia como una lista al reves. */}
            <div ref={messagesRef} className="ccr-support-thread-messages flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain bg-white px-4 py-5 sm:px-6">
              {/* Lo único que espera son los mensajes, y esperan con forma de
                  mensaje: dos globos grises, uno de cada lado. */}
              {threadLoading && messages.length === 0 && (
                <>
                  <div className="flex justify-start"><div className="h-14 w-[70%] animate-pulse rounded-[18px] rounded-bl-md bg-white/80" /></div>
                  <div className="flex justify-end"><div className="h-12 w-[55%] animate-pulse rounded-[18px] rounded-br-md bg-[#dbeaf3]" /></div>
                </>
              )}
              {messages.map((m, i) => (
                <Fragment key={m.id}>
                  {/* La fecha se dice UNA vez por dia, en el centro, como en
                      cualquier chat: repetida en cada globo era ruido, y sin
                      ella una conversacion de varios dias parecia seguida. */}
                  {(i === 0 || dia(messages[i - 1].created_at) !== dia(m.created_at)) && (
                    <div className="my-2 flex justify-center first:mt-0">
                      <span className="rounded-full bg-[#e8eef4] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#68778d]">{dia(m.created_at)}</span>
                    </div>
                  )}
                {/* El nombre de quien contesta va ENCIMA de su globo, chiquito y
                    gris, como en Messenger; solo cuando cambia quien habla. */}
                {m.sender_role === "admin" && (i === 0 || messages[i - 1].sender_role !== "admin") && (
                  <span className="mt-2 flex items-center gap-1 px-3 text-[12px] font-semibold text-[#68778d]"><Shield className="h-3 w-3" />{t("supportName")}</span>
                )}
                <div className={`flex ${m.sender_role === "user" ? "justify-end" : "justify-start"} ${i > 0 && messages[i - 1].sender_role !== m.sender_role && m.sender_role === "user" ? "mt-2" : ""}`}>
                  {/* El globo se ajusta al texto y no pasa de 34rem: a lo
                      ancho de una pantalla de computadora, un renglon de 900 px
                      deja de leerse como un mensaje y parece un parrafo de una
                      pagina. La esquina del lado de quien habla va recta, que
                      es lo que hace de pico. */}
                  <div className={`max-w-[min(34rem,86%)] rounded-[18px] px-4 py-2.5 text-[15px] leading-relaxed ${m.sender_role === "user" ? "rounded-br-md bg-[#009FD9] text-white" : "rounded-bl-md bg-[#eef1f5] text-[#162543]"}`}>
                    {/* EN EL PROPIO GLOBO NO SE FIRMA. Un globo azul a la
                        derecha ya dice «yo» —es el idioma de cualquier chat— y
                        «Tu» con su monigote encima ocupaba mas alto que el
                        mensaje. De soporte SI se dice quien contesta, que ahi
                        no es obvio. La hora baja al pie del globo, chiquita. */}
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <div className={`mt-1 text-[11px] leading-none ${m.sender_role === "user" ? "text-right text-white/65" : "text-[#8fa1b6]"}`}>{hora(m.created_at)}</div>
                  </div>
                </div>
                </Fragment>
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
                <span className="block font-semibold">{t("confirmedResolved")}</span>
                <span className="mt-0.5 block text-[13px] text-[#3f7a55]">{t("reopenHint")}</span>
              </div>
            )}

            {/* El campo y el boton comparten caja: una sola pieza redonda con
                el boton adentro, como Intercom o Messenger. Sueltos, la
                cascara blanca de abajo se leia como una franja vacia con dos
                cosas encima. */}
            <div className={`ccr-support-thread-composer shrink-0 bg-white px-3 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 transition-shadow sm:px-6 sm:pb-5 ${sombrasDelHilo.abajo ? "shadow-[0_-8px_12px_-6px_rgba(15,23,42,0.14)]" : ""}`}>
              {/* Pildora RELLENA, sin linea alrededor, como el «Aa» de
                  Messenger: sobre un lienzo blanco, un campo con borde era una
                  caja mas. El foco lo dice un anillo suave, no un borde.
                  EL GRIS ES #f3f4f6, uno que el proyecto YA USA en 70 sitios.
                  Estuvo en #f0f2f5 —el de Messenger— y en la maquina de Isaac
                  el campo salia BLANCO: una clase arbitraria con un valor que
                  no aparece en ningun otro lado puede no llegar a generarse, y
                  ya nos habia pasado. La diferencia entre los dos grises no se
                  ve; que el relleno exista, si. */}
              <div className="flex items-end gap-2 rounded-[24px] bg-[#f3f4f6] p-1 pl-2 transition focus-within:ring-2 focus-within:ring-[#009FD9]/30">
                <textarea
                  value={reply}
                  onChange={(e) => {
                    setReply(limitText(e.target.value, LONG_TEXT_MAX_LENGTH));
                    ajustarAlto(e.currentTarget);
                  }}
                  onKeyDown={(e) => {
                    // Mismo trato que en Mensajes: Enter manda, Mayús+Enter salta
                    // de línea. Antes Enter solo abría un renglón y había que ir
                    // al botón, que es lo contrario a lo que hace cualquier chat.
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (!sending && reply.trim()) void sendReply();
                    }
                  }}
                  onFocus={() => window.requestAnimationFrame(() => keepLatestMessageVisible())}
                  maxLength={LONG_TEXT_MAX_LENGTH}
                  rows={1}
                  placeholder={ticket.status === "resolved" ? t("reopenPlaceholder") : t("messagePlaceholder")}
                  className="max-h-36 min-h-10 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-3.5 py-2 text-[15px] leading-6 outline-none"
                />
                <button onClick={sendReply} disabled={sending || !reply.trim()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white transition hover:bg-[#008fca] disabled:bg-[#e3eaf0] disabled:text-[#a9b7c4]" aria-label={sending ? t("sending") : t("send")}>
                  {sending ? <Clock3 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-[18px] w-[18px]" />}
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
      {/* Cabecera de la sección: el contexto a la izquierda y la acción a la
          derecha, ARRIBA de los filtros, igual que en Mis proyectos. El filtro
          tiene que quedar pegado a la lista que filtra. No se dibuja mientras
          carga ni en el estado vacío, que ya trae su propio botón. */}
      <SectionHeadline subtitulo={tSub("soporte")}>
        {!loading && items.length > 0 && (
          <button onClick={openNewTicket} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 text-sm font-bold text-white sm:w-auto sm:px-6 transition-colors hover:bg-[#0089bb] max-sm:[&>svg]:hidden">
            <Plus className="h-4 w-4" /> {t("newTicket")}
          </button>
        )}
      </SectionHeadline>

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

      {loading && items.length === 0 ? (
        <PanelListSkeleton rows={3} withTabs />
      ) : loadError ? (
        <div className="rounded-2xl border border-[#e5e7eb] bg-white px-5 py-10 text-center">
          <Headset className="mx-auto mb-3 h-10 w-10 text-[#cbd5e1]" />
          <p className="font-semibold text-[#374151]">{t("loadError")}</p>
          <button onClick={() => load()} className="mt-4 inline-flex items-center justify-center rounded-full bg-[#009FD9] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0089bb]">
            {t("retry")}
          </button>
        </div>
      ) : items.length === 0 ? (
        <PanelEmptyState
          icon={Headset}
          title={t("empty")}
          description={t("emptySub")}
          action={(
            <Button type="button" size="crear" onClick={openNewTicket}>{t("openTicket")}</Button>
          )}
        />
      ) : filtered.length === 0 ? (
        <PanelFilterEmpty
          icon={filter === "resolved" ? CheckCircle2 : filter === "in_progress" ? Headset : Clock3}
          title={t(`viewEmpty.${filter}.title`)}
          description={t(`viewEmpty.${filter}.body`)}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((tk) => {
            const hasNew = unread.has(tk.id);
            return (
              <button key={tk.id} data-tiquete={tk.id} onClick={() => openTicket(tk.id)} className={`group text-left bg-white rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md sm:p-5 ${hasNew ? "border-[#bfe3f5] ring-1 ring-[#EBF5FB]" : "border-[#e5e7eb] hover:border-[#bfe3f5]"}`}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] ccr-caja-icono-plana">
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
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-[#68778d]">
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
