// Cuánto tiempo tiene el autor para editar o eliminar para todos un mensaje.
// Lo usan la API (que decide) y la pantalla (que solo esconde el botón).
const VENTANA_DE_EDICION_MS = 15 * 60 * 1000;

export function dentroDeLaVentanaDeEdicion(creadoEn: string, ahora = Date.now()) {
  return ahora - new Date(creadoEn).getTime() <= VENTANA_DE_EDICION_MS;
}
