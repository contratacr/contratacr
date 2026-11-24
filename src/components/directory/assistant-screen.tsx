"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale } from "next-intl";
import { useRouter as useRouterDeNext, useSearchParams } from "next/navigation";
import { ArrowRight, ClipboardList, History, Loader2, Menu, Mic, SendHorizontal, SquarePen, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";
import { cn } from "@/lib/utils";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import {
  ASSISTANT_COPY,
  AssistantMessageBubble,
  localizedDestination,
  useAssistantChat,
  type ChatMessage,
} from "@/components/landing/ai-concierge";

// Pantalla "Asistente" del modo directorio: saludo, tarjetas de sugerencias, chips y caja de texto. Comparte el motor
// (useAssistantChat) con la ventana flotante. El asistente público es gratis: sin pantalla de inicio de sesión.

type Lang = "es" | "en";
type Conjunto = "mejores" | "ahora" | "finde";
type Sugerencia = { etiqueta: string; texto: string; tono: string };

const SUGERENCIAS: Record<Lang, Record<Conjunto, Sugerencia[]>> = {
  es: {
    mejores: [
      { etiqueta: "FUERA DEL MAPA", texto: "¿Joyas escondidas cerca?", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "AVENTURERO", texto: "Sorpréndame con algo cercano que no se me ocurriría buscar", tono: "from-[#1d6f5c] to-[#35b58f]" },
      { etiqueta: "LO MEJOR", texto: "¿Cuál es el mejor restaurante cerca de mí?", tono: "from-[#162543] to-[#3d5a86]" },
    ],
    ahora: [
      { etiqueta: "ABIERTO AHORA", texto: "¿Qué está abierto ahora cerca de mí?", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "URGENTE", texto: "Necesito un plomero hoy", tono: "from-[#162543] to-[#3d5a86]" },
      { etiqueta: "HOY", texto: "¿Qué promociones hay hoy?", tono: "from-[#7a4d1d] to-[#d9983f]" },
    ],
    finde: [
      { etiqueta: "EN FAMILIA", texto: "¿Qué plan hay para el sábado con niños?", tono: "from-[#1d6f5c] to-[#35b58f]" },
      { etiqueta: "AL AIRE LIBRE", texto: "Recomiéndeme un lugar al aire libre para el domingo", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "EN PAREJA", texto: "¿Dónde puedo cenar algo especial este fin de semana?", tono: "from-[#162543] to-[#3d5a86]" },
    ],
  },
  en: {
    mejores: [
      { etiqueta: "OFF THE MAP", texto: "Any hidden gems nearby?", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "ADVENTUROUS", texto: "Surprise me with something nearby I would not think to search for", tono: "from-[#1d6f5c] to-[#35b58f]" },
      { etiqueta: "THE BEST", texto: "What is the best restaurant near me?", tono: "from-[#162543] to-[#3d5a86]" },
    ],
    ahora: [
      { etiqueta: "OPEN NOW", texto: "What is open right now near me?", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "URGENT", texto: "I need a plumber today", tono: "from-[#162543] to-[#3d5a86]" },
      { etiqueta: "TODAY", texto: "What promotions are there today?", tono: "from-[#7a4d1d] to-[#d9983f]" },
    ],
    finde: [
      { etiqueta: "WITH KIDS", texto: "What is there to do on Saturday with kids?", tono: "from-[#1d6f5c] to-[#35b58f]" },
      { etiqueta: "OUTDOORS", texto: "Recommend an outdoor spot for Sunday", tono: "from-[#0b5f86] to-[#009FD9]" },
      { etiqueta: "DATE NIGHT", texto: "Where can I have a special dinner this weekend?", tono: "from-[#162543] to-[#3d5a86]" },
    ],
  },
};

const T = {
  es: {
    titulo: "Asistente",
    historial: "Historial de conversaciones",
    nueva: "Nueva conversación",
    cerrar: "Cerrar",
    saludo: (n: string) => `¿Qué se le antoja, ${n}?`,
    saludoAnonimo: "¿En qué le puedo ayudar?",
    placeholder: "Pregunte lo que quiera...",
    voz: "Dictar con el micrófono",
    enviar: "Enviar mensaje",
    chips: { mejores: "Mejores opciones", ahora: "Ahora mismo", finde: "Planes de fin de semana" } as Record<Conjunto, string>,
    sinHistorial: "Todavía no hay conversaciones guardadas.",
    borrar: "Borrar conversación",
    cotizar: "Solicitar cotización",
    cotizarAyuda: "El asistente le conectará con profesionales locales.",
    sinTitulo: "Conversación",
  },
  en: {
    titulo: "Assistant",
    historial: "Conversation history",
    nueva: "New conversation",
    cerrar: "Close",
    saludo: (n: string) => `What are you in the mood for, ${n}?`,
    saludoAnonimo: "How can I help?",
    placeholder: "Ask anything...",
    voz: "Dictate with the microphone",
    enviar: "Send message",
    chips: { mejores: "Best bets", ahora: "Right now", finde: "Weekend plans" } as Record<Conjunto, string>,
    sinHistorial: "No saved conversations yet.",
    borrar: "Delete conversation",
    cotizar: "Request a quote",
    cotizarAyuda: "The assistant will connect you with local professionals.",
    sinTitulo: "Conversation",
  },
} as const;

type Guardada = { id: string; titulo: string; actualizada: number; mensajes: ChatMessage[] };
const HIST_KEY = "ccr:asistente:conversaciones:v1";
const MAX_CONVERSACIONES = 20;

function leerHistorial(): Guardada[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(HIST_KEY) || "[]");
    return Array.isArray(v) ? (v as Guardada[]).filter((c) => c && typeof c.id === "string" && Array.isArray(c.mensajes)) : [];
  } catch {
    return [];
  }
}
function escribirHistorial(v: Guardada[]) {
  try { window.localStorage.setItem(HIST_KEY, JSON.stringify(v.slice(0, MAX_CONVERSACIONES))); } catch { /* sin almacenamiento */ }
}

