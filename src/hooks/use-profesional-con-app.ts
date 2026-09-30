"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "@/hooks/use-auth";

// ¿El profesional tiene la app? Decide si el botón de contacto en la app es
// «Mensaje» (el chat) o «WhatsApp». Una búsqueda pinta muchas tarjetas: las
// preguntas del mismo instante se juntan en UNA petición, y la respuesta queda
// en memoria (y en la sesión) para las pantallas siguientes.
//
// Mientras no se sepa, la respuesta es «no»: el botón nace WhatsApp —lo que es
// para casi todos al lanzar— y solo cambia si se confirma que el profesional
// tiene la app. Un esqueleto mientras cargaba la sesión hacía WhatsApp →
// esqueleto → WhatsApp en cada tarjeta.

const CLAVE = "ccr:profesional-con-app:v1";
const conocidos = new Map<string, boolean>();
let pendientes = new Set<string>();
// Ya pedidos alguna vez (en cola o en camino): no se vuelven a pedir.
const pedidos = new Set<string>();
let temporizador: number | null = null;
const oyentes = new Set<() => void>();

function leerSesion() {
  if (conocidos.size || typeof window === "undefined") return;
  try {
    const guardado = JSON.parse(window.sessionStorage.getItem(CLAVE) ?? "{}") as Record<string, boolean>;
    for (const [id, valor] of Object.entries(guardado)) conocidos.set(id, valor);
  } catch { /* sin almacenamiento: se pregunta al servidor */ }
}

function guardarSesion() {
  try { window.sessionStorage.setItem(CLAVE, JSON.stringify(Object.fromEntries(conocidos))); } catch { /* nada */ }
}

function resolver(id: string, valor: boolean) {
  conocidos.set(id, valor);
}

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => { oyentes.delete(avisar); };
}

async function preguntar() {
  temporizador = null;
  const ids = [...pendientes];
  pendientes = new Set();
  for (let i = 0; i < ids.length; i += 60) {
    const lote = ids.slice(i, i + 60);
    try {
      const res = await fetch(`/api/direct-chat?conApp=${lote.join(",")}`, { cache: "no-store" });
      const json = res.ok ? await res.json() as { conApp?: Record<string, boolean> } : {};
      // Ante la duda, WhatsApp: siempre llega a alguien.
      for (const id of lote) resolver(id, Boolean(json.conApp?.[id]));
    } catch {
      for (const id of lote) resolver(id, false);
    }
  }
  guardarSesion();
  oyentes.forEach((avisar) => avisar());
}

/** `true` solo cuando se confirmó que tiene la app; sin sesión no se pregunta. */
export function useProfesionalConApp(professionalId: string | undefined, activo: boolean) {
  const { user } = useAuth();
  const consultar = Boolean(activo && user && professionalId);

  useEffect(() => {
    if (!consultar || !professionalId) return;
    leerSesion();
    if (conocidos.has(professionalId) || pedidos.has(professionalId)) return;
    pedidos.add(professionalId);
    pendientes.add(professionalId);
    if (temporizador === null) temporizador = window.setTimeout(() => { void preguntar(); }, 30);
  }, [consultar, professionalId]);

  // El servidor no sabe nada de esto: al hidratar se pinta lo mismo que él
  // («no») y la memoria de la sesión entra en el pintado siguiente.
  return useSyncExternalStore(
    suscribir,
    () => {
      if (!consultar || !professionalId) return false;
      leerSesion();
      return conocidos.get(professionalId) === true;
    },
    () => false,
  );
}
