import { test, expect, type BrowserContext } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { emptyBusiness } from '../../src/lib/pro/business';
import { expectNoHorizontalOverflow } from './helpers';
test('Pro calendar: free client books, concurrent reservations do not overlap and owner sees the real booking', async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(150000);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    const owner = await createDisposableAccount({ prefix: 'calendar-owner' }), client = await createDisposableAccount({ prefix: 'calendar-client' }), other = await createDisposableAccount({ prefix: 'calendar-other' });
    const db = regressionAdminClient(), contexts: BrowserContext[] = [];
    async function auth(context: BrowserContext, actor: typeof owner) { const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: async (cookies) => { await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: baseURL!, sameSite: 'Lax' as const }))); } } }); expect((await auth.auth.signInWithPassword({ email: actor.email, password: actor.password })).error).toBeNull(); }
    try {
        const slug = 'calendar-' + owner.id;
        const p = await db.from('professionals').insert({ profile_id: owner.id, category_id: 'desarrollo_web', business_name: 'Calendario Pro local', slug, whatsapp: '', provincia_id: 'al', canton_id: 'al-at', verification_status: 'pending', is_available: true, is_banned: false }).select('id').single();
        expect(p.error).toBeNull();
        await db.from('profiles').update({ is_provider: true }).eq('id', owner.id);
        await db.from('pro_memberships').insert({ user_id: owner.id, status: 'active' });
        const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), start = `${day}T09:00:00-06:00`, second = `${day}T11:00:00-06:00`;
        const document = emptyBusiness();
        document.availability = [{ start, end: `${day}T10:00:00-06:00` }, { start: second, end: `${day}T12:00:00-06:00` }];
        await db.from('pro_workspaces').insert({ user_id: owner.id, document, revision: 1 });
        const url = '/api/pro/reservations?professional=' + p.data!.id;
        const publicResult = await page.request.get(url);
        expect(publicResult.ok()).toBeTruthy();
        const publicData = await publicResult.json();
        expect(publicData.slots).toHaveLength(2);
        expect(Object.keys(publicData).sort()).toEqual(['enabled', 'slots']);
        const payload = { professional: p.data!.id, start, service: 'Desarrollo web', requestId: crypto.randomUUID() };
        expect((await page.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: payload })).status()).toBe(401);
        await auth(page.context(), client);
        expect((await page.request.get('/api/pro/workspace')).status()).toBe(403); // The booking customer has no Pro.
        await page.goto('/profesionales/' + slug);
        const availability = page.getByRole('button', { name: 'Ver disponibilidad', exact: true });
        await availability.scrollIntoViewIfNeeded();
        await availability.click();
        await expect(page.getByRole('dialog')).toContainText('Reservar es gratis');
        await page.getByRole('dialog').getByRole('button', { name: '09:00', exact: true }).click();
        await page.getByRole('button', { name: 'Confirmar cita', exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText('Cita confirmada');
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: testInfo.outputPath('client-booking.png'), fullPage: true });
        let stored = (await db.from('pro_workspaces').select('document').eq('user_id', owner.id).single()).data!.document;
        expect(stored.work).toHaveLength(1);
        expect(stored.work[0].bookingClientId).toBe(client.id);
        expect(stored.clients[0].name).toBeTruthy();
        expect((await page.request.get(url)).ok()).toBeTruthy();
        expect((await (await page.request.get(url)).json()).slots).toHaveLength(1);
        // Retry a successful request after a lost response is idempotent.
        const saved = stored.work[0];
        expect((await page.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: { ...payload, requestId: saved.id } })).status()).toBe(200);
        expect((await page.request.post('/api/pro/reservations', { headers: { origin: 'https://other.invalid' }, data: payload })).status()).toBe(403);
        const another = await browser.newContext();
        contexts.push(another);
        await auth(another, other);
        const collision = await Promise.all([page.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: { ...payload, start: second, requestId: crypto.randomUUID() } }), another.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: { ...payload, start: second, requestId: crypto.randomUUID() } })]);
        expect(collision.map(r => r.status()).sort()).toEqual([200, 409]);
        const ownerContext = await browser.newContext();
        contexts.push(ownerContext);
        await auth(ownerContext, owner);
        expect((await ownerContext.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: payload })).status()).toBe(403);
        const ownerPage = await ownerContext.newPage();
        await ownerPage.goto('/dashboard/profesional?tab=pro_agenda');
        await expect(ownerPage.locator('[data-reservation-calendar]')).toBeVisible();
        await expect(ownerPage.getByRole('button',{name:'Lista',exact:true})).toHaveCount(0);
        await expect(ownerPage.getByRole('button',{name:'Semana',exact:true})).toHaveCount(0);
        await expect(ownerPage.getByLabel('Buscar registros')).toHaveCount(0);
        await ownerPage.getByRole('button',{name:day,exact:true}).click();
        await expect(ownerPage.getByRole('heading', { name: / · Desarrollo web$/ }).first()).toBeVisible();
        await ownerPage.getByRole('button',{name:'Nueva cita',exact:true}).click();
        await expect(ownerPage.getByLabel('Inicio · Costa Rica')).toHaveValue(day+'T09:00');
        await ownerPage.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
        await ownerPage.getByRole('button', { name: 'Editar disponibilidad', exact: true }).click();
        await ownerPage.getByLabel('Fecha disponible').fill(day);
        await ownerPage.getByLabel('Hora disponible').fill('14:00');
        await expectNoHorizontalOverflow(ownerPage);
        await ownerPage.screenshot({ path: testInfo.outputPath('availability-form.png'), fullPage: true });
        await ownerPage.getByRole('button', { name: 'Agregar horario', exact: true }).click();
        await expect.poll(async () => ((await ownerContext.request.get('/api/pro/workspace')).json()).then(j => j.document.availability.length)).toBe(3);
        await ownerPage.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
        await ownerPage.screenshot({ path: testInfo.outputPath('owner-calendar.png'), fullPage: true });
        await expectNoHorizontalOverflow(ownerPage);
        await db.from('pro_memberships').update({ status: 'inactive' }).eq('user_id', owner.id);
        expect((await (await page.request.get(url)).json()).enabled).toBe(false);
        expect((await page.request.post('/api/pro/reservations', { headers: { origin: baseURL! }, data: payload })).status()).toBe(403);
        stored = (await db.from('pro_workspaces').select('document').eq('user_id', owner.id).single()).data!.document;
        expect(stored.work).toHaveLength(2);
    }
    finally {
        for (const c of contexts)
            await c.close();
        for (const actor of [owner, client, other])
            await cleanupDisposableAccount(actor);
    }
});
