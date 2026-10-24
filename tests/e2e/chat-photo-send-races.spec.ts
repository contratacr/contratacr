import { test, expect } from 'playwright/test';
import { loginAs, gotoOK } from './helpers';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';
import { APP_RESUME_EVENT } from '@/lib/app-events';
import { reconcileThreadMessages, confirmThreadMessage } from '@/lib/direct-chat/thread-messages';

const old = { id: 'old', body: 'Hola', created_at: '2026-10-23T10:00:00Z' };
const pending = { id: 'pending-photo', body: 'Archivo adjunto', created_at: '2026-10-23T10:01:00Z' };
const sent = { ...pending, id: 'sent-photo' };
test('refreshes retain uploads and sends that completed after a snapshot started', () => {
  expect(reconcileThreadMessages([old, pending], [old])).toEqual([old, pending]);
  expect(confirmThreadMessage([old], pending.id, sent)).toEqual([old, sent]);
  expect(confirmThreadMessage([old, pending, sent], pending.id, sent)).toEqual([old, sent]);
  expect(reconcileThreadMessages([old, sent], [old], new Set([sent.id]))).toEqual([old, sent]);
  // A subsequent authoritative snapshot may remove messages normally.
  expect(reconcileThreadMessages([old, sent], [old])).toEqual([old]);
});
test('same attachment count must not suppress signed URLs, edits or read receipts', () => {
  const unsigned = { ...sent, attachment_urls: [{ path: 'photo', url: null as string | null }] };
  const signed = { ...unsigned, attachment_urls: [{ path: 'photo', url: '/photo.png' }], read_at: '2026-10-23T10:02:00Z' };
  expect(reconcileThreadMessages([unsigned], [signed])[0]).toBe(signed);
  const rows = [signed];
  expect(reconcileThreadMessages(rows, [{ ...signed }])).toBe(rows);
});

for (const native of [false, true]) {
  test(`a photo remains in the open chat during refresh and after a stale response (${native ? 'native shell' : 'web'})`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const actor = await createDisposableAccount({ prefix: 'chat-photo-race' });
    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
    let releasePost!: () => void;
    const postGate = new Promise<void>(resolve => { releasePost = resolve; });
    let releaseStale!: () => void;
    const staleGate = new Promise<void>(resolve => { releaseStale = resolve; });
    let holdSnapshot = false;
    let snapshotRequests = 0;
    let posted = false;
    let committed = false;
    let uploaded = false;
    const conversationId = 'c6000000-0000-4000-8000-000000000081';
    const confirmedId = 'c6000000-0000-4000-8000-000000000082';
    const conversation = { id: conversationId, client_id: actor.id, professional_profile_id: 'c6000000-0000-4000-8000-000000000083', status: 'open', last_message_at: old.created_at, client_unread_count: 0, professional_unread_count: 0, professionals: { business_name: 'Profesional de prueba', profiles: { full_name: 'Profesional de prueba' } } };
    const initial = { ...old, sender_id: actor.id };
    const attachment = { name: 'foto.png', type: 'image/png', size: 100, path: `${conversationId}/${actor.id}/foto.png`, url: '/test-chat-photo.png' };
    const confirmed = { ...sent, id: confirmedId, sender_id: actor.id, attachment_urls: [attachment] };
    try {
      if (native) {
        await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
        await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
      }
      await loginAs(page, actor.email, actor.password);
      await page.route('**/api/direct-chat**', async route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/direct-chat/attachments') {
          uploaded = true;
          await uploadGate;
          await route.fulfill({ json: { attachment } });
        } else if (url.pathname !== '/api/direct-chat') {
          await route.fallback();
        } else if (route.request().method() === 'POST') {
          posted = true;
          await postGate;
          committed = true;
          await route.fulfill({ json: { ok: true, conversationId, message: confirmed } });
        } else if (url.searchParams.has('id')) {
          snapshotRequests++;
          const rows = committed ? [initial, confirmed] : [initial];
          if (holdSnapshot) await staleGate;
          await route.fulfill({ json: { conversation, messages: rows, vistos: true } });
        } else {
          await route.fulfill({ json: { conversations: [conversation] } });
        }
      });
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
      await page.route('**/test-chat-photo.png', route => route.fulfill({ contentType: 'image/png', body: png }));
      await gotoOK(page, `/mensajes?conversation=${conversationId}`);
      await expect(page.locator('#msg-old')).toBeVisible();
      await expect(page.locator('[data-chat-day-label]')).toHaveCount(1);
      await expect(page.locator('#msg-old [data-message-time]')).toContainText(':');
      expect(await page.locator('[data-chat-day-label]').evaluate(element => getComputedStyle(element).position)).toBe('sticky');
      await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
      const send = page.getByRole('button', { name: /^(Enviar|Send)$/ }).filter({ visible: true });
      await expect(send).toBeEnabled();
      await send.click();
      await expect.poll(() => uploaded).toBe(true);
      const uploading = page.locator('[id^="msg-pending-"]');
      await expect(uploading).toHaveCount(1);
      const before = snapshotRequests;
      const uploadRefresh = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/direct-chat' && url.searchParams.get('id') === conversationId && response.request().method() === 'GET';
      });
      const refresh = () => page.evaluate(event => window.dispatchEvent(new Event(event)), APP_RESUME_EVENT);
      await refresh();
      await expect.poll(() => snapshotRequests).toBeGreaterThan(before);
      await uploadRefresh;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(uploading).toHaveCount(1);
      releaseUpload();
      await expect.poll(() => posted).toBe(true);
      holdSnapshot = true;
      const second = snapshotRequests;
      const staleResponse = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/direct-chat' && url.searchParams.get('id') === conversationId && response.request().method() === 'GET';
      });
      await refresh();
      await expect.poll(() => snapshotRequests).toBeGreaterThan(second);
      releasePost();
      const bubble = page.locator(`#msg-${confirmedId}`);
      await expect(bubble).toBeVisible();
      releaseStale();
      await staleResponse;
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(page.locator('[id^="msg-pending-"]')).toHaveCount(0);
      await expect(bubble).toHaveCount(1);
      await expect.poll(() => bubble.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      expect(new URL(page.url()).searchParams.get('conversation')).toBe(conversationId);
    } finally {
      releaseUpload(); releasePost(); releaseStale();
      await cleanupDisposableAccount(actor);
    }
  });
}

