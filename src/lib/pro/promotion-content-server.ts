import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { promotionType } from './promotion-records';
export async function promotionContent(db: SupabaseClient, userId: string, type: z.infer<typeof promotionType>, page = 0) {
    const { data: professional, error } = await db.from('professionals').select('id,slug,business_name').eq('profile_id', userId).maybeSingle();
    if (error)
        throw error;
    if (type === 'profile')
        return { content: professional ? [{ id: professional.id, title: professional.business_name || 'Perfil profesional', link: `https://contratacr.com/profesionales/${professional.slug}` }] : [], total: professional ? 1 : 0 };
    if (type !== 'project' && !professional)
        return { content: [], total: 0 };
    const config = { project: { table: 'projects', key: 'client_id', owner: userId, path: 'proyectos' }, offer: { table: 'professional_offers', key: 'professional_id', owner: professional?.id, path: 'promociones' }, job: { table: 'job_posts', key: 'employer_id', owner: professional?.id, path: 'empleos' } }[type];
    const { data, error: e, count } = await db.from(config.table).select('id,title', { count: 'exact' }).eq(config.key, config.owner).order('created_at', { ascending: false }).order('id').range(page * 20, page * 20 + 19);
    if (e)
        throw e;
    return { content: (data || []).map(r => ({ id: r.id, title: r.title, link: `https://contratacr.com/${config.path}/${r.id}` })), total: count || 0 };
}
export async function ownedPromotionContent(db: SupabaseClient, userId: string, type: z.infer<typeof promotionType>, id: string) {
    const { data: p, error } = await db.from('professionals').select('id,business_name').eq('profile_id', userId).maybeSingle();
    if (error)
        throw error;
    if (type === 'profile')
        return p?.id === id ? { title: p.business_name || 'Perfil profesional' } : null;
    if (type !== 'project' && !p)
        return null;
    const config = { project: { table: 'projects', key: 'client_id', owner: userId }, offer: { table: 'professional_offers', key: 'professional_id', owner: p?.id }, job: { table: 'job_posts', key: 'employer_id', owner: p?.id } }[type];
    const { data, error: e } = await db.from(config.table).select('title').eq('id', id).eq(config.key, config.owner).maybeSingle();
    if (e)
        throw e;
    return data;
}
