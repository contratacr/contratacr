import { expect, type BrowserContext } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { emptyBusiness } from '../../src/lib/pro/business';
import { crTodayISO } from '../../src/lib/time-cr';
import { emptyInvoiceIssuer } from '../../src/lib/pro/invoice-preparation';
export const origin = 'http://127.0.0.1:3185', api = '/api/pro/private-estimates';
export function local(baseURL: string | undefined) { expect(baseURL).toBe(origin); expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321'); }
export async function login(context: BrowserContext, actor: DisposableAccount) { const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: async (cookies) => context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: origin, sameSite: 'Lax' as const }))) } }); const result = await auth.auth.signInWithPassword({ email: actor.email, password: actor.password }); expect(result.error).toBeNull(); expect(result.data.session).not.toBeNull(); return result.data.session!.access_token; }
export async function fixture(context: BrowserContext) { const owner = await createDisposableAccount({ prefix: 'private-estimate-owner' }), db = regressionAdminClient(); try {
    const user = (await db.auth.admin.getUserById(owner.id)).data.user!;
    expect((await db.auth.admin.updateUserById(owner.id, { user_metadata: { ...user.user_metadata, is_provider: true, role: 'professional' } })).error).toBeNull();
    await db.from('profiles').update({ is_provider: true, role: 'professional' }).eq('id', owner.id).throwOnError();
    await db.from('pro_memberships').insert({ user_id: owner.id, status: 'active' }).throwOnError();
    const document = emptyBusiness(), clientId = 'private-origin-client', secondClient = 'private-origin-other', workId = crypto.randomUUID(), completedId = crypto.randomUUID(), today = crTodayISO();
    document.clients = [{ id: clientId, name: 'Cliente privado sin cuenta', email: '', phone: '', notes: 'Conservar cliente', archived: false }, { id: secondClient, name: 'Cliente alternativo', email: '', phone: '', notes: 'Conservar otro', archived: false }];
    document.work = [{ id: workId, clientId, client: 'Cliente privado sin cuenta', service: 'Trabajo existente sin programar', stage: 'new', start: '', end: '', cancelled: false }, { id: completedId, clientId, client: 'Cliente privado sin cuenta', service: 'Trabajo concluido previo', stage: 'completed', start: today + 'T09:00:00-06:00', end: today + 'T10:00:00-06:00', cancelled: false }];
    await db.from('pro_workspaces').insert({ user_id: owner.id, document, revision: 1 }).throwOnError();
    const token = await login(context, owner);
    for (const endpoint of ['/api/auth/session-mfa', '/api/auth/registration-state', '/api/pro/access'])
        expect((await context.request.get(endpoint, { timeout: 45000 })).status()).toBe(200);
    for (const id of [workId, completedId])
        expect((await context.request.get('/api/pro/client-operations?' + new URLSearchParams({ workId: id, clientId }), { timeout: 45000 })).status()).toBe(200);
    expect((await db.from('professionals').select('id').eq('profile_id', owner.id).throwOnError()).data).toEqual([]);
    return { owner, db, token, clientId, secondClient, workId, completedId };
}
catch (error) {
    await cleanupDisposableAccount(owner);
    throw error;
} }
export type Fixture = Awaited<ReturnType<typeof fixture>>;
export async function cleanup(f: Fixture) { await cleanupDisposableAccount(f.owner); }
export async function post(context: BrowserContext, actor: DisposableAccount, body: unknown, path = api) { return context.request.post(path, { headers: { Origin: origin, 'X-Pro-Expected-Actor': actor.id }, data: body }); }
export async function read(context: BrowserContext, query: Record<string, string>, path = api) { return context.request.get(path + '?' + new URLSearchParams(query)); }
export async function snapshot(f: Fixture) { const result: Record<string, unknown> = {}; for (const table of ['pro_workspaces', 'pro_work', 'pro_clients', 'pro_quote_links', 'pro_client_entries', 'pro_work_cost_entries'])
    result[table] = (await f.db.from(table).select('*').eq('user_id', f.owner.id).throwOnError()).data; for (const table of ['pro_appointment_requests', 'pro_request_quotes', 'pro_request_followups'])
    result[table] = (await f.db.from(table).select('*').eq('owner_id', f.owner.id).throwOnError()).data; for (const table of ['notifications', 'notification_push_outbox'])
    result[table] = (await f.db.from(table).select('*').eq('user_id', f.owner.id).throwOnError()).data; result.directory = (await f.db.from('professionals').select('*').eq('profile_id', f.owner.id).throwOnError()).data; for (const key of Object.keys(result))
    if (Array.isArray(result[key]))
        result[key] = (result[key] as unknown[]).toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); return result; }
