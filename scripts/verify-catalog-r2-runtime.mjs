import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

// Exercise the production catalogue implementation with the real local R2
// runtime. No credentials, remote requests, database writes or deployments.
const entry = fileURLToPath(new URL('../src/lib/data/approved-catalog-cache.ts', import.meta.url));
const result = await build({
  stdin: { contents: `import { getApprovedCatalog, refreshApprovedCatalog } from ${JSON.stringify(entry)};
    export default { async fetch(request, env) {
      globalThis.__testEnv = env;
      const url = new URL(request.url);
      if (url.pathname === '/edit') { globalThis.__label = 'Edited'; await refreshApprovedCatalog(); }
      return Response.json({ catalog: await getApprovedCatalog(), builds: globalThis.__builds });
    }};`, resolveDir: process.cwd() },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
  define: { 'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify('https://runtime-test.supabase.co') },
  plugins: [{ name: 'isolated-catalogue-runtime', setup(plugin) {
    plugin.onResolve({ filter: /^(server-only|next\/cache|@opennextjs\/cloudflare)$/ }, args => ({ path: args.path, namespace: 'test' }));
    plugin.onResolve({ filter: /^\.\/approved-catalog$/ }, () => ({ path: 'builder', namespace: 'test' }));
    plugin.onResolve({ filter: /^@\/lib\/promise-timeout$/ }, () => ({ path: fileURLToPath(new URL('../src/lib/promise-timeout.ts', import.meta.url)) }));
    plugin.onLoad({ filter: /.*/, namespace: 'test' }, ({ path }) => ({ contents: path === 'server-only' ? ''
      : path === 'next/cache' ? 'export const unstable_cache = fn => fn; export function revalidateTag() { throw new Error("R2 binding not used"); }'
      : path === '@opennextjs/cloudflare' ? 'export function getCloudflareContext() { return { env: globalThis.__testEnv }; }'
      : 'export async function buildApprovedCatalog() { globalThis.__builds = (globalThis.__builds ?? 0) + 1; return { categories: [{ id: "example", label: globalThis.__label ?? "Original" }], categoryFlags: [], groups: [] }; }' }));
  } }],
});
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: result.outputFiles[0].text, compatibilityDate: '2026-07-29', r2Buckets: ['NEXT_INC_CACHE_R2_BUCKET'] }));
try {
  const read = async path => (await mf.dispatchFetch(`http://local.test/${path}`)).json();
  const first = await read(''); assert.equal(first.builds, 1);
  const second = await read(''); assert.equal(second.builds, 1);
  const edited = await read('edit'); assert.equal(edited.builds, 2); assert.equal(edited.catalog.categories[0].label, 'Edited');
  const bucket = await mf.getR2Bucket('NEXT_INC_CACHE_R2_BUCKET');
  const key = 'public-catalog/v1/runtime-test.supabase.co.json';
  const stored = await bucket.get(key); assert.ok(stored);
  assert.equal(await bucket.put(key, 'outdated', { onlyIf: { etagDoesNotMatch: '*' } }), null);
  assert.equal(await bucket.put(key, 'outdated', { onlyIf: { etagMatches: 'wrong-etag' } }), null);
  const snapshot = await stored.json(); snapshot.expiresAt = 0;
  await bucket.put(key, JSON.stringify(snapshot));
  const expired = await read(''); assert.equal(expired.builds, 3);
  console.log('R2 runtime: cache reuse, admin publication, expiration and conditional writes verified.');
} finally {
  await mf.dispose();
}
