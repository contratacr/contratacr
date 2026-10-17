import { test, expect } from "playwright/test";
import { build } from "esbuild";

// Real picker, decoder, canvas export and shared modal; no profile/account writes.
test.beforeEach(async ({ page }) => {
  const bundled = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {AvatarFileInput} from './src/components/ui/avatar-file-input';
      createRoot(document.getElementById('root')).render(<AvatarFileInput aria-label="Choose photo" onFile={async file=>{ window.resultFile=file; const image=new Image(); image.src=URL.createObjectURL(file); await image.decode(); const c=document.createElement('canvas');c.width=c.height=800;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);window.result={width:image.naturalWidth,height:image.naturalHeight,corner:[...ctx.getImageData(0,0,1,1).data],centre:[...ctx.getImageData(400,400,1,1).data]};}}/>);`, resolveDir: process.cwd(), loader: "tsx" },
    jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife", tsconfig: "tsconfig.json", define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "locale", setup(builder) {
      builder.onResolve({ filter: /^next-intl$/ }, () => ({ path: "intl", namespace: "test-intl" }));
      builder.onLoad({ filter: /.*/, namespace: "test-intl" }, () => ({ contents: `export const useLocale=()=>location.search.includes('en')?'en':'es';` }));
    } }],
  });
  await page.route('**/avatar-framing-harness*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}.relative{position:relative}.absolute{position:absolute}.flex{display:flex}.flex-col{flex-direction:column}.flex-wrap{flex-wrap:wrap}.items-center{align-items:center}.justify-center{justify-content:center}.fixed{position:fixed}.inset-0{inset:0}.w-full{width:100%}.max-w-72{max-width:288px}.aspect-square{aspect-ratio:1}.overflow-hidden{overflow:hidden}.rounded-full{border-radius:999px}[role=dialog]{background:white;max-height:95vh;overflow:auto}button{min-height:44px}input[type=range]{width:100%;height:44px}</style><div id="root"></div>' }));
  await page.goto('/avatar-framing-harness');
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
});

async function choose(page: import('playwright/test').Page) {
  const bytes = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 200;
    const ctx = c.getContext('2d')!;ctx.fillStyle = '#ff0000';ctx.fillRect(0,0,300,200);ctx.fillStyle = '#0000ff';ctx.fillRect(300,0,300,200);
    return [...Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]), c=>c.charCodeAt(0))];
  });
  await page.getByLabel('Choose photo').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('button', { name: 'Usar foto', exact: true })).toBeEnabled();
}

test('cancel preserves the existing photo; fitting a commercial logo exports a square with white padding', async ({ page }) => {
  await choose(page);
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.evaluate(() => 'resultFile' in window)).toBe(false);
  await choose(page);
  await page.getByRole('button', { name: 'Mostrar logo completo' }).click();
  await page.getByRole('button', { name: 'Usar foto', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { result?: { width:number } }).result?.width)).toBe(800);
  const result = await page.evaluate(() => (window as unknown as { result: { width:number;height:number;corner:number[] } }).result);
  expect(result.height).toBe(800);
  expect(result.corner.slice(0,3).every(v=>v>245)).toBe(true);
});

test('dragging and zoom change the exported framing before confirmation', async ({ page }) => {
  await choose(page);
  const viewport = page.getByRole('img', { name: 'Vista previa circular' });
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .85, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await page.getByLabel('Zoom', { exact: true }).fill('1.5');
  await page.getByRole('button', { name: 'Usar foto', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { result?: { centre:number[] } }).result?.centre[0])).toBeGreaterThan(230);
});

test('invalid image cannot be confirmed or replace an existing photo', async ({ page }) => {
  await page.getByLabel('Choose photo').setInputFiles({ name: 'bad.jpg', mimeType:'image/jpeg', buffer: Buffer.from('not an image') });
  await expect(page.getByRole('alert')).toContainText('No se pudo abrir');
  await expect(page.getByRole('button', { name:'Usar foto', exact:true })).toBeDisabled();
  expect(await page.evaluate(()=>'resultFile' in window)).toBe(false);
});

test('English native shell uses the same editor and accessible positioning controls', async ({ page, isMobile }) => {
  await page.evaluate(() => { history.replaceState(null, '', '/avatar-framing-harness?en'); document.documentElement.classList.add('ccr-native-app'); });
  const bytes = await page.evaluate(() => { const c=document.createElement('canvas');c.width=c.height=200;const ctx=c.getContext('2d')!;ctx.fillStyle='red';ctx.fillRect(0,0,200,200);return [...Uint8Array.from(atob(c.toDataURL().split(',')[1]),c=>c.charCodeAt(0))]; });
  await page.getByLabel('Choose photo').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(bytes)});
  await expect(page.getByRole('button',{name:'Use photo',exact:true})).toBeEnabled();
  await expect(page.getByRole('dialog')).toBeVisible();
  if (isMobile) await page.getByRole('button',{name:'Move →',exact:true}).tap();
  else await page.getByRole('button',{name:'Move →',exact:true}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.locator('html')).not.toHaveClass(/ccr-native-fullscreen-layer/);
  expect(await page.evaluate(()=>'resultFile' in window)).toBe(false);
});
