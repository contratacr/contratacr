/**
 * RESERVAR CITAS ESTÁ APAGADO — EN UN SOLO LUGAR.
 *
 * El interruptor vivía dentro de `professional-schedule.tsx`, o sea dentro de
 * una pantalla. Eso apagó el botón pero dejó `POST /api/bookings` abierto: sin
 * sesión, respondía 400 por falta de datos, no 401. Cualquiera que supiera la
 * dirección podía seguir guardando cédulas, fechas de nacimiento y datos de un
 * beneficiario que puede ser menor de edad, para una función que ningún
 * usuario podía usar.
 *
 * Apagar una pantalla no apaga una función: la puerta es la API. Por eso el
 * interruptor sale de la pantalla y queda aquí, donde lo leen las dos.
 *
 * En toda la historia de producción hubo CERO citas. Nada se ha borrado
 * todavía: con poner esto en `true` vuelve entero.
 */
export const CITAS_ACTIVAS = false;
