import { readOptionalConsent } from "@/lib/privacy/optional-consent";
import type { MetaConversion } from "./growth-contract";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { esNavegadorAutomatizado } from "@/lib/analytics/trafico-automatizado";
type MetaPixelCommand = "init" | "track" | "trackCustom";

type MetaPixelFunction = {
  (command: "init", pixelId: string): void;
  (command: "consent", action: "grant" | "revoke"): void;
  (command: "track" | "trackCustom", eventName: string, params?: Record<string, unknown>, options?: { eventID: string }): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: MetaPixelFunction;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

// EVENTOS QUE LLEGAN ANTES QUE EL PÍXEL (7-oct-2026).
// El píxel carga tarde a propósito (ver components/analytics/meta-pixel.tsx) y
// antes de eso `window.fbq` no existe: cada evento se descartaba sin aviso. Así
// se perdían las búsquedas de los primeros segundos y, sobre todo, el registro
// con Google, que cambia de página justo después: Meta llevaba 28 días sin ver
// un solo registro de cliente aunque la base tenía varios. Lo que llega antes de
// que el script de Meta esté listo se guarda en la pestaña y se manda en cuanto
// lo esté, también si eso ocurre ya en la página siguiente.
const PENDIENTES_KEY = "contratacr:meta-pendientes";
const VIGENCIA_PENDIENTE_MS = 30 * 60 * 1000;

type Pendiente = { c: "track" | "trackCustom"; n: string; p?: Record<string, unknown>; id?: string; t: number };

function scriptDeMetaListo(): boolean {
  // El cargador define `fbq` al instante, como una cola; `callMethod` solo
  // aparece cuando fbevents.js ya bajó y puede mandar de verdad.
  return typeof window.fbq === "function" && typeof window.fbq.callMethod === "function";
}

function leerPendientes(): Pendiente[] {
  try {
    const crudo = window.sessionStorage.getItem(PENDIENTES_KEY);
    const lista = crudo ? (JSON.parse(crudo) as Pendiente[]) : [];
    return Array.isArray(lista) ? lista.filter((x) => Date.now() - x.t < VIGENCIA_PENDIENTE_MS) : [];
  } catch {
    return [];
  }
}

function guardarPendiente(pendiente: Pendiente) {
  try {
    const lista = [...leerPendientes(), pendiente].slice(-20);
    window.sessionStorage.setItem(PENDIENTES_KEY, JSON.stringify(lista));
  } catch {
    // Sin almacenamiento (ventana privada estricta): el evento se pierde, como antes.
  }
}

export function hayEventosMetaPendientes(): boolean {
  if (typeof window === "undefined") return false;
  return leerPendientes().length > 0;
}

/** Manda lo que quedó en espera. Lo llama el componente del píxel cuando el script ya cargó. */
export function enviarEventosMetaPendientes() {
  if (typeof window === "undefined") return;
  if (!allowedMetaBrowser()) { try { window.sessionStorage.removeItem(PENDIENTES_KEY); } catch { /* no storage */ } return; }
  if (!scriptDeMetaListo()) return;
  const lista = leerPendientes();
  try { window.sessionStorage.removeItem(PENDIENTES_KEY); } catch { /* ignore */ }
  for (const x of lista) window.fbq!(x.c, x.n, x.p, x.id ? { eventID: x.id } : undefined);
}

function enviar(command: "track" | "trackCustom", eventName: string, params?: Record<string, unknown>, eventId?: string) {
  if (typeof window === "undefined" || !allowedMetaBrowser()) return;
  if (esNavegadorAutomatizado() || !allowedMetaBrowser()) return;
  if (scriptDeMetaListo()) {
    window.fbq!(command, eventName, params, eventId ? { eventID: eventId } : undefined);
    return;
  }
  guardarPendiente({ c: command, n: eventName, p: params, id: eventId, t: Date.now() });
}

export function trackMetaEvent(eventName: string, params?: Record<string, unknown>) {
  enviar("track", eventName, params);
}

export function trackMetaPageView() {
  // La visita va directo a la cola del cargador (ya existe cuando esto corre):
  // guardada para la página siguiente quedaría con la dirección equivocada.
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  if (esNavegadorAutomatizado() || !allowedMetaBrowser()) return;
  window.fbq("track", "PageView");
}

export type { MetaPixelCommand };

function allowedMetaBrowser(): boolean {
  if (typeof window === "undefined" || esNavegadorAutomatizado() || isNativeAppRuntime() || !["contratacr.com","www.contratacr.com"].includes(window.location.hostname)) return false;
  try { return readOptionalConsent("advertising") === "accepted"; } catch { return false; }
}
export function trackMetaConversion(conversion: MetaConversion | null | undefined) {
  if (!conversion || !allowedMetaBrowser()) return;
  try {
    const key = `ccr:meta-delivered:${conversion.eventId}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key,"1");
  } catch { /* server receipt remains authoritative */ }
  const command = ["Contact","Lead"].includes(conversion.eventName) ? "track" : "trackCustom";
  enviar(command,conversion.eventName,conversion.params,conversion.eventId);
}
