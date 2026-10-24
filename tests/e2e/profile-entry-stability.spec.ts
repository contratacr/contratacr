import { test, expect } from 'playwright/test';
import { loginAs, gotoOK } from './helpers';
import { regressionAdminClient } from './seed';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';

type Frame = { tab: string; previous: boolean };
for (const native of [false, true]) {
  test(`profile entry keeps the previous menu and avatar out of the destination (${native ? 'native shell' : 'web'})`, async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The mobile panel hides its root menu when a section opens.');
    test.setTimeout(120_000);
    const account = await createDisposableAccount({ prefix: 'profile-entry' });
    const db = regressionAdminClient();
    try {
      const { error } = await db.from('professionals').insert({
        profile_id: account.id, category_id: 'desarrollo_web', slug: 'profile-' + account.id,
        business_name: 'Perfil de prueba', provincia_id: 'al', canton_id: 'al-at',
        is_banned: false, verification_status: 'pending', whatsapp: '+50670009999',
      });
      expect(error).toBeNull();
      const profileUpdate = await db.from('profiles').update({
        role: 'professional', is_provider: true, avatar_url: '/brand/wordmark-light.svg',
      }).eq('id', account.id);
      expect(profileUpdate.error).toBeNull();
      if (native) {
        await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: test.info().project.use.baseURL! }]);
        await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
      }
      await loginAs(page, account.email, account.password);
      await gotoOK(page, '/dashboard/profesional?tab=home');
      for (let entry = 0; entry < 2; entry++) {
        const link = page.getByTestId('panel-tab-profile').filter({ visible: true }).first();
        await expect(link).toBeVisible();
        await page.evaluate(() => {
          const samples: Frame[] = [];
          (window as unknown as { __profileFrames: Frame[] }).__profileFrames = samples;
          let destinationCount = 0;
          const tick = () => {
            samples.push({
              tab: location.search,
              previous: [...document.querySelectorAll('[data-testid="panel-tab-profile"]')]
                .some(element => (element as HTMLElement).offsetHeight > 0),
            });
            if (new URLSearchParams(location.search).get("tab") === "profile") destinationCount++;
            if (destinationCount < 45 && samples.length < 3000) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await link.click();
        await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('profile');
        await expect.poll(() => page.evaluate(() =>
          (window as unknown as { __profileFrames: Frame[] }).__profileFrames.filter(frame => new URLSearchParams(frame.tab).get("tab") === "profile").length)).toBe(45);
        const frames = await page.evaluate(() =>
          (window as unknown as { __profileFrames: Frame[] }).__profileFrames);
        const destinationFrames = frames.filter(frame => new URLSearchParams(frame.tab).get('tab') === 'profile');
        expect(destinationFrames.length).toBeGreaterThan(5);
        expect(destinationFrames.filter(frame => frame.previous),
          'The previous menu and avatar must never reappear after profile navigation').toEqual([]);
        await expect(page.locator('#sec-basic')).toBeVisible();
        await page.goBack();
        await expect(link).toBeVisible();
      }
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
}
