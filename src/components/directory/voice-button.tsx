"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mic } from "lucide-react";

/**
 * Voice input of the search (Web Speech API). Rendered only where the browser has it; the server and the first client
 * render show nothing, so there is no hydration mismatch. Result text goes to onText; recognition errors are silent.
 */
type Recognition = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecognitionCtor = new () => Recognition;
const ctorOf = (): RecognitionCtor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};
const noSubscribe = () => () => {};
export const useVoiceSupport = () => useSyncExternalStore(noSubscribe, () => ctorOf() !== null, () => false);

export function VoiceButton({ lang, label, onText, className, autoStart }: { lang: string; label: string; onText: (text: string) => void; className?: string; autoStart?: boolean }) {
  const supported = useVoiceSupport();
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const start = () => {
    const Ctor = ctorOf();
    if (!Ctor) return;
    try {
      const r = new Ctor();
      r.lang = lang === "en" ? "en-US" : "es-CR";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => { const text = e.results[0]?.[0]?.transcript?.trim(); if (text) onText(text); };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      setListening(true);
      r.start();
    } catch { setListening(false); }
  };
  const started = useRef(false);
  useEffect(() => {
    if (autoStart && supported && !started.current) { started.current = true; start(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, supported]);
  useEffect(() => () => { try { rec.current?.stop(); } catch { /* already stopped */ } }, []);
  if (!supported) return null;
  return (
    <button type="button" data-voice-button aria-label={label} aria-pressed={listening} onClick={() => { if (listening) { try { rec.current?.stop(); } catch { /* ignore */ } } else start(); }}
      className={className ?? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#162543] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]"}>
      <Mic className={`h-5 w-5 ${listening ? "text-[#009FD9] animate-pulse" : ""}`} aria-hidden />
    </button>
  );
}
