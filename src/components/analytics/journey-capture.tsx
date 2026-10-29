"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { esNavegadorAutomatizado } from "@/lib/analytics/trafico-automatizado";
import { syncAnalyticsPlatform } from "@/lib/analytics/platform-client";
import { routeSection, buttonTarget, type JourneyAction } from "@/lib/analytics/journey-contract";
type Event = { id: string; action: JourneyAction; target: string; section: string; value?: number };
export function JourneyCapture() {
  const pathname = usePathname();
  const { user } = useAuth();
  useEffect(() => {
    if (esNavegadorAutomatizado() || routeSection(pathname) === "admin") return;
    let events: Event[] = [], sending = false, disposed = false;
    const section = routeSection(pathname);
    const emit = (action: JourneyAction, target: string, value?: number) => {
      if (events.length < 60) events.push({ id: crypto.randomUUID(), action, target, section, value });
    };
    const flush = async () => {
      if (sending || !events.length) return;
      sending = true;
      syncAnalyticsPlatform();
      try {
        while (events.length) {
          const batch = events.splice(0, 20);
          try {
            const response = await fetch("/api/analytics/journey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch }), credentials: "same-origin", keepalive: true });
            if (!response.ok && response.status >= 500) {
              if (!disposed) events = [...batch, ...events].slice(0, 60);
              break;
            }
          } catch {
            if (!disposed) events = [...batch, ...events].slice(0, 60);
            break;
          }
        }
      }
      finally { sending = false; }
    };
    const started = new Set<HTMLFormElement>(), submitted = new Set<HTMLFormElement>();
    const click = (event: MouseEvent) => {
      const el = event.target instanceof Element ? event.target.closest("a,button") : null;
      if (!el) return;
      if (el instanceof HTMLAnchorElement) {
        try { const url = new URL(el.href, location.origin); emit("navigation", url.origin === location.origin ? routeSection(url.pathname) : "navigation"); } catch { /* malformed href */ }
      } else emit("button", el.getAttribute("type") === "submit" ? "submit" : buttonTarget(el.getAttribute("aria-label") || el.textContent));
    };
    const focus = (event: FocusEvent) => {
      const form = event.target instanceof Element ? event.target.closest("form") : null;
      if (form && !started.has(form)) { started.add(form); emit("form_start", "form"); }
    };
    const submit = (event: SubmitEvent) => { if (event.target instanceof HTMLFormElement) { submitted.add(event.target); emit("form_submit", "form"); } };
    const invalid = () => emit("form_error", "form");
    const change = (event: globalThis.Event) => { if (event.target instanceof HTMLSelectElement || (event.target instanceof HTMLInputElement && ["checkbox","radio"].includes(event.target.type))) emit("filter", "filter"); };
    let depth = 0, lastScroll = 0;
    const scroll = (event: globalThis.Event) => {
      if (Date.now() - lastScroll < 300) return;
      lastScroll = Date.now();
      const el = event.target instanceof HTMLElement ? event.target : document.documentElement;
      const range = el.scrollHeight - el.clientHeight;
      if (range < 100) return;
      const next = Math.floor((el.scrollTop / range) * 4) * 25;
      if (next > depth) { depth = next; emit("scroll", "page", depth); }
    };
    // No error message, stack, keystrokes, input values, DOM text or attachment names.
    const error = () => emit("client_error", "page");
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("click", click);
    document.addEventListener("focusin", focus);
    document.addEventListener("submit", submit);
    document.addEventListener("invalid", invalid, true);
    document.addEventListener("change", change);
    document.addEventListener("scroll", scroll, true);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("error", error);
    window.addEventListener("pagehide", flush);
    const timer = window.setInterval(flush, 5000);
    return () => {
      for (const form of started) if (!submitted.has(form)) emit("form_abandon", "form");
      disposed = true; void flush(); clearInterval(timer);
      document.removeEventListener("click", click); document.removeEventListener("focusin", focus);
      document.removeEventListener("submit", submit); document.removeEventListener("invalid", invalid, true);
      document.removeEventListener("change", change); document.removeEventListener("scroll", scroll, true);
      document.removeEventListener("visibilitychange", hide); window.removeEventListener("error", error);
      window.removeEventListener("pagehide", flush);
    };
  }, [pathname, user?.id]);
  return null;
}
