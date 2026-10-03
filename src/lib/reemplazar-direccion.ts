/**
 * REESCRIBIR LA DIRECCIÓN SIN RECARGAR, solo si de verdad cambia.
 *
 * Next escucha cada `history.replaceState` y sincroniza el router con esa
 * dirección; si en ese momento hay una navegación en camino (la persona acaba
 * de tocar Notificaciones en el menú de abajo), la cancela y la pantalla se
 * queda donde estaba. Los tableros reescribían la dirección al montarse —con
 * la misma que ya tenían— y un toque en esos 300 ms no abría nada.
 */
export function reemplazarDireccionSiCambia(url: string) {
  if (typeof window === "undefined") return;
  if (url === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
  window.history.replaceState(null, "", url);
}
