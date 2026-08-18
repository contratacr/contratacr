"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCheck,
  ClipboardList,
  Loader2,
  MapPin,
  Minus,
  RotateCcw,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import Image from "next/image";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useContainedTouchScroll } from "@/hooks/use-contained-touch-scroll";
import { useNativeApp } from "@/hooks/use-native-app";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { cn, getInitials } from "@/lib/utils";
import { AppTooltip } from "@/components/ui/app-tooltip";

type ResultCard = {
  id: string;
  name: string;
  avatarUrl: string | null;
  service: string;
  location: string;
  verified: boolean;
  rating: number | null;
  reviewCount: number;
  price: string | null;
  profileHref: string;
  requestHref: string;
  actionHref: string;
  actionLabel: string;
  actionKind: "availability" | "message";
};

type MessageAction = { label: string; href: string; kind?: string | null };
type ChatMessage = {
  role: "assistant" | "user";
  body: string;
  createdAt?: string;
  action?: MessageAction | null;
  professionals?: ResultCard[];
  suggestedService?: string | null;
  provider?: "openai" | "local";
  suggestionSent?: boolean;
  serviceId?: string | null;
};

type StoredAssistantSession = {
  id?: string;
  open: boolean;
  messages: ChatMessage[];
};

const SESSION_KEY_PREFIX = "contratacr:ai-session:";
const PENDING_INTENT_KEY = "contratacr:pending-intent";
const MAX_STORED_MESSAGES = 30;

function readStoredSession(lang: "es" | "en"): StoredAssistantSession | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(`${SESSION_KEY_PREFIX}${lang}`) || "null") as StoredAssistantSession | null;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    const messages = parsed.messages.slice(-MAX_STORED_MESSAGES).filter((message) =>
      !!message &&
      (message.role === "assistant" || message.role === "user") &&
      typeof message.body === "string",
    );
    return messages.length > 0 ? { id: parsed.id, open: !!parsed.open, messages } : null;
  } catch {
    return null;
  }
}

function storePendingIntent(href: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PENDING_INTENT_KEY, JSON.stringify({ href, createdAt: Date.now() }));
  } catch {
    /* Storage is an enhancement; navigation still works without it. */
  }
}

const COPY = {
  es: {
    closedLabel: "Abrir asistente de ContrataCR",
    minimize: "Minimizar asistente",
    title: "Asistente ContrataCR",
    intro: "¡Hola! ¿En qué puedo ayudarle hoy?",
    placeholder: "Pregunte o describa lo que necesita",
    send: "Enviar mensaje",
    thinking: "Buscando la mejor respuesta...",
    viewProfile: "Ver perfil",
    verified: "Verificado",
    suggest: "Sugerir servicio",
    suggesting: "Enviando...",
    suggested: "Sugerencia enviada",
    error: "No pude responder en este momento. Inténtelo nuevamente.",
    notice: "La IA puede equivocarse. Revise los detalles antes de continuar.",
    reset: "Nuevo chat",
    resetHint: "Limpia esta conversacion y empieza de cero.",
  },
  en: {
    closedLabel: "Open ContrataCR assistant",
    minimize: "Minimize assistant",
    title: "ContrataCR Assistant",
    intro: "Hi! How can I help you today?",
    placeholder: "Ask or describe what you need",
    send: "Send message",
    thinking: "Finding the best answer...",
    viewProfile: "View profile",
    verified: "Verified",
    suggest: "Suggest service",
    suggesting: "Sending...",
    suggested: "Suggestion sent",
    error: "I could not answer right now. Please try again.",
    notice: "AI can be wrong. Review the details before continuing.",
    reset: "New chat",
    resetHint: "Clear this conversation and start fresh.",
  },
} as const;

function language(locale: string) {
  return locale === "en" ? "en" : "es";
}

function RobotMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("relative shrink-0", compact ? "h-12 w-12" : "h-[72px] w-[72px]")} aria-hidden>
      <Image
        src="/brand/ai-assistant-robot.png"
        alt=""
        width={96}
        height={96}
        priority
        className="h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(0,111,190,0.18)]"
      />
    </div>
  );
}

function messageTime(createdAt?: string) {
  const date = createdAt ? new Date(createdAt) : new Date();
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function actionIcon(kind?: string | null) {
  if (kind === "publish_request") return <ClipboardList className="h-4 w-4" />;
  return <ArrowRight className="h-4 w-4" />;
}

function localizedDestination(href: string, lang: "es" | "en") {
  const trimmed = href.trim();
  if (!trimmed) return `/${lang}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const unlocalized = withSlash.replace(/^\/(?:es|en)(?=\/|\?|$)/, "") || "/";
  return `/${lang}${unlocalized === "/" ? "" : unlocalized}`;
}

function ProfessionalResult({ result, copy, onNavigate }: {
  result: ResultCard;
  copy: typeof COPY.es | typeof COPY.en;
  onNavigate: (href: string) => void;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[#dce8ef] bg-white shadow-[0_4px_16px_-12px_rgba(15,35,60,0.35)]">
      <button type="button" onClick={() => onNavigate(result.profileHref)} className="flex w-full gap-3 p-3 text-left">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#edf7fb] text-xs font-extrabold text-[#009FD9]">
          {result.avatarUrl ? <Image src={result.avatarUrl} alt="" width={44} height={44} className="h-full w-full object-cover" /> : getInitials(result.name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="min-w-0 flex-1 text-sm font-extrabold leading-snug text-[#162543]">{result.name}</p>
            {result.verified && <span className="inline-flex w-fit shrink-0 items-center rounded-full bg-[#009FD9] px-2 py-0.5 text-[10px] font-semibold text-white">{copy.verified}</span>}
          </div>
          <p className="mt-0.5 text-xs font-semibold text-[#53657a]">{result.service}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#708095]">
            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3 text-[#009FD9]" />{result.location}</span>
            {result.rating != null && (
              <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 fill-[#f5a623] text-[#f5a623]" />{result.rating.toFixed(1)} ({result.reviewCount})</span>
            )}
          </div>
          {result.price && <p className="mt-1.5 text-xs font-extrabold text-[#009FD9]">{result.price}</p>}
        </div>
      </button>
      <div className="grid grid-cols-2 border-t border-[#edf2f5]">
        <button type="button" onClick={() => onNavigate(result.profileHref)} className="h-10 text-xs font-bold text-[#526277] hover:bg-[#f7fafc]">{copy.viewProfile}</button>
        <button type="button" onClick={() => onNavigate(result.actionHref)} className="h-10 border-l border-[#edf2f5] bg-[#009FD9] text-xs font-extrabold text-white hover:bg-[#008fca]">{result.actionLabel}</button>
      </div>
    </article>
  );
}

export function AiConcierge({ embedded = false, onBack }: { embedded?: boolean; onBack?: () => void } = {}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const nativeApp = useNativeApp();
  const lang = language(locale);
  const copy = COPY[lang];
  const [open, setOpen] = useState(embedded);
  const [sessionHydrated, setSessionHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState("");
  const [suggestingIndex, setSuggestingIndex] = useState<number | null>(null);
  const [compactViewport, setCompactViewport] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", body: copy.intro, createdAt: new Date().toISOString() }]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionHydratedRef = useRef(false);
  const previousPathnameRef = useRef(pathname);
  useContainedTouchScroll(scrollRef, open || embedded);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompactViewport(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    window.addEventListener("resize", update);
    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    if (embedded) return;
    const openAssistant = () => setOpen(true);
    window.addEventListener("contratacr:open-ai", openAssistant);
    return () => window.removeEventListener("contratacr:open-ai", openAssistant);
  }, [embedded]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = readStoredSession(lang);
      if (stored) {
        setConversationId(stored.id || crypto.randomUUID());
        setMessages(stored.messages);
        setOpen(embedded ? true : stored.open);
      } else {
        setConversationId(crypto.randomUUID());
      }
      sessionHydratedRef.current = true;
      setSessionHydrated(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [embedded, lang]);

  useEffect(() => {
    if (!sessionHydratedRef.current) return;
    try {
      window.sessionStorage.setItem(`${SESSION_KEY_PREFIX}${lang}`, JSON.stringify({
        id: conversationId,
        open: embedded ? true : open,
        messages: messages.slice(-MAX_STORED_MESSAGES),
      } satisfies StoredAssistantSession));
    } catch {
      /* Ignore private-mode/browser storage restrictions. */
    }
  }, [conversationId, embedded, lang, messages, open]);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      previousPathnameRef.current = pathname;
      const frame = requestAnimationFrame(() => {
        if (!embedded) setOpen(false);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [embedded, pathname]);

  useEffect(() => {
    if (!open || embedded) return;
    const minimizeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", minimizeOnEscape);
    return () => window.removeEventListener("keydown", minimizeOnEscape);
  }, [embedded, open]);

  useEffect(() => {
    if (!open) return;
    const shouldLockScroll = window.matchMedia("(max-width: 1023px)").matches;
    if (!shouldLockScroll) return;
    const root = document.documentElement;
    const body = document.body;
    root.classList.add("contratacr-ai-open");
    body.classList.add("contratacr-ai-open");
    const releaseBodyScroll = lockBodyScroll();
    return () => {
      root.classList.remove("contratacr-ai-open");
      body.classList.remove("contratacr-ai-open");
      releaseBodyScroll();
    };
  }, [embedded, open]);

  useEffect(() => {
    if (authLoading || !user || user.user_metadata?.onboarding_completed !== true) return;
    const frame = requestAnimationFrame(() => {
      try {
        const pending = JSON.parse(window.sessionStorage.getItem(PENDING_INTENT_KEY) || "null") as { href?: string; createdAt?: number } | null;
        if (!pending?.href || !pending.createdAt || Date.now() - pending.createdAt > 2 * 60 * 60 * 1000) {
          window.sessionStorage.removeItem(PENDING_INTENT_KEY);
          return;
        }
        window.sessionStorage.removeItem(PENDING_INTENT_KEY);
        router.replace(pending.href);
      } catch {
        window.sessionStorage.removeItem(PENDING_INTENT_KEY);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [authLoading, router, user]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, loading, open]);

  async function ask(prefilled?: string) {
    const text = (prefilled ?? input).trim();
    if (!text || loading) return;
    const previous = messages;
    setInput("");
    setMessages([...previous, { role: "user", body: text, createdAt: new Date().toISOString() }]);
    setLoading(true);
    try {
      const latestResults = [...previous].reverse().find((message) => message.professionals?.length)?.professionals ?? [];
      const response = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          locale,
          pagePath: pathname,
          authenticated: !!user,
          history: previous.slice(-8).map((message) => ({
            role: message.role,
            content: `${message.body}${message.professionals?.length ? `\nResultados mostrados: ${message.professionals.map((result, index) => `${index + 1}. ${result.name}`).join("; ")}` : ""}`,
            serviceId: message.serviceId ?? null,
          })),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.answer) throw new Error(payload?.error || "assistant_failed");
      const selectedIndex = Number(payload.selectedResultIndex);
      const selectedProfessional = Number.isInteger(selectedIndex) && selectedIndex > 0 ? latestResults[selectedIndex - 1] : null;
      setMessages((current) => [...current, {
        role: "assistant",
        body: payload.answer,
        action: payload.searchHref && payload.ctaLabel ? { href: payload.searchHref, label: payload.ctaLabel, kind: payload.action } : null,
        professionals: selectedProfessional ? [selectedProfessional] : Array.isArray(payload.professionals) ? payload.professionals : [],
        suggestedService: payload.suggestedService,
        provider: payload.aiProvider,
        serviceId: typeof payload.serviceId === "string" ? payload.serviceId : null,
        createdAt: new Date().toISOString(),
      }]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", body: copy.error, createdAt: new Date().toISOString() }]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }

  async function suggestService(messageIndex: number, name: string) {
    if (suggestingIndex != null) return;
    setSuggestingIndex(messageIndex);
    try {
      const response = await fetch("/api/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, locale }),
      });
      if (!response.ok) throw new Error("suggest_failed");
      setMessages((current) => current.map((message, index) => index === messageIndex ? { ...message, suggestionSent: true } : message));
    } catch {
      setMessages((current) => [...current, { role: "assistant", body: copy.error, createdAt: new Date().toISOString() }]);
    } finally {
      setSuggestingIndex(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask();
  }

  function navigate(href: string) {
    const protectedDestination = href.includes("/publicar-proyecto") || href.includes("/dashboard/");
    if (!user && protectedDestination) storePendingIntent(href);
    const destination = localizedDestination(href, lang);
    try {
      window.sessionStorage.setItem(`${SESSION_KEY_PREFIX}${lang}`, JSON.stringify({
        id: conversationId,
        open: embedded ? true : false,
        messages: messages.slice(-MAX_STORED_MESSAGES),
      } satisfies StoredAssistantSession));
    } catch {
      /* Navigation still works when browser storage is unavailable. */
    }
    window.location.assign(destination);
  }

  function resetConversation() {
    setConversationId(crypto.randomUUID());
    setMessages([{ role: "assistant", body: copy.intro, createdAt: new Date().toISOString() }]);
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const insideDashboard = pathname.startsWith("/dashboard/") || pathname.includes("/dashboard/");
  const nativeAssistantShell = nativeApp && compactViewport;
  if ((!embedded && !sessionHydrated) || pathname.startsWith("/admin")) return null;
  if (!embedded && !nativeApp) return null;
  if (!embedded && nativeAssistantShell && !open) return null;
  if (!embedded && !open) {
    return (
      <button
        data-ai-concierge-button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.closedLabel}
        className={cn(
          "group fixed right-3 z-[95] hidden h-14 w-14 place-items-center overflow-visible bg-transparent transition hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9] focus-visible:ring-offset-2 lg:grid sm:bottom-6 sm:right-6 sm:h-[72px] sm:w-[72px]",
          nativeAssistantShell
            ? "bottom-auto right-[-10px] top-[38svh] h-16 w-16 sm:bottom-auto sm:right-[-10px] sm:top-[38svh] sm:h-[72px] sm:w-[72px]"
            : insideDashboard
            ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] lg:bottom-6"
            : "bottom-[calc(0.85rem+env(safe-area-inset-bottom))]",
        )}
      >
        <div className="absolute inset-0 scale-[1.15] sm:scale-[1.2]">
          <div className="ai-concierge-float h-full w-full">
            <RobotMark />
          </div>
        </div>
      </button>
    );
  }

  return (
    <section
      data-ai-concierge-dialog
      role="dialog"
      aria-modal={embedded ? undefined : "true"}
      aria-label={copy.title}
      onMouseDown={(event) => {
        if (!embedded && event.target === event.currentTarget) setOpen(false);
      }}
      className={cn(
        embedded
          ? "fixed inset-x-0 top-0 z-[120] flex h-[var(--app-visual-viewport-height)] min-h-[360px] w-full items-stretch justify-stretch overflow-hidden lg:relative lg:z-auto lg:h-[min(780px,calc(100dvh-220px))] lg:min-h-[540px]"
          : "fixed inset-x-0 top-0 z-[100] flex h-[var(--app-visual-viewport-height)] items-end justify-end overflow-hidden bg-[#071426]/35 backdrop-blur-[5px] sm:pointer-events-none sm:inset-0 sm:h-auto sm:bg-transparent sm:p-0 sm:backdrop-blur-none",
      )}
    >
      <div
        data-ai-concierge-panel
        className={cn(
          "flex w-full flex-col overflow-hidden border border-[#d7e8f5] bg-white shadow-[0_35px_100px_-25px_rgba(4,37,77,0.75)]",
          embedded
            ? "h-full rounded-[28px] shadow-[0_18px_54px_-34px_rgba(4,37,77,0.6)] lg:rounded-2xl"
            : "max-h-full h-[min(820px,calc(var(--app-visual-viewport-height)_-_0.5rem))] rounded-t-[34px] sm:pointer-events-auto sm:fixed sm:bottom-6 sm:right-6 sm:h-[min(780px,calc(100dvh-3rem))] sm:w-[min(520px,calc(100vw-3rem))] sm:rounded-[34px]",
        )}
      >
        <header className="relative flex shrink-0 items-center gap-1.5 border-b border-[#e3ebf1] bg-white px-2.5 py-3 sm:gap-3 sm:px-5 sm:py-4">
          {(embedded || nativeAssistantShell) && (
            <button
              type="button"
              onClick={embedded ? onBack : () => setOpen(false)}
              aria-label={lang === "en" ? "Back" : "Atrás"}
              className="ccr-ai-back-action grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#102f5b] transition hover:bg-[#eef7ff] sm:h-10 sm:w-10"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="-my-2 -ml-1.5 h-[58px] w-[58px] shrink-0 sm:-my-3 sm:-ml-2 sm:h-[92px] sm:w-[92px]"><Image src="/brand/ai-assistant-robot.png" alt="" width={112} height={112} priority className="h-full w-full object-contain drop-shadow-[0_10px_16px_rgba(0,99,189,0.18)]" /></div>
          <div className="min-w-0 flex-1 py-1">
            <h2 className="truncate text-[14px] font-black text-[#102746] min-[380px]:text-[15px] sm:text-lg">{copy.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={resetConversation}
              aria-label={copy.reset}
              className="ccr-ai-reset-action grid h-9 w-9 place-items-center rounded-full border border-[#bcd8f1] bg-white text-[#102f5b] shadow-sm transition hover:bg-[#eef7ff] sm:h-11 sm:w-11"
            >
              <RotateCcw className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
            </button>
            {!embedded && !nativeAssistantShell && (
              <AppTooltip label={copy.minimize}>
                <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-full border border-[#bcd8f1] bg-white text-[#102f5b] shadow-sm transition hover:bg-[#eef7ff] sm:h-11 sm:w-11" aria-label={copy.minimize}><Minus className="h-5 w-5 sm:h-6 sm:w-6" /></button>
              </AppTooltip>
            )}
          </div>
        </header>

        <div ref={scrollRef} data-ai-concierge-messages className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-[linear-gradient(180deg,#fbfdff_0%,#ffffff_100%)] px-4 py-5 overscroll-contain sm:px-6">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={cn("flex items-end gap-2 sm:items-start sm:gap-3", message.role === "user" && "justify-end")}>
              {message.role === "assistant" && <div className="mb-5 h-9 w-9 shrink-0 overflow-hidden rounded-full border border-[#cce4f5] bg-white shadow-sm sm:mb-0 sm:mt-1 sm:h-11 sm:w-11"><Image src="/brand/ai-assistant-robot.png" alt="" width={56} height={56} className="h-full w-full scale-125 object-contain" /></div>}
              <div className={cn("min-w-0 max-w-[82%] space-y-2.5", message.role === "user" && "flex flex-col items-end")}>
                <div className={cn(
                  "whitespace-pre-line rounded-[22px] px-4 py-3.5 text-[15px] leading-relaxed shadow-[0_8px_24px_-18px_rgba(15,45,80,0.55)]",
                  message.role === "user"
                    ? "rounded-br-md bg-[linear-gradient(135deg,#176eea_0%,#0789f4_100%)] font-medium text-white"
                    : "rounded-bl-md border border-[#dbe7f0] bg-white text-[#173052]",
                )}>
                  {message.body}
                </div>

                {message.professionals?.map((result) => (
                  <ProfessionalResult key={result.id} result={result} copy={copy} onNavigate={navigate} />
                ))}

                {message.action && (
                  <button type="button" onClick={() => navigate(message.action!.href)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[#009FD9] bg-[#eef9fd] px-4 py-2.5 text-center text-sm font-extrabold text-[#008dbf] transition hover:bg-[#dff5fc] active:scale-[0.99]">
                    {message.action.label}{actionIcon(message.action.kind)}
                  </button>
                )}

                {message.suggestedService && (
                  <button
                    type="button"
                    disabled={message.suggestionSent || suggestingIndex === index}
                    onClick={() => void suggestService(index, message.suggestedService!)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#009FD9] px-3 text-xs font-extrabold text-white transition hover:bg-[#008fca] disabled:bg-[#dce8ed] disabled:text-[#718096]"
                  >
                    {suggestingIndex === index ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : message.suggestionSent ? <BadgeCheck className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {message.suggestionSent ? copy.suggested : suggestingIndex === index ? copy.suggesting : copy.suggest}
                  </button>
                )}
                <span className={cn("flex items-center gap-1 text-[11px] font-medium text-[#7b8da7]", message.role === "user" && "pr-1")}>
                  {messageTime(message.createdAt)}
                  {message.role === "user" && <CheckCheck className="h-4 w-4 text-[#087df0]" />}
                </span>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border border-[#cce4f5] bg-white shadow-sm"><Image src="/brand/ai-assistant-robot.png" alt="" width={56} height={56} className="h-full w-full scale-125 object-contain" /></div>
              <div className="inline-flex items-center gap-2 rounded-[22px] rounded-bl-md border border-[#dbe7f0] bg-white px-4 py-3 text-sm font-semibold text-[#607693] shadow-sm">
                <Loader2 className="h-4 w-4 animate-spin text-[#0b7fe8]" />{copy.thinking}
              </div>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-[#dfeaf2] bg-white px-4 pb-[calc(0.7rem+env(safe-area-inset-bottom))] pt-2.5 sm:px-6 sm:pb-4 sm:pt-3">
          <p className="ccr-ai-footer-notice mb-2 text-center text-[10px] font-semibold leading-snug text-[#7d8fa8] sm:hidden">{copy.notice}</p>
          <form onSubmit={submit} className="flex items-end gap-2 rounded-[24px] border-2 border-[#009FD9] bg-white p-2 pl-4 shadow-[0_10px_30px_-18px_rgba(0,159,217,0.48)] focus-within:ring-4 focus-within:ring-[#009FD9]/10">
            <input
              type="text"
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 1200))}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void ask();
                }
              }}
              placeholder={copy.placeholder}
              aria-label={copy.placeholder}
              className="h-11 min-w-0 flex-1 bg-transparent py-2.5 text-sm leading-6 text-[#173052] outline-none placeholder:text-[#7f91aa] sm:text-base"
            />
            <button type="submit" disabled={!input.trim() || loading} aria-label={copy.send} className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#009FD9] text-white shadow-[0_8px_18px_-8px_rgba(0,159,217,0.85)] transition hover:scale-[1.04] hover:bg-[#0089bb] active:scale-95 disabled:bg-[#d7e3e9] disabled:shadow-none">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </form>
          <p className="ccr-ai-footer-notice mt-3 hidden text-center text-[11px] font-medium leading-tight text-[#7d8fa8] sm:block">{copy.notice}</p>
        </footer>
      </div>
    </section>
  );
}
