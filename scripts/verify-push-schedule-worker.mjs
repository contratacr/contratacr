// Execute the real Worker entry with only OpenNext replaced by an isolated sink.
// No Supabase, Firebase, credentials or network delivery are used.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const config = ts.parseConfigFileTextToJson('wrangler.jsonc', fs.readFileSync('wrangler.jsonc', 'utf8')).config;
assert.equal(config.main, 'cloudflare-worker.js');
assert.deepEqual(config.triggers.crons, ['* * * * *']);

const bundled = await build({
  entryPoints: [config.main], bundle: true, write: false, format: 'esm', platform: 'browser',
  plugins: [{
    name: 'isolated-next',
    setup(builder) {
      builder.onResolve({ filter: /\.open-next\/worker\.js$/ }, () => ({ path: 'mock-next', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({
        loader: 'js',
        contents: `
          let calls = 0;
          export class DOQueueHandler {}
          export default {
            async fetch(request) {
              if (new URL(request.url).pathname === '/metrics') return Response.json({ calls });
              calls++;
              if (request.url !== 'https://contratacr.com/api/internal/push/drain'
                || request.method !== 'POST'
                || request.headers.get('authorization') !== 'Bearer isolated-test-secret'
                || JSON.stringify(await request.json()) !== '{"limit":100}') {
                return new Response('', { status: 401 });
              }
              return Response.json({ ok: true, failed: 0, retried: 0, disabled: false });
            }
          };
        `,
      }));
    },
  }],
});
const runtime = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  script: bundled.outputFiles[0].text,
  compatibilityDate: config.compatibility_date,
  bindings: {
    NEXT_PUBLIC_APP_URL: 'https://contratacr.com',
    PUSH_DELIVERY_ENABLED: 'true',
    CRON_SECRET: 'isolated-test-secret',
  },
}));
try {
  const worker = await runtime.getWorker();
  await worker.scheduled({ cron: config.triggers.crons[0] });
  assert.equal((await (await worker.fetch('https://test.invalid/metrics')).json()).calls, 1);
  console.log('PASS: actual workerd scheduled event invokes authenticated local drain; fetch delegation preserved; no external service used.');
} finally {
  await runtime.dispose();
}
