import { z } from 'zod';
import { crTodayISO } from '@/lib/time-cr';
export const promotionType = z.enum(['profile', 'project', 'offer', 'job']);
export const promotionChannel = z.enum(['instagram', 'facebook', 'tiktok']);
export const promotionInput = z.object({ requestId: z.string().uuid(), userId: z.string().uuid(), contentType: promotionType, contentId: z.string().uuid(), channel: promotionChannel, occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v && v <= crTodayISO()), paid: z.boolean(), publishedUrl: z.string().url() }).superRefine((v, ctx) => { const u = new URL(v.publishedUrl), root = { instagram: 'instagram.com', facebook: 'facebook.com', tiktok: 'tiktok.com' }[v.channel]; if (u.protocol !== 'https:' || u.username || u.password || !(u.hostname === root || u.hostname.endsWith('.' + root)))
    ctx.addIssue({ code: 'custom', path: ['publishedUrl'], message: 'El enlace debe pertenecer a la red elegida.' }); });
export type PromotionRecord = {
    id: number;
    contentType: z.infer<typeof promotionType>;
    contentId: string;
    title: string;
    channel: z.infer<typeof promotionChannel>;
    occurredOn: string;
    paid: boolean;
    publishedUrl: string;
};
export function promotionRecord(row: {
    id: number;
    detail: Record<string, unknown>;
}): PromotionRecord { return { id: row.id, contentType: row.detail.contentType as PromotionRecord['contentType'], contentId: String(row.detail.contentId), title: String(row.detail.title), channel: row.detail.channel as PromotionRecord['channel'], occurredOn: String(row.detail.occurredOn), paid: row.detail.paid === true, publishedUrl: String(row.detail.publishedUrl) }; }
