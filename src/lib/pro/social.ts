import { z } from 'zod';
const url = z.string().url().refine(value => { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; }, 'Use un enlace HTTPS público.');
export const socialRequestSchema = z.object({
  id: z.string().min(1), month: z.string().regex(/^\d{4}-\d{2}$/),
  title: z.string().trim().min(1).max(160), link: url,
  description: z.string().trim().min(1).max(1500),
  status: z.enum(['pending', 'approved', 'rejected', 'published']),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  note: z.string().max(1000), publishedUrl: z.union([z.literal(''), url]),
});
export type SocialRequest = z.infer<typeof socialRequestSchema>;
export const socialLabels = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', published: 'Publicada' };
export function socialMonth(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}`;
}
export function requestSocial(rows: SocialRequest[], input: Pick<SocialRequest, 'id' | 'title' | 'link' | 'description'>, now = new Date()) {
  const month = socialMonth(now);
  if (rows.some(r => r.id === input.id)) throw Error('La solicitud ya existe.');
  if (rows.some(r => r.month === month && r.status !== 'rejected')) throw Error('Ya tiene una difusión solicitada para este mes.');
  return [...rows, socialRequestSchema.parse({ ...input, month, status: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString(), note: '', publishedUrl: '' })];
}
export function reviewSocial(rows: SocialRequest[], id: string, status: 'approved' | 'rejected' | 'published', note: string, publishedUrl = '', now = new Date()) {
  const row = rows.find(r => r.id === id);
  if (!row || !(row.status === 'pending' && (status === 'approved' || status === 'rejected') || row.status === 'approved' && status === 'published')) throw Error('Ese cambio de estado no está permitido.');
  if (status === 'rejected' && !note.trim()) throw Error('Indique el motivo del rechazo.');
  if (status === 'published' && !publishedUrl) throw Error('Indique el enlace de la publicación realizada.');
  const next = socialRequestSchema.parse({ ...row, status, note: note.trim(), publishedUrl, updatedAt: now.toISOString() });
  return rows.map(r => r.id === id ? next : r);
}
