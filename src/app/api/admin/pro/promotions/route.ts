import { z } from 'zod';
import { proApiAccess, proDbFailure } from '@/lib/pro/api-access';
import { promotionInput, promotionRecord, promotionType } from '@/lib/pro/promotion-records';
import { ownedPromotionContent, promotionContent } from '@/lib/pro/promotion-content-server';
export async function GET(req: Request) {
    const a = await proApiAccess(req, true);
    if (a.error)
        return a.error;
    try {
        const q = new URL(req.url).searchParams, userId = z.string().uuid().parse(q.get('userId')), type = promotionType.parse(q.get('type') || 'profile'), page = z.coerce.number().int().min(0).max(100000).parse(q.get('page') || 0);
        if (q.has('contentId')) {
            const id = z.string().uuid().parse(q.get('contentId'));
            if (!await ownedPromotionContent(a.db, userId, type, id))
                return new Response(null, { status: 404 });
            const { data, error, count } = await a.db.from('pro_audit').select('id,detail', { count: 'exact' }).eq('subject', userId).eq('action', 'publication_promotion').contains('detail', { contentType: type, contentId: id }).order('id', { ascending: false }).range(page * 20, page * 20 + 19);
            if (error)
                return proDbFailure(error);
            return Response.json({ records: (data || []).map(promotionRecord), total: count || 0 }, { headers: { 'Cache-Control': 'no-store' } });
        }
        return Response.json(await promotionContent(a.db, userId, type, page), { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'No se pudo consultar el contenido' }, { status: 400 });
    }
}
export async function POST(req: Request) {
    const a = await proApiAccess(req, true);
    if (a.error)
        return a.error;
    try {
        const b = promotionInput.parse(await req.json()), content = await ownedPromotionContent(a.db, b.userId, b.contentType, b.contentId);
        if (!content)
            return Response.json({ error: 'La publicación no pertenece a esa cuenta' }, { status: 400 });
        // An immutable admin audit record, not a queued social post or a monthly entitlement.
        const { data: old, error: readError } = await a.db.from('pro_audit').select('id,detail').eq('action', 'publication_promotion').contains('detail', { requestId: b.requestId }).maybeSingle();
        if (readError)
            return proDbFailure(readError);
        if (old) {
            if (!Object.entries({ ...b, title: content.title }).every(([key, value]) => old.detail[key] === value))
                return Response.json({ error: 'La solicitud cambió' }, { status: 409 });
            return Response.json({ record: promotionRecord(old) });
        }
        const { data, error } = await a.db.from('pro_audit').insert({ actor: a.user.id, subject: b.userId, action: 'publication_promotion', detail: { ...b, title: content.title } }).select('id,detail').single();
        if (error) {
            if (error.code === '23505') {
                const { data: existing } = await a.db.from('pro_audit').select('id,detail').eq('action', 'publication_promotion').contains('detail', { requestId: b.requestId }).single();
                if (existing && Object.entries({ ...b, title: content.title }).every(([key, value]) => existing.detail[key] === value))
                    return Response.json({ record: promotionRecord(existing) });
                return Response.json({ error: 'La solicitud cambió' }, { status: 409 });
            }
            return proDbFailure(error);
        }
        return Response.json({ record: promotionRecord(data) });
    }
    catch {
        return Response.json({ error: 'Revise cuenta, publicación, fecha y enlace de la red elegida' }, { status: 400 });
    }
}
