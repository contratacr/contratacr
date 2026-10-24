import { test, expect } from 'playwright/test';
import { createDisposableAccount, cleanupDisposableAccount } from './disposable-account';
import { regressionAdminClient } from './seed';
import { gotoOK, loginAs } from './helpers';
import { NATIVE_ONBOARDING_COMPLETED_KEY } from '@/lib/mobile-onboarding';

for (const native of [false, true]) {
  test(`delete all includes unloaded notifications and preserves chat records (${native ? 'native' : 'web'})`, async ({ page, baseURL }) => {
    test.setTimeout(120_000);
    const account = await createDisposableAccount({ prefix: 'delete-notifications' });
    const admin = regressionAdminClient();
    try {
      const { error } = await admin.from('notifications').insert(Array.from({ length: 105 }, (_, index) => ({
        user_id: account.id, type: 'support_reply', title: 'Respuesta de soporte',
        message: `Prueba ${index}`, data: { push_suppressed: true, ticket_subject: `Prueba ${index}` }, read: true,
      })).concat([{ user_id: account.id, type: 'direct_message', title: 'Mensaje', message: 'Chat', data: { push_suppressed: true, ticket_subject: 'Chat' }, read: true }]));
      if (error) throw error;
      if (native) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.context().addCookies([{ name: 'ccr_platform', value: 'native', url: baseURL! }]);
        await page.addInitScript(key => localStorage.setItem(key, '1'), NATIVE_ONBOARDING_COMPLETED_KEY);
      }
      await loginAs(page, account.email, account.password);
      await gotoOK(page, '/es/notificaciones');
      const options = page.getByRole('button', { name: 'Opciones de notificaciones', exact: true }).filter({ visible: true }).first();
      await options.click();
      await page.getByRole('menuitem', { name: 'Eliminar todas', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await options.click();
      await page.getByRole('menuitem', { name: 'Eliminar todas', exact: true }).click();
      await dialog.getByRole('button', { name: 'Eliminar todas', exact: true }).click();
      await expect.poll(async () => {
        const { data, error } = await admin.from('notifications').select('type').eq('user_id', account.id);
        if (error) throw error;
        return data?.map(row => row.type);
      }).toEqual(['direct_message']);
      await expect(dialog).toHaveCount(0);
    } finally {
      await cleanupDisposableAccount(account);
    }
  });
}
