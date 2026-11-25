import { test, expect, type BrowserContext } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { emptyBusiness } from '../../src/lib/pro/business';
import { expectNoHorizontalOverflow } from './helpers';
// PRO_ENABLED off (E2E_PRO_OFF=1): Pro agenda reservations (/api/pro/reservations) answers 404 by design; the free owner tools are covered by pro-dir-business-tools.
test.skip(process.env.E2E_PRO_OFF==='1','Pro surface closed while PRO_ENABLED is off');
test('Pro calendar compatibility: free client legacy API books atomically, new UI requests confirmation and owner sees the booking', async ({ page, browser, baseURL }, testInfo) => {
    test.setTimeout(150000);
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
    const owner = await createDisposableAccount({ prefix: 'calendar-owner' }), client = await createDisposableAccount({ prefix: 'calendar-client' }), other = await createDisposableAccount({ prefix: 'calendar-other' });
    const db = regressionAdminClient(), contexts: BrowserContext[] = [];
    async function auth(context: BrowserContext, actor: typeof owner) { const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: async (cookies) => { await context.addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: baseURL!, sameSite: 'Lax' as const }))); } } }); expect((await auth.auth.signInWithPassword({ email: actor.email, password: actor.password })).error).toBeNull(); }
    try {
        // The assign_business_profile_slug trigger replaces the slug with <trade name>-<10 hex of the id>; open the stored one.
        const p = await db.from('professionals').insert({ profile_id: owner.id, category_id: 'desarrollo_web', business_name: 'Calendario Pro local', slug: 'calendar-' + owner.id, whatsapp: '', provincia_id: 'al', canton_id: 'al-at', verification_status: 'pending', is_available: true, is_banned: false }).select('id,slug').single();
        expect(p.error).toBeNull();
        const slug = p.data!.slug as string;
        await db.from('profiles').update({ is_provider: true }).eq('id', owner.id);
        await db.from('pro_memberships').insert({ user_id: owner.id, status: 'active' });
        await db.from('pro_appointment_preferences').insert({owner_id:owner.id,enabled:true,revision:1}).throwOnError();
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
        const availability = page.getByRole('button', { name: 'Ver disponibilidad', exact: true }).filter({visible:true}).first();
        await availability.scrollIntoViewIfNeeded();
        await availability.click();
        await expect(page.getByRole('dialog',{name:'Solicitar una cita',exact:true})).toContainText('El profesional debe confirmar la cita');
        await expect(page.getByRole('dialog').getByRole('button',{name:'Confirmar cita',exact:true})).toHaveCount(0);
        await expectNoHorizontalOverflow(page);
        await page.screenshot({ path: testInfo.outputPath('client-booking.png'), fullPage: true });
        await page.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
        // The retained API contract still supports old authenticated clients;
        // the current public UI follows the request/confirmation flow tested separately.
        const legacyBooking=await page.request.post('/api/pro/reservations',{headers:{origin:baseURL!},data:payload});
        expect(legacyBooking.status()).toBe(200);expect((await legacyBooking.json()).id).toBe(payload.requestId);
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
        // The calendar only appears when configuring availability (docs/pro/unified-appointments-local.md): open the collapsed section.
        await ownerPage.locator('[data-availability-secondary] summary').click();
        await expect(ownerPage.locator('[data-reservation-calendar]')).toBeVisible();
        await expect(ownerPage.getByRole('button',{name:'Lista',exact:true})).toHaveCount(0);
        await expect(ownerPage.getByRole('button',{name:'Semana',exact:true})).toHaveCount(0);
        await expect(ownerPage.getByLabel('Buscar registros')).toHaveCount(0);
        await ownerPage.getByRole('button',{name:day,exact:true}).click();
        // Unified appointments: the booking is a card of the single list (title = service, subtitle = customer), not a day heading of the calendar.
        await ownerPage.getByLabel('Mostrar citas',{exact:true}).selectOption({label:'Todas'});
        await expect(ownerPage.locator('[data-pro-record-card]').filter({has:ownerPage.getByRole('heading',{name:'Desarrollo web',exact:true})}).first()).toBeVisible();
        await ownerPage.getByRole('button',{name:'Nueva cita',exact:true}).click();
        await expect(ownerPage.getByLabel('Inicio · Costa Rica')).toHaveValue(day+'T09:00');
        await ownerPage.getByRole('dialog').getByRole('button',{name:'Cerrar',exact:true}).click();
        await ownerPage.getByRole('button', { name: 'Editar disponibilidad del día', exact: true }).click();
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
