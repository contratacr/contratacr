"use client";

import { createContext, createElement, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export type InitialAvailability = { viewerId: string; values: Record<string, boolean>; resolvedAt: number };
const InitialAvailabilityContext = createContext<InitialAvailability | null>(null);
export function ContactAvailabilityProvider({ children, ...initial }: InitialAvailability & { children: ReactNode }) {
  return createElement(InitialAvailabilityContext.Provider, { value: initial }, children);
}

// A result owns one channel lookup. Its contact button consumes that resolved
// value instead of subscribing a second time or entering its own loading state.
const ResolvedContactContext = createContext<{ professionalId: string; value: boolean } | null>(null);
export function ResolvedContactAvailabilityProvider({ children, ...resolved }: { professionalId: string; value: boolean; children: ReactNode }) {
  return createElement(ResolvedContactContext.Provider, { value: resolved }, children);
}

// Viewer-scoped, short-lived reachability. Never persist network failures as
// WhatsApp for the entire session; a newly registered app must become reachable.
type Availability = { value: boolean; expiresAt: number; resolvedAt: number };
const conocidos = new Map<string, Availability>();
let pendientes = new Set<string>();
const pedidos = new Set<string>();
let temporizador: number | null = null;
const oyentes = new Set<() => void>();

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => { oyentes.delete(avisar); };
}
function encolar(id: string) {
  if (pedidos.has(id) || (conocidos.get(id)?.expiresAt ?? 0) > Date.now()) return;
  pedidos.add(id);
  pendientes.add(id);
  if (temporizador === null) temporizador = window.setTimeout(() => { void preguntar(); }, 30);
}
async function preguntar() {
  temporizador = null;
  const ids = [...pendientes];
  pendientes = new Set();
  for (let i = 0; i < ids.length; i += 60) {
    const lote = ids.slice(i, i + 60);
    const professionalIds = lote.map(key => key.slice(key.indexOf(":") + 1));
    try {
      const res = await fetch(`/api/direct-chat?conApp=${professionalIds.join(",")}`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
      if (!res.ok) throw new Error("availability-unavailable");
      const json = await res.json() as { conApp?: Record<string, boolean> };
      for (const id of lote) {
        const value = json.conApp?.[id.slice(id.indexOf(":") + 1)];
        if (typeof value !== "boolean") throw new Error("availability-missing");
        conocidos.set(id, { value, expiresAt: Date.now() + (value ? 60_000 : 15_000), resolvedAt: Date.now() });
      }
    } catch {
      for (const id of lote) {
        // Preserve a confirmed channel through a transient failure. Unknown
        // recipients can still use WhatsApp, with an automatic retry in 5s.
        conocidos.set(id, { value: conocidos.get(id)?.value ?? false, expiresAt: Date.now() + 5_000, resolvedAt: Date.now() });
      }
    } finally {
      lote.forEach(id => pedidos.delete(id));
    }
  }
  oyentes.forEach(avisar => avisar());
}

/** null pending, true shared chat, false WhatsApp; no anonymous lookup. */
export function useProfesionalConApp(professionalId: string | undefined, activo: boolean) {
  const { user, loading } = useAuth();
  const initial = useContext(InitialAvailabilityContext);
  const resolved = useContext(ResolvedContactContext);
  const inherited = activo && resolved && resolved.professionalId === professionalId ? resolved.value : undefined;
  const seed = initial && initial.viewerId === user?.id && professionalId ? initial.values[professionalId] : undefined;
  const seedResolvedAt = initial?.resolvedAt ?? 0;
  const seedExpiry = initial ? initial.resolvedAt + (seed ? 60_000 : 15_000) : 0;
  const consultar = Boolean(inherited === undefined && activo && user && professionalId);
  const cacheId = user && professionalId ? `${user.id}:${professionalId}` : "";
  useEffect(() => {
    if (!consultar || !cacheId) return;
    if (typeof seed === "boolean" && seedExpiry > Date.now() && (conocidos.get(cacheId)?.resolvedAt ?? 0) < seedResolvedAt) {
      conocidos.set(cacheId, { value: seed, expiresAt: seedExpiry, resolvedAt: seedResolvedAt });
    }
    const refresh = () => { if (document.visibilityState !== "hidden") encolar(cacheId); };
    refresh();
    const timer = window.setInterval(refresh, 5_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [consultar, cacheId, seed, seedExpiry, seedResolvedAt]);
  return useSyncExternalStore(
    suscribir,
    () => {
      if (!activo || !professionalId) return false;
      if (typeof inherited === "boolean") return inherited;
      if (loading) return null;
      if (!user) return false;
      const cached = conocidos.get(cacheId);
      return typeof seed === "boolean" && (cached?.resolvedAt ?? 0) < seedResolvedAt ? seed : cached?.value ?? null;
    },
    () => inherited ?? (!activo || !professionalId || (!loading && !user) ? false : seed ?? null),
  );
}
