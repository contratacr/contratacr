// El mejor momento para pedir permiso de notificaciones es justo después de
// que la persona hizo algo cuya respuesta le va a llegar por ahí: mandó un
// mensaje, pidió una cita, envió una propuesta, se postuló o cotizó. Las
// pantallas que completan esas acciones avisan aquí; la ventana decide si
// toca preguntar (solo en la app, con límites de frecuencia).
export type MotivoDeAviso = "mensaje" | "cita" | "propuesta" | "postulacion" | "cotizacion";

export const EVENTO_MOMENTO_AVISO = "ccr:notificaciones:momento";

export function avisarMomentoDeNotificacion(motivo: MotivoDeAviso) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<{ motivo: MotivoDeAviso }>(EVENTO_MOMENTO_AVISO, { detail: { motivo } }));
}
