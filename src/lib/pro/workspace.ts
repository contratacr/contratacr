/** Local Pro prototype. Never grants paid access or modifies public rankings. */
export type Stage = 'new' | 'quoting' | 'scheduled' | 'completed';
export type WorkItem = { id: string; client: string; service: string; stage: Stage; start: string; end: string };
export const FREE_CAPABILITIES = ['chat', 'whatsapp', 'phone', 'identity_verification'] as const;
export function validateWork(item: WorkItem, existing: WorkItem[]): string | null {
  if (!item.client.trim() || !item.service.trim()) return 'Indique cliente y servicio.';
  if (item.start || item.end || item.stage === 'scheduled') {
    const start = Date.parse(item.start), end = Date.parse(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 'Revise la fecha y hora de inicio y final.';
    if (item.stage === 'scheduled' && existing.some(other => other.id !== item.id && other.stage === 'scheduled' && start < Date.parse(other.end) && end > Date.parse(other.start))) return 'Ya tiene una cita en ese horario.';
  }
  return null;
}
/** CSV compatible with Excel; prevent spreadsheet formula execution. */
export function exportWork(items: WorkItem[]): string {
  const cell = (value: string) => '"' + (/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replace(/"/g, '""') + '"';
  return '\uFEFF' + [['Cliente','Servicio','Estado','Inicio','Final'], ...items.map(i => [i.client,i.service,i.stage,i.start,i.end])].map(row => row.map(cell).join(',')).join('\r\n');
}
