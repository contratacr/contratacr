// Notification text is deliberately independent of customer-provided content.
export const appointmentNotificationActions = [
  'requested', 'proposed', 'confirmed', 'declined', 'cancelled', 'completed',
  'reschedule_proposed', 'reschedule_accepted', 'reschedule_declined', 'reschedule_withdrawn',
] as const;
type Action = typeof appointmentNotificationActions[number];
export function isAppointmentNotification(type: string) {
  return type === 'pro_appointment_provider' || type === 'pro_appointment_client';
}
export function appointmentNotificationData(data: unknown): {request_id: string; action: Action} | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.version !== 1 || typeof value.request_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.request_id)
    || !appointmentNotificationActions.includes(value.action as Action)) return null;
  return {request_id: value.request_id, action: value.action as Action};
}
const copy: Record<Action, {es: [string, string]; en: [string, string]}> = {
  requested: {es: ['Nueva solicitud de cita', 'Revise la solicitud y el horario.'], en: ['New appointment request', 'Review the request and appointment time.']},
  proposed: {es: ['Horario de cita propuesto', 'Revise el horario para confirmar la cita.'], en: ['Appointment time proposed', 'Review the time to confirm the appointment.']},
  confirmed: {es: ['Cita confirmada', 'Consulte la fecha y hora de la cita.'], en: ['Appointment confirmed', 'Check the appointment date and time.']},
  declined: {es: ['Solicitud de cita no aceptada', 'Consulte los detalles de la solicitud.'], en: ['Appointment request declined', 'View the request details.']},
  cancelled: {es: ['Cita cancelada', 'Consulte los detalles en Citas.'], en: ['Appointment cancelled', 'View the details in Appointments.']},
  completed: {es: ['Cita finalizada', 'Consulte el resumen de la cita.'], en: ['Appointment completed', 'View the appointment summary.']},
  reschedule_proposed: {es: ['Propuesta para cambiar la cita', 'El horario actual sigue confirmado hasta que se acepte el cambio.'], en: ['Appointment change proposed', 'The current time remains confirmed until the change is accepted.']},
  reschedule_accepted: {es: ['Horario de cita actualizado', 'Consulte la nueva fecha y hora.'], en: ['Appointment time updated', 'Check the new date and time.']},
  reschedule_declined: {es: ['Cambio de cita no aceptado', 'El cambio propuesto no se aplicó. Consulte el estado de la cita.'], en: ['Appointment change declined', 'The proposed change was not applied. Check the appointment status.']},
  reschedule_withdrawn: {es: ['Propuesta de cambio retirada', 'El cambio propuesto no se aplicó. Consulte el estado de la cita.'], en: ['Appointment change withdrawn', 'The proposed change was not applied. Check the appointment status.']},
};
export function appointmentNotificationCopy(data: unknown, locale: string) {
  const parsed = appointmentNotificationData(data);
  const en = locale === 'en';
  const [title, message] = parsed ? copy[parsed.action][en ? 'en' : 'es']
    : en ? ['Appointment update', 'Open Appointments to review the current details.']
      : ['Actualización de cita', 'Abra Citas para revisar los detalles actuales.'];
  return {title, message};
}
