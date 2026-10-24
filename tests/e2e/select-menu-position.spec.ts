import { test, expect } from "playwright/test";
import { build } from "esbuild";

test("short upward select stays attached to its trigger inside a scrolled modal", async ({ page }) => {
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), loader: "tsx",
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {SelectMenu} from './src/components/ui/select-menu';
        createRoot(document.getElementById('root')).render(<SelectMenu value="hour" onChange={()=>{}}
          options={['hour','consultation','project','day','package'].map(value=>({value,label:value}))}/>);`,
    },
    bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><style>
    body{position:fixed;margin:0;inset:0;font:16px sans-serif}
    #modal{height:750px;overflow:auto}#root{margin-top:800px;width:160px;margin-left:190px;margin-bottom:600px}
    button{height:44px} [data-selectmenu-popup]{box-sizing:border-box}
    [role=listbox]{overflow:auto;padding:4px 0;box-sizing:border-box}
    [role=option]{display:flex;width:100%;padding:8px 12px;border:0}
  </style><div id="modal"><div id="root"></div></div>`);
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.locator('#modal').evaluate(el => { el.scrollTop = 260; });
  const trigger = page.getByRole('button', { name: 'hour', exact: true });
  await trigger.click();
  const popup = page.locator('[data-selectmenu-popup]');
  await expect(popup).toBeVisible();
  await expect.poll(async () => {
    const a = await trigger.boundingBox(), b = await popup.boundingBox();
    return a && b ? Math.abs(a.y - (b.y + b.height) - 6) : 999;
  }).toBeLessThan(3);
  await expect(page.locator('#modal')).toHaveJSProperty('scrollTop', 260);
  await page.getByRole('option', { name: 'project', exact: true }).click();
  await expect(popup).toHaveCount(0);
});