type ReconocimientoVoz = { lang: string; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start: () => void; stop: () => void };

export function AssistantScreen() {
  return <Suspense fallback={null}><AssistantScreenContent /></Suspense>;
}

function AssistantScreenContent() {
  const lang: Lang = useLocale() === "en" ? "en" : "es";
  const t = T[lang];
  const copy = ASSISTANT_COPY[lang];
  const router = useRouterDeNext();
  const params = useSearchParams();
  const { user } = useAuth();
  const nativeApp = useNativeApp();
  const chat = useAssistantChat();
  const { loading, messages, setMessages, conversationId, setConversationId, suggestingIndex, ask, suggestService, resetConversation } = chat;
  const [conjunto, setConjunto] = useState<Conjunto>("mejores");
  const [borrador, setBorrador] = useState("");
  const [historial, setHistorial] = useState<Guardada[]>([]);
  const [panel, setPanel] = useState(false);
  const [escuchando, setEscuchando] = useState(false);
  const [vozDisponible, setVozDisponible] = useState(false);
  const [categoriaServicio] = useState(() => params.get("cat") || "");
  const [vieneDeServicios] = useState(() => !!params.get("q"));
  const scrollRef = useRef<HTMLDivElement>(null);
  const enviado = useRef(false);
  const voz = useRef<ReconocimientoVoz | null>(null);

  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const nombre = String(meta.full_name ?? meta.name ?? "").trim().split(/\s+/)[0] ?? "";

  // Arranque: identificador de conversación, historial local y, si viene de la búsqueda de servicios, envío automático.
  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    setConversationId(crypto.randomUUID());
    setHistorial(leerHistorial());
    setVozDisponible(typeof window !== "undefined" && !!((window as unknown as Record<string, unknown>).SpeechRecognition || (window as unknown as Record<string, unknown>).webkitSpeechRecognition));
    const q = params.get("q")?.trim();
    if (q) {
      // El texto ya se envió: se quita de la dirección para que recargar no lo repita.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("q");
        window.history.replaceState(null, "", url.pathname + url.search);
      } catch { /* sin historial del navegador */ }
      void ask(q.slice(0, 240));
    }
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda la conversación en el historial local cada vez que cambia.
  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const titulo = (messages.find((m) => m.role === "user")?.body ?? t.sinTitulo).slice(0, 60);
    setHistorial((actual) => {
      const resto = actual.filter((c) => c.id !== conversationId);
      const siguiente = [{ id: conversationId, titulo, actualizada: Date.now(), mensajes: messages.slice(-30) }, ...resto].slice(0, MAX_CONVERSACIONES);
      escribirHistorial(siguiente);
      return siguiente;
    });
  }, [messages, conversationId, t.sinTitulo]);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading]);

  const enviar = useCallback((texto: string) => {
    const limpio = texto.trim();
    if (!limpio || loading) return;
    setBorrador("");
    void ask(limpio);
  }, [ask, loading]);

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    enviar(borrador);
  }

  function navegar(href: string) {
    const destino = localizedDestination(href, lang);
    if (/^https?:\/\//.test(destino)) { window.location.assign(destino); return; }
    router.push(destino);
  }

  function cerrar() {
    if (window.history.length > 1) router.back();
    else router.push(rutaConIdioma(lang, ""));
  }

  function dictar() {
    if (escuchando) { voz.current?.stop(); return; }
    const w = window as unknown as Record<string, unknown>;
    const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => ReconocimientoVoz) | undefined;
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = lang === "en" ? "en-US" : "es-CR";
      r.interimResults = false;
      r.onresult = (e) => {
        const texto = Array.from(e.results).map((x) => x[0]?.transcript ?? "").join(" ").trim();
        if (texto) setBorrador((b) => `${b} ${texto}`.trim().slice(0, 240));
      };
      r.onend = () => setEscuchando(false);
      voz.current = r;
      setEscuchando(true);
      r.start();
    } catch { setEscuchando(false); }
  }

  function nuevaConversacion() {
    resetConversation();
    setPanel(false);
  }
  function abrirConversacion(c: Guardada) {
    setConversationId(c.id);
    setMessages(c.mensajes);
    setPanel(false);
  }
  function borrarConversacion(id: string) {
    const siguiente = leerHistorial().filter((c) => c.id !== id);
    escribirHistorial(siguiente);
    setHistorial(siguiente);
    if (id === conversationId) resetConversation();
  }

  const ultimoEsAsistente = messages.length > 0 && messages[messages.length - 1].role === "assistant" && !loading;
  const mostrarCotizar = vieneDeServicios && ultimoEsAsistente && !messages.some((m) => m.action?.kind === "publish_request");
  const hrefCotizar = `/publicar-solicitud${categoriaServicio ? `?categoria=${encodeURIComponent(categoriaServicio)}` : ""}`;
  const sugerencias = SUGERENCIAS[lang][conjunto];
  const vacio = messages.length === 0 && !loading;

  return (
    <div data-assistant-screen className="fixed inset-0 z-[70] flex flex-col bg-white text-[#162543] lg:static lg:mx-auto lg:h-dvh lg:max-w-[720px] lg:border-x lg:border-[#e8eef3]">
      <header className="relative flex min-h-14 shrink-0 items-center justify-between border-b border-[#e8eef3] bg-white px-2">
        <button type="button" onClick={() => setPanel(true)} aria-label={t.historial} data-assistant-history
          className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eef7fb] active:scale-95"><Menu className="h-6 w-6" /></button>
        <h1 className="text-[18px] font-extrabold">{t.titulo}</h1>
        <div className="flex items-center">
          <button type="button" onClick={nuevaConversacion} aria-label={t.nueva} data-assistant-new
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eef7fb] active:scale-95"><SquarePen className="h-[22px] w-[22px]" /></button>
          <button type="button" onClick={cerrar} aria-label={t.cerrar} data-assistant-close
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eef7fb] active:scale-95"><X className="h-6 w-6" /></button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-assistant-thread>
        {vacio ? (
          <div className="flex min-h-full flex-col justify-center pb-4 pt-6">
            <div className="flex flex-col items-center px-6 text-center">
              <div className="h-20 w-20"><Image unoptimized loading="eager" src="/brand/ai-assistant-robot.webp" alt="" width={96} height={96} className="h-full w-full object-contain" /></div>
              <h2 className="mt-2 text-[26px] font-extrabold leading-8" data-assistant-greeting>{nombre ? t.saludo(nombre) : t.saludoAnonimo}</h2>
            </div>
            <ul className="mt-6 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-assistant-cards>
              {sugerencias.map((s) => (
                <li key={s.etiqueta} className="snap-start">
                  <button type="button" onClick={() => enviar(s.texto)} disabled={loading}
                    className={cn("relative flex h-[168px] w-[220px] flex-col justify-between rounded-2xl bg-gradient-to-br p-4 text-left text-white transition active:scale-[0.98]", s.tono)}>
                    <span>
                      <span className="block text-[12px] font-extrabold tracking-wider opacity-90">{s.etiqueta}</span>
                      <span className="mt-1.5 block text-[16px] font-bold leading-snug">{s.texto}</span>
                    </span>
                    <span className="grid h-9 w-9 place-items-center self-end rounded-full bg-white/95 text-[#162543]"><ArrowRight className="h-5 w-5" /></span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" data-assistant-chips>
              {(Object.keys(t.chips) as Conjunto[]).map((k) => (
                <button key={k} type="button" role="tab" aria-selected={conjunto === k} onClick={() => setConjunto(k)}
                  className={cn("min-h-10 shrink-0 rounded-full border px-4 text-[14px] font-bold transition",
                    conjunto === k ? "border-[#162543] bg-[#162543] text-white" : "border-[#d5dfe7] bg-white text-[#162543] hover:bg-[#f3f8fb]")}>
                  {t.chips[k]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5 px-4 py-5">
            {messages.map((m, i) => (
              <AssistantMessageBubble key={`${m.role}-${i}`} message={m} index={i} copy={copy} lang={lang} nativeApp={nativeApp}
                suggestingIndex={suggestingIndex} onNavigate={navegar} onSuggest={suggestService} />
            ))}
            {mostrarCotizar && (
              <div className="ml-11 max-w-[82%]">
                <button type="button" data-assistant-quote onClick={() => navegar(hrefCotizar)}
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#009FD9] px-4 text-sm font-extrabold text-white hover:bg-[#008fca] active:scale-[0.99]">
                  <ClipboardList className="h-4 w-4" />{t.cotizar}
                </button>
                <p className="mt-1.5 text-xs text-[#5b6b80]">{t.cotizarAyuda}</p>
              </div>
            )}
            {loading && (
              <div className="inline-flex items-center gap-2 rounded-[22px] rounded-bl-md border border-[#dbe7f0] bg-white px-4 py-3 text-sm font-semibold text-[#607693]">
                <Loader2 className="h-4 w-4 animate-spin text-[#009FD9]" />{copy.thinking}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={alEnviar} className="shrink-0 border-t border-[#e8eef3] bg-white px-4 pb-[calc(6.25rem+env(safe-area-inset-bottom))] pt-3 lg:pb-3" data-assistant-form>
        <div className="flex items-center gap-1 rounded-full border-2 border-[#cfdbe4] bg-white pl-4 pr-1.5 focus-within:border-[#009FD9]">
          <input value={borrador} onChange={(e) => setBorrador(e.target.value.slice(0, 240))} placeholder={t.placeholder} aria-label={t.placeholder}
            className="h-12 min-w-0 flex-1 bg-transparent text-[16px] font-medium outline-none placeholder:text-[#7b8da7]" />
          {vozDisponible && (
            <button type="button" onClick={dictar} aria-label={t.voz} aria-pressed={escuchando}
              className={cn("grid h-10 w-10 place-items-center rounded-full", escuchando ? "bg-[#e8f6fc] text-[#007bab]" : "text-[#41536b] hover:bg-[#eef7fb]")}><Mic className="h-5 w-5" /></button>
          )}
          <button type="submit" disabled={loading || !borrador.trim()} aria-label={t.enviar}
            className="grid h-10 w-10 place-items-center rounded-full bg-[#d8e4e9] text-white transition enabled:bg-[#009FD9] enabled:hover:bg-[#008fca]">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
          </button>
        </div>
      </form>

      {panel && (
        <div className="absolute inset-0 z-10 flex" role="dialog" aria-modal="true" aria-label={t.historial}>
          <div className="flex h-full w-[min(86vw,22rem)] flex-col bg-white shadow-2xl" data-assistant-panel>
            <div className="flex min-h-14 items-center justify-between border-b border-[#e8eef3] pl-4 pr-2">
              <span className="flex items-center gap-2 text-[17px] font-extrabold"><History className="h-5 w-5" />{t.historial}</span>
              <button type="button" onClick={() => setPanel(false)} aria-label={t.cerrar} className="grid h-11 w-11 place-items-center rounded-full hover:bg-[#eef7fb]"><X className="h-5 w-5" /></button>
            </div>
            <button type="button" onClick={nuevaConversacion} className="mx-3 mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#009FD9] px-4 text-[15px] font-bold text-white"><SquarePen className="h-4 w-4" />{t.nueva}</button>
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {historial.length === 0 && <li className="px-3 py-4 text-sm text-[#5b6b80]">{t.sinHistorial}</li>}
              {historial.map((c) => (
                <li key={c.id} className="flex items-center rounded-xl hover:bg-[#f3f8fb]">
                  <button type="button" onClick={() => abrirConversacion(c)} className="min-h-12 min-w-0 flex-1 truncate px-3 text-left text-[15px] font-semibold">{c.titulo}</button>
                  <button type="button" onClick={() => borrarConversacion(c.id)} aria-label={t.borrar} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[#7b8da7] hover:bg-[#eef7fb]"><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          </div>
          <button type="button" aria-label={t.cerrar} onClick={() => setPanel(false)} className="flex-1 bg-[#071426]/40" />
        </div>
      )}
    </div>
  );
}
