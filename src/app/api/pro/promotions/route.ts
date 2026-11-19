import { z } from 'zod';
import { proApiAccess, proDbFailure } from '@/lib/pro/api-access';
import { promotionRecord, promotionType } from '@/lib/pro/promotion-records';
import { ownedPromotionContent } from '@/lib/pro/promotion-content-server';
export async function GET(req: Request) {
    const a = await proApiAccess(req);
    if (a.error)
        return a.error;
    try {
        const q = new URL(req.url).searchParams, type = promotionType.parse(q.get('type')), id = z.string().uuid().parse(q.get('contentId')), page = z.coerce.number().int().min(0).max(100000).parse(q.get('page') || 0);
        if (!await ownedPromotionContent(a.db, a.user.id, type, id))
            return new Response(null, { status: 404 });
        const { data, error, count } = await a.db.from('pro_audit').select('id,detail', { count: 'exact' }).eq('subject', a.user.id).eq('action', 'publication_promotion').contains('detail', { contentType: type, contentId: id }).order('id', { ascending: false }).range(page * 20, page * 20 + 19);
        if (error)
            return proDbFailure(error);
        return Response.json({ records: (data || []).map(promotionRecord), total: count || 0 }, { headers: { 'Cache-Control': 'no-store' } });
    }
    catch {
        return Response.json({ error: 'No se pudo consultar la difusión' }, { status: 400 });
    }
}
