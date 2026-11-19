export function isAppointmentReminder(type: string) {
  return type === 'pro_appointment_reminder_provider' || type === 'pro_appointment_reminder_client';
}

export function appointmentReminderData(data: unknown): { request_id: string; invalidated: boolean } | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const value = data as Record<string, unknown>;
  if (value.version !== 1 || value.action !== 'reminder_24h' || typeof value.invalidated !== 'boolean'
    || typeof value.request_id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.request_id)) return null;
  return { request_id: value.request_id, invalidated: value.invalidated };
}

export function appointmentReminderCopy(data: unknown, locale: string) {
  const parsed = appointmentReminderData(data);
  const en = locale === 'en';
  if (!parsed) return en
    ? { title: 'Appointment update', message: 'Open Appointments to review the current details.' }
    : { title: 'Actualización de cita', message: 'Abra Citas para revisar los detalles actuales.' };
  if (parsed.invalidated) return en
    ? { title: 'Previous appointment reminder', message: 'This appointment has changed. Check its current details.' }
    : { title: 'Recordatorio anterior de cita', message: 'Esta cita cambió. Consulte los detalles actuales.' };
  return en
    ? { title: 'Upcoming appointment', message: 'Check the date and time in Appointments.' }
    : { title: 'Tiene una cita próxima', message: 'Consulte la fecha y hora en Citas.' };
}
