import { readFile } from 'node:fs/promises';
import { parseCatalogCsv } from '../../src/lib/pro/catalog-import';
import { test, expect } from 'playwright/test';
import { createServerClient } from '@supabase/ssr';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { emptyBusiness } from '../../src/lib/pro/business';
test('normalized catalogs: bounded pages, tenant isolation, atomic imports/stock and shared revision', async ({ page, baseURL }) => {
  test.setTimeout(120000);
  expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
  const owner = await createDisposableAccount({ prefix: 'pro-catalog-owner' });
  const other = await createDisposableAccount({ prefix: 'pro-catalog-other' });
  const db = regressionAdminClient();
  try {
    for (const actor of [owner, other]) {
      await db.from('profiles').update({ is_provider: true }).eq('id', actor.id).throwOnError();
      await db.from('pro_memberships').insert({ user_id: actor.id, status: 'active' }).throwOnError();
    }
    const document = emptyBusiness();
    for (let i = 0; i < 47; i++) {
      const id = String(i).padStart(3, '0');
      document.clients.push({ id: 'c-' + id, name: 'Cliente Álvarez ' + id, email: '', phone: '', notes: 'Conservar', archived: i === 46 });
      document.products.push({ id: 'p-' + id, sku: 'SKU-' + id, name: 'Material ' + id, stock: i, minimum: 2, cost: 10, price: 20, archived: i === 46 });
    }
    await db.from('pro_workspaces').insert({ user_id: owner.id, document, revision: 1 }).throwOnError();
    const core = await db.from('pro_workspace_core').select('document').eq('user_id', owner.id).single().throwOnError();
    expect(core.data!.document.clients).toBeUndefined();
    expect(core.data!.document.products).toBeUndefined();
    expect(core.data!.document.movements).toBeUndefined();
    expect((await db.from('pro_clients').select('id').eq('user_id', owner.id).throwOnError()).data).toHaveLength(47);
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => [], setAll: async cookies => { await page.context().addCookies(cookies.map(c => ({ name: c.name, value: c.value, url: baseURL!, sameSite: 'Lax' as const }))); } } });
    expect((await auth.auth.signInWithPassword({ email: owner.email, password: owner.password })).error).toBeNull();
    const get = async (kind = 'clients', extra: Record<string, string> = {}) => {
      const response = await page.request.get('/api/pro/catalog?' + new URLSearchParams({ kind, ...extra }));
      expect(response.status()).toBe(200); return response.json();
    };
    const first = await get(); expect(first.items).toHaveLength(20); expect(first.nextCursor).toBe('c-019');
    const second = await get('clients', { after: first.nextCursor }); expect(second.items).toHaveLength(20);
    const last = await get('clients', { after: second.nextCursor }); expect(last.items).toHaveLength(6); expect(last.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...last.items].map(r => r.id)).size).toBe(46);
    expect((await get('clients', { q: 'alvarez 045' })).items[0].id).toBe('c-045');
    expect((await get('clients', { q: '%,archived.eq.true' })).items).toHaveLength(0);
    expect((await get('products', { filter: 'low' })).items).toHaveLength(3);
    expect((await get('clients', { filter: 'archived' })).items[0].id).toBe('c-046');
    expect((await page.request.get('/api/pro/catalog?kind=clients&id=foreign')).status()).toBe(404);
    // Even with a valid session, another tenant is invisible and all direct mutations/RPC are denied.
    for (const table of ['pro_clients', 'pro_products', 'pro_movements', 'pro_workspace_core', 'pro_workspaces']) {
      const own = await auth.from(table).select('user_id').eq('user_id', other.id); expect(own.error).toBeNull(); expect(own.data).toEqual([]);
    }
    expect((await auth.from('pro_clients').update({ name: 'forged' }).eq('user_id', owner.id)).error).not.toBeNull();
    expect((await auth.rpc('pro_catalog_page', { p_user: other.id, p_kind: 'clients' })).error).not.toBeNull();
    expect((await auth.from('pro_workspace_legacy_backup').select('*')).error).not.toBeNull();
    const patch = (data: Record<string, unknown>, origin = baseURL!) => page.request.patch('/api/pro/catalog', { headers: { origin }, data });
    const product = { ...document.products[0], stock: 3 };
    expect((await patch({ kind: 'products', rows: [product], revision: 1 }, 'https://evil.example')).status()).toBe(403);
    expect((await patch({ kind: 'products', rows: [product], revision: 1 })).status()).toBe(400);
    const movement = { id: 'move-1', productId: product.id, delta: 3, reason: 'Entrada de prueba', at: new Date().toISOString() };
    expect((await patch({ kind: 'products', rows: [product], movements: [movement], revision: 1 })).status()).toBe(200);
    expect((await patch({ kind: 'clients', rows: [{ ...document.clients[0], name: 'Stale' }], revision: 1 })).status()).toBe(409);
    expect((await patch({ kind: 'products', importing: true, revision: 2, rows: [{ ...document.products[1], id: 'new-row', sku: 'NEW' }, { ...document.products[2], id: 'duplicate', sku: 'sku-045' }] })).status()).toBe(400);
    expect((await db.from('pro_products').select('id').eq('user_id', owner.id).eq('id', 'new-row')).data).toEqual([]);
    expect((await patch({ kind: 'products', rows: [{ ...product, stock: -1 }], movements: [{ ...movement, id: 'negative', delta: -4 }], revision: 2 })).status()).toBe(400);
    expect((await get('movements', { q: product.id })).items).toEqual([movement]);
    const legacy = await (await page.request.get('/api/pro/workspace')).json();
    expect(legacy.document.clients).toEqual(document.clients); expect(legacy.document.products[0].stock).toBe(3);
    const results = await Promise.all([
      patch({ kind: 'clients', rows: [{ ...document.clients[0], name: 'Actualizado' }], revision: 2 }),
      page.request.put('/api/pro/workspace', { headers: { origin: baseURL! }, data: { document: legacy.document, revision: 2 } }),
    ]);
    expect(results.map(r => r.status()).sort()).toEqual([200, 409]);
    expect((await get()).revision).toBe(3);
    // The list itself must never download the compatibility document.
    const workspaceRequests: string[] = [], pageSizes: number[] = [];
    page.on('request', r => { if (new URL(r.url()).pathname === '/api/pro/workspace') workspaceRequests.push(r.url()); });
    page.on('response', async r => { if (r.url().includes('/api/pro/catalog?') && r.ok()) { const body = await r.json().catch(() => null); if (body?.items) pageSizes.push(body.items.length); } });
    await page.goto('/es/dashboard/profesional?tab=pro_inventory');
    const cards = page.locator('[data-business-panel] article'); await expect(cards).toHaveCount(20);
    await page.getByLabel('Buscar registros').fill('Material 045'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Material 045');
    expect(workspaceRequests).toEqual([]); expect(pageSizes.length).toBeGreaterThan(0); expect(pageSizes.every(n => n <= 20)).toBe(true);
    // A concurrent edit must keep the user's form intact; saving unchanged must close normally.
    const edit = async () => {
      await cards.getByRole('button', { name: 'Editar', exact: true }).click();
    };
    await edit();
    await page.getByLabel('Nombre', { exact: true }).fill('Borrador conservado');
    const beforeConflict = await get('products');
    await db.rpc('pro_mutate_catalog', { p_user: owner.id, p_kind: 'clients', p_rows: [{ ...document.clients[0], name: 'Cambio concurrente' }], p_revision: beforeConflict.revision }).throwOnError();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Recargue');
    await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador conservado');
    // After a concurrent change the editor is a recoverable error, not a save in progress:
    // no «Guardando…», «Cerrar» responds (asks before discarding) and «Recargar datos» refreshes
    // the record while keeping the draft.
    const editor = page.getByRole('dialog', { name: 'Editar producto o servicio', exact: true });
    await expect(editor.getByRole('button', { name: 'Guardando…', exact: true })).toHaveCount(0);
    await expect(editor.getByRole('button', { name: 'Guardar', exact: true })).toBeEnabled();
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    const discard = page.getByRole('dialog', { name: '¿Descartar cambios?', exact: true });
    await discard.getByRole('button', { name: 'Seguir editando', exact: true }).click();
    await expect(discard).toHaveCount(0);
    await expect(editor.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador conservado');
    await editor.getByRole('button', { name: 'Recargar datos', exact: true }).click();
    await expect(editor.getByRole('alert')).toHaveCount(0);
    await expect(editor.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador conservado');
    await expect(editor.getByRole('button', { name: 'Guardar', exact: true })).toBeEnabled();
    await page.reload();
    // The draft survives the reload; closing a dirty form now asks first (docs/pro/usability-lead-review.md).
    await expect(editor.getByLabel('Nombre', { exact: true })).toHaveValue('Borrador conservado');
    await editor.getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('dialog', { name: '¿Descartar cambios?', exact: true }).getByRole('button', { name: 'Descartar cambios', exact: true }).click();
    await expect(page).not.toHaveURL(/editar=/);
    await page.getByLabel('Buscar registros').fill('Material 045'); await expect(cards).toHaveCount(1);
    await edit(); await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await edit(); await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // A full export follows the server cursor even though the initial list contains 20.
    await page.getByLabel('Buscar registros').fill(''); await expect(cards).toHaveCount(20);
    // A stale list must still export a newer internally consistent snapshot.
    const beforeExport = await get('products');
    await db.rpc('pro_mutate_catalog', { p_user: owner.id, p_kind: 'clients', p_rows: [{ ...document.clients[0], name: 'Cambio antes de exportar' }], p_revision: beforeExport.revision }).throwOnError();
    const download = page.waitForEvent('download');
    await page.getByRole('button',{name:'Más opciones de la sección',exact:true}).click();
    await page.getByRole('menuitem', { name: 'Exportar vista · CSV para Excel', exact: true }).click();
    const file = await download;
    const csv = parseCatalogCsv(await readFile((await file.path())!, 'utf8'));
    expect(csv).toHaveLength(47); // Header plus 46 active products, including pages 2 and 3.
    expect(csv.some(row => row.includes('Material 045'))).toBe(true);
    expect(csv.some(row => row.includes('Material 046'))).toBe(false);
    await db.from('pro_memberships').update({ status: 'inactive' }).eq('user_id', owner.id).throwOnError();
    expect((await page.request.get('/api/pro/catalog?kind=clients')).status()).toBe(403);
  } finally {
    await page.goto('about:blank');
    await cleanupDisposableAccount(owner); await cleanupDisposableAccount(other);
  }
});
