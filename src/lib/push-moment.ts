// El mejor momento para pedir permiso de notificaciones es justo después de
// que la persona hizo algo cuya respuesta le va a llegar por ahí: mandó un
// mensaje. Solo se ofrece lo que de verdad avisa: una cotización aceptada, una
// propuesta elegida o una postulación revisada NO mandan aviso, así que
// prometerlo era mentir (9-oct-2026). La ventana decide si toca preguntar
// (solo en la app, con límites de frecuencia).
export type MotivoDeAviso = "mensaje";

export const EVENTO_MOMENTO_AVISO = "ccr:notificaciones:momento";

export function avisarMomentoDeNotificacion(motivo: MotivoDeAviso) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ motivo: MotivoDeAviso }>(EVENTO_MOMENTO_AVISO, { detail: { motivo } }));
}
