// Historial de conversaciones de la pantalla «Asistente» (modo directorio). Los mensajes pueden traer datos personales,
// así que viven solo en esta pestaña (sessionStorage): no quedan en un equipo compartido al cerrarla y se borran al
// cerrar sesión (signOutToHome). Nada de esto se envía al servidor ni es la copia de la cuenta.
export const ASSISTANT_HISTORY_KEY = "ccr:asistente:conversaciones:v1";
const MAX_CONVERSACIONES = 20;

export type ConversacionGuardada<M> = { id: string; titulo: string; actualizada: number; mensajes: M[] };

export function leerHistorial<M>(): ConversacionGuardada<M>[] {
  // Copia que dejaban versiones anteriores en el almacenamiento permanente: se descarta (no se migra).
  try { window.localStorage.removeItem(ASSISTANT_HISTORY_KEY); } catch { /* sin almacenamiento */ }
  try {
    const v = JSON.parse(window.sessionStorage.getItem(ASSISTANT_HISTORY_KEY) || "[]");
    return Array.isArray(v) ? (v as ConversacionGuardada<M>[]).filter((c) => c && typeof c.id === "string" && Array.isArray(c.mensajes)) : [];
  } catch {
    return [];
  }
}

export function escribirHistorial<M>(v: ConversacionGuardada<M>[]) {
  try { window.sessionStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(v.slice(0, MAX_CONVERSACIONES))); } catch { /* sin almacenamiento */ }
}

/** Al cerrar sesión: la conversación de una cuenta no pasa a la siguiente persona en la misma pestaña. */
export function borrarHistorialAsistente() {
  try { window.sessionStorage.removeItem(ASSISTANT_HISTORY_KEY); } catch { /* sin almacenamiento */ }
}