export async function state(f: Fixture) { const result: Record<string, unknown> = {}; for (const table of ['pro_lead_center_records', 'pro_lead_center_actions', 'pro_lead_center_history', 'pro_lead_origin_assignments', 'pro_lead_origin_actions', 'pro_lead_origin_history', 'pro_lead_origin_creates', 'pro_request_pipeline_heads', 'pro_request_pipeline_stages'])
    result[table] = (await f.db.from(table).select('*').eq('owner_id', f.owner.id).throwOnError()).data?.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); return result; }
export async function json(context: BrowserContext, query: Record<string, string>, path = api) { const response = await read(context, query, path); expect(response.status()).toBe(200); return response.json(); }
export const issuer = { ...emptyInvoiceIssuer(), issuerName: 'Emisor privado local', issuerEmail: '', issuerPhone: '', issuerAddress: 'Dirección privada explícita' };
export function estimateInput(ctx: {
    client: {
        id: string;
    };
    clientFingerprint: string;
    source: unknown;
}, patch: Record<string, unknown> = {}) { return { action: 'save', actionId: crypto.randomUUID(), estimateId: crypto.randomUUID(), revision: 0, clientId: ctx.client.id, refreshClient: false, clientFingerprint: ctx.clientFingerprint, source: ctx.source, issuer, title: 'Cotización privada ñ %_', notes: 'Documento privado; sin envío ni aceptación.', currency: 'USD', validUntil: '2024-02-29', lines: [{ id: crypto.randomUUID(), description: 'Trabajo con cantidad fraccionaria', unit: 'hora', qtyMilli: 1250, unitPriceCents: 1999, discountBps: 1250, taxBps: 1300, catalogProductId: null }, { id: crypto.randomUUID(), description: 'Media unidad de centavo', unit: '', qtyMilli: 500, unitPriceCents: 1, discountBps: 0, taxBps: 0, catalogProductId: null }], ...patch }; }
export async function estimateRows(f: Fixture) { const out: Record<string, unknown> = {}; for (const table of ['pro_private_estimates', 'pro_private_estimate_items', 'pro_private_estimate_actions', 'pro_private_estimate_history'])
    out[table] = (await f.db.from(table).select('*').eq(table === 'pro_private_estimate_actions' ? 'actor_id' : 'owner_id', f.owner.id).throwOnError()).data?.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); return out; }
export async function oldDocuments(f: Fixture) { const professionals = (await f.db.from('professionals').select('id').eq('profile_id', f.owner.id).throwOnError()).data!, out: Record<string, unknown> = {}; out.quotes = professionals.length ? (await f.db.from('quotes').select('*').in('professional_id', professionals.map(row => row.id)).order('id').throwOnError()).data : []; for (const table of ['pro_legacy_quotes', 'pro_legacy_quote_lines', 'pro_quote_links', 'pro_invoice_drafts'])
    out[table] = (await f.db.from(table).select('*').eq('user_id', f.owner.id).throwOnError()).data?.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); for (const table of ['pro_manual_lead_quotes', 'pro_direct_project_quote_actions']) {
    const column = table === 'pro_manual_lead_quotes' ? 'owner_id' : 'actor_id';
    out[table] = (await f.db.from(table).select('*').eq(column, f.owner.id).throwOnError()).data?.toSorted((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
} return out; }
