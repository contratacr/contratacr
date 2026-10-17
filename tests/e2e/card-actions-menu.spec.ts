import { test, expect } from 'playwright/test';
import { build } from 'esbuild';

test('card menus stay usable at viewport edges, in clipped cards and after scrolling', async ({ page }) => {
  const bundle = await build({
    stdin: {
      contents: `import {createRoot} from 'react-dom/client';
        import {CardActionsMenu} from './src/components/dashboard/card-actions-menu';
        createRoot(document.getElementById('harness')).render(<CardActionsMenu label="More actions" actions={Array.from({length:6},(_,i)=>({label:'Action '+(i+1),onClick:()=>{document.body.dataset.selected=String(i+1)}}))}/>);`,
      loader: 'tsx', resolveDir: process.cwd(),
    },
    bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: 'tsconfig.json',
  });
  await page.route('**/card-menu-harness', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Card menu</title>
    <style>body{margin:0;height:3000px}#harness{position:fixed;width:44px;height:44px;overflow:hidden;transform:translateZ(0)}
    button{height:44px;width:44px} [role=menu]{position:fixed;min-width:190px;padding:6px;border:1px solid;box-sizing:border-box;overflow-y:auto;background:white}
    [role=menuitem]{display:block;width:100%;height:44px}</style><div id="harness"></div>` }));
  await page.goto('/card-menu-harness');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const trigger = page.getByRole('button', { name: 'More actions' });
  const menu = page.getByRole('menu');
  const width = page.viewportSize()!.width;
  for (const height of [844, 240]) {
    await page.setViewportSize({ width, height });
    for (const edge of ['top-left', 'bottom-right']) {
      await page.locator('#harness').evaluate((node, edge) => {
        Object.assign((node as HTMLElement).style, edge === 'top-left'
          ? { top: '4px', left: '4px', right: 'auto', bottom: 'auto' }
          : { top: 'auto', left: 'auto', right: '4px', bottom: '4px' });
      }, edge);
      await trigger.click();
      await expect(menu).toBeVisible();
      const assertInside = async () => {
        const box = await menu.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      };
      await assertInside();
      await page.evaluate(() => window.scrollTo(0, 700));
      await expect(async () => { await assertInside(); }).toPass();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await page.mouse.click(1, 1);
      await expect(menu).toHaveCount(0);
      await page.locator('body').evaluate((element) => element.removeAttribute('data-selected'));
      await trigger.click();
      await menu.getByRole('menuitem', { name: 'Action 6', exact: true }).click();
      await expect(menu).toHaveCount(0);
      await expect(page.locator('body')).toHaveAttribute('data-selected', '6');
    }
  }
});
