"use client";

import { useSyncExternalStore } from "react";
import type { Quote } from "@/lib/quotes";

/**
 * Las cotizaciones del usuario, una sola vez para toda la pantalla.
 *
 * Antes cada cita y cada proyecto pedía las suyas al abrirse: una consulta por
 * tarjeta, con su parpadeo de carga cada vez. Ahora se piden todas juntas la
 * primera vez y cada bloque saca las suyas de aquí, así que abrir una tarjeta
 * es inmediato.
 */
type Estado = { quotes: Quote[] | null; unavailable: boolean };

let estado: Estado = { quotes: null, unavailable: false };
let pedido: Promise<void> | null = null;
const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

function suscribir(alCambiar: () => void): () => void {
  oyentes.add(alCambiar);
  return () => oyentes.delete(alCambiar);
}

/** Pide la lista una sola vez; las demás llamadas se cuelgan de la misma. */
export function cargarCotizaciones(): void {
  if (pedido) return;
  pedido = fetch("/api/quotes")
    .then((r) => r.json())
    .then((d) => {
      estado = { quotes: Array.isArray(d.quotes) ? d.quotes : [], unavailable: Boolean(d.unavailable) };
      avisar();
    })
    .catch(() => {
      estado = { quotes: [], unavailable: false };
      avisar();
    });
}

export function agregarCotizacion(quote: Quote): void {
  estado = { ...estado, quotes: [quote, ...(estado.quotes ?? [])] };
  avisar();
}

export function actualizarCotizacion(quote: Quote): void {
  estado = { ...estado, quotes: (estado.quotes ?? []).map((q) => (q.id === quote.id ? { ...q, ...quote } : q)) };
  avisar();
}

export function useCotizaciones(): Estado {
  return useSyncExternalStore(suscribir, () => estado, () => estado);
}