test('real photo upload is stored and shown without reopening the conversation', async ({ page }) => {
  test.setTimeout(120_000);
  const { regressionAdminClient } = await import('./seed');
  const db = regressionAdminClient();
  const sender = await createDisposableAccount({ prefix: 'chat-photo-real' });
  let recipient: Awaited<ReturnType<typeof createDisposableAccount>> | undefined;
  const paths: string[] = [];
  try {
    recipient = await createDisposableAccount({ prefix: 'chat-photo-recipient' });
    const provider = await db.from('professionals').insert({ profile_id: recipient.id, category_id: 'desarrollo_web', slug: 'photo-' + recipient.id, business_name: 'Profesional de prueba', is_banned: false, whatsapp: '' }).select('id').single();
    expect(provider.error).toBeNull();
    const conversation = await db.from('direct_conversations').insert({ client_id: sender.id, professional_id: provider.data!.id, professional_profile_id: recipient.id, status: 'open' }).select('id').single();
    expect(conversation.error).toBeNull();
    await loginAs(page, sender.email, sender.password);
    await gotoOK(page, `/mensajes?conversation=${conversation.data!.id}`);
    const file = page.locator('input[type=file]');
    await expect(file).toBeAttached();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64');
    await file.setInputFiles({ name: 'foto-real.png', mimeType: 'image/png', buffer: png });
    const uploadResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/direct-chat/attachments');
    const sendResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/direct-chat' && response.request().method() === 'POST');
    await page.getByRole('button', { name: /^(Enviar|Send)$/ }).filter({ visible: true }).click();
    const upload = await uploadResponse;
    expect(upload.status()).toBe(200);
    const uploaded = await upload.json();
    paths.push(uploaded.attachment.path);
    const send = await sendResponse;
    expect(send.status()).toBe(200);
    const result = await send.json();
    const bubble = page.locator(`#msg-${result.message.id}`);
    await expect(bubble).toBeVisible();
    await expect(page.locator('[id^="msg-pending-"]')).toHaveCount(0);
    await expect.poll(() => bubble.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await bubble.locator('img').dispatchEvent('contextmenu');
    const menu = page.locator('[data-message-context-menu]');
    await expect(menu).toBeVisible();
    const menuBox = (await menu.boundingBox())!;
    const selected = page.locator('[role=menu]');
    await expect(selected.getByRole('menuitem')).toHaveCount(3);
    const bubbleBox = (await bubble.boundingBox())!;
    expect(Math.min(Math.abs(menuBox.y + menuBox.height - bubbleBox.y), Math.abs(menuBox.y - bubbleBox.y - bubbleBox.height))).toBeLessThanOrEqual(10);
    await page.keyboard.press('Escape');
    for (const dy of [-120, 120]) {
      await bubble.locator('img').click();
      const viewer = page.locator('[data-chat-image-swipe]');
      await expect(viewer).toBeVisible();
      await viewer.evaluate((element, delta) => {
        const start = new Event('touchstart',{bubbles:true});
        Object.defineProperty(start,'touches',{value:[{clientX:100,clientY:300}]});
        element.dispatchEvent(start);
        const end = new Event('touchend',{bubbles:true});
        Object.defineProperty(end,'changedTouches',{value:[{clientX:105,clientY:300+delta}]});
        element.dispatchEvent(end);
      }, dy);
      await expect(viewer).toHaveCount(0);
    }
    const saved = await db.from('direct_messages').select('id,attachment_urls').eq('id', result.message.id).single();
    expect(saved.error).toBeNull();
    expect(saved.data!.attachment_urls).toHaveLength(1);
  } finally {
    if (paths.length) await db.storage.from('direct-message-attachments').remove(paths);
    await cleanupDisposableAccount(sender);
    if (recipient) await cleanupDisposableAccount(recipient);
  }
});
