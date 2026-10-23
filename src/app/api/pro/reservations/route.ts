import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { safeGetUser } from '@/lib/supabase/get-user';
import { hasProAccess } from '@/lib/pro/access';
import { businessSchema, emptyBusiness } from '@/lib/pro/business';
import { openReservationSlots, reserveSlot } from '@/lib/pro/reservations';
const headers = { 'Cache-Control': 'no-store' };
// Deliberately unavailable outside local development; this is not a production launch.
async function provider(id: string) {
    const db = createAdminClient();
    const { data: p, error } = await db.from('professionals').select('id,profile_id,is_banned').eq('id', id).maybeSingle();
    if (error || !p || p.is_banned)
        return null;
    const [{ data: profile }, { data: grant }] = await Promise.all([db.from('profiles').select('role,is_disabled,is_provider').eq('id', p.profile_id).maybeSingle(), db.from('pro_memberships').select('status,expires_at').eq('user_id', p.profile_id).maybeSingle()]);
    return hasProAccess(profile, grant) ? { db, owner: p.profile_id } : null;
}
export async function GET(req: Request) {
    if (process.env.NODE_ENV !== 'development')
        return new Response(null, { status: 404 });
    const id = new URL(req.url).searchParams.get('professional');
    if (!id || !z.string().uuid().safeParse(id).success)
        return Response.json({ error: 'Profesional inválido' }, { status: 400, headers });
    try {
        const p = await provider(id);
        if (!p)
            return Response.json({ enabled: false, slots: [] }, { headers });
        const { data, error } = await p.db.from('pro_workspaces').select('document').eq('user_id', p.owner).maybeSingle();
        if (error)
            return Response.json({ error: 'No se pudo consultar la disponibilidad' }, { status: 503, headers });
        return Response.json({ enabled: true, slots: openReservationSlots(data ? businessSchema.parse(data.document) : emptyBusiness()) }, { headers });
    }
    catch {
        return Response.json({ error: 'No se pudo consultar la disponibilidad' }, { status: 503, headers });
    }
}
export async function POST(req: Request) {
    if (process.env.NODE_ENV !== 'development')
        return new Response(null, { status: 404 });
    const origin = `${new URL(req.url).protocol}//${req.headers.get('host') || new URL(req.url).host}`;
    if (req.headers.get('origin') !== origin)
        return new Response(null, { status: 403 });
    const user = await safeGetUser(await createClient());
    if (!user)
        return Response.json({ error: 'Inicie sesión para reservar' }, { status: 401 });
    try {
        const body = z.object({ professional: z.string().uuid(), start: z.string().datetime({ offset: true }), service: z.string().trim().min(1).max(160), requestId: z.string().uuid() }).parse(await req.json());
        const p = await provider(body.professional);
        if (!p || p.owner === user.id)
            return Response.json({ error: 'No se puede reservar con este perfil' }, { status: 403 });
        const { data: client, error: clientError } = await p.db.from('profiles').select('full_name,is_disabled').eq('id', user.id).maybeSingle();
        if (clientError || !client || client.is_disabled)
            return new Response(null, { status: 403 });
        // CAS shares the same lock/revision as owner edits: neither a booking nor an agenda edit can overwrite the other.
        for (let attempt = 0; attempt < 3; attempt++) {
            const { data: row, error } = await p.db.from('pro_workspaces').select('document,revision').eq('user_id', p.owner).maybeSingle();
            if (error)
                return Response.json({ error: 'No se pudo reservar. Intente nuevamente.' }, { status: 503 });
            const document = row ? businessSchema.parse(row.document) : emptyBusiness();
            let next;
            try {
                next = reserveSlot(document, user.id, client.full_name || 'Cliente', body.start, body.service, body.requestId);
            }
            catch {
                return Response.json({ error: 'Ese horario ya no está disponible. Elija otro.' }, { status: 409 });
            }
            const { error: write } = await p.db.rpc('pro_save_workspace', { p_user: p.owner, p_document: next, p_revision: row?.revision ?? 0 });
            if (!write)
                return Response.json({ id: body.requestId, start: body.start }, { headers });
            if (write.code !== '40001')
                return Response.json({ error: 'No se pudo reservar. Intente nuevamente.' }, { status: 503 });
        }
        return Response.json({ error: 'La agenda cambió. Intente nuevamente.' }, { status: 409 });
    }
    catch {
        return Response.json({ error: 'Revise los datos de la reserva' }, { status: 400 });
    }
}
