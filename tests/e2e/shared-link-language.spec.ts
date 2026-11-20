import { test, expect } from "playwright/test";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { NextRequest } from "next/server";

let temporary: string;
let middleware: (request: NextRequest) => Promise<Response>;
test.beforeAll(async () => {
  temporary = mkdtempSync(join(process.cwd(), '.tmp-share-locale-'));
  const file = join(temporary, 'middleware.cjs');
  await build({ entryPoints:['src/middleware.ts'], outfile:file, bundle:true, platform:'node', format:'cjs', external:['next/*','react','react-dom','@supabase/ssr'], tsconfig:'tsconfig.json' });
  middleware = createRequire(join(process.cwd(), 'package.json'))(file).middleware;
});
test.afterAll(() => { if (temporary) rmSync(temporary, {recursive:true,force:true}); });

for (const path of ['/isaac-alberto-sanchez-monge?tab=resenas', '/@isaac-alberto-sanchez-monge', '/e/abcd1234', '/p/abcd1234', '/o/abcd1234']) {
  test(`shared ${path} stays Spanish with English browser and saved locale`, async () => {
    const response = await middleware(new NextRequest(`https://contratacr.com${path}`, { headers: { 'accept-language':'en-US,en;q=0.9', cookie:'NEXT_LOCALE=en; ccr_locale_elegido=1' } }));
    const target = new URL(response.headers.get('x-middleware-rewrite')!);
    expect(target.pathname).toMatch(/^\/es\//);
    expect(response.headers.get('x-middleware-request-x-next-intl-locale')).toBe('es');
    expect(target.search).toBe(new URL(`https://contratacr.com${path}`).search);
  });
}

test('explicit English profile keeps English metadata routing', async () => {
  const request = new NextRequest('https://contratacr.com/en/profesionales/isaac-sanchez-monge-12345678', { headers:{'accept-language':'es-CR'} });
  const response = await middleware(request);
  expect(request.headers.get('x-ccr-locale')).toBe('en');
  expect(response.headers.get('location')).toBeNull();
  expect(response.status).toBe(200);
});
