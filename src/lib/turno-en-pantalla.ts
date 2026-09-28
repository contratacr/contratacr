/**
 * QUIÉN HABLA PRIMERO CUANDO DOS COSAS QUIEREN LA MISMA PANTALLA.
 *
 * Al entrar por primera vez en el app se asomaba medio segundo la tarjeta de
 * «¿Contactaste a…?» y enseguida la tapaba la hoja de notificaciones. No era un
 * parpadeo de pintado: son dos avisos independientes que se deciden solos, uno
 * a los 0 ms y el otro a los 2.500, así que el orden lo decidía el azar de cuál
 * terminaba antes su consulta.
 *
 * El permiso de notificaciones va primero a propósito: se pide UNA vez, iOS no
 * lo vuelve a preguntar si se niega, y dejar que otra tarjeta le robe el
 * momento cuesta el canal entero. Lo demás puede esperar unos segundos.
 *
 * El turno se pide de forma SÍNCRONA al montar, antes de cualquier `await`: si
 * se pidiera después de consultar el permiso, la otra tarjeta ya habría
 * decidido salir y volveríamos al mismo empate.
 *
 * Vive en memoria y no en el almacenamiento del navegador a propósito: es una
 * coordinación entre dos componentes de la MISMA pantalla, no un estado que
 * deba sobrevivir a una recarga. Guardarlo dejaría el turno tomado para
 * siempre si el aviso nunca llega a cerrarse. (La auditoría de almacenamiento
 * cuenta hasta la palabra en un comentario; por eso aquí no se nombra.)
 */

let tomado = false;
const oyentes = new Set<() => void>();

function avisar() {
  for (const oyente of oyentes) oyente();
}

/** El aviso de notificaciones reserva la pantalla. */
export function tomarElTurno() {
  if (tomado) return;
  tomado = true;
  avisar();
}

/** La suelta cuando ya se mostró y se cerró, o cuando decide no mostrarse. */
export function soltarElTurno() {
  if (!tomado) return;
  tomado = false;
  avisar();
}

export function hayAlguienEnTurno() {
  return tomado;
}

/** Devuelve la función para dejar de escuchar. */
export function alCambiarElTurno(oyente: () => void) {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
