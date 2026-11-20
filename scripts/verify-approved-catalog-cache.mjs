import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL('../src/lib/data/approved-catalog-cache.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const catalog = (name = 'Original') => ({ categories: [{ id: 'service', label: name }], groups: [], categoryFlags: [] });
function setup({ r2 = true } = {}) {
  let time = 100000, stored = null, etag = 0, builds = 0;
  let build = async () => catalog();
  const bucket = {
    async get() { const entry = stored; return entry && { etag: String(entry.etag), json: async () => JSON.parse(entry.value) }; },
    async put(key, value, { onlyIf }) {
      if (onlyIf.etagMatches && String(stored?.etag) !== onlyIf.etagMatches) return null;
      if (onlyIf.etagDoesNotMatch === '*' && stored) return null;
      stored = { key, value, etag: ++etag }; return { etag };
    },
  };
  let nodeCache = null;
  const load = () => {
    const exports = {};
    vm.runInNewContext(source, {
      exports, Date: class extends Date { static now() { return time; } }, URL,
      process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test-project.supabase.co' } },
      console: { error() {} },
      require(name) {
        if (name === 'server-only') return {};
        if (name === 'next/cache') return {
          unstable_cache: fn => async (...args) => {
            if (!nodeCache || nodeCache.expires <= time) nodeCache = { value: await fn(...args), expires: time + 20000 };
            return nodeCache.value;
          },
          revalidateTag: () => { nodeCache = null; },
        };
        if (name === './approved-catalog') return { buildApprovedCatalog: async () => { builds++; return build(); } };
        if (name === '@/lib/promise-timeout') return { withPromiseTimeout: (p) => p };
        if (name === '@opennextjs/cloudflare') return { getCloudflareContext: async () => ({ env: r2 ? { NEXT_INC_CACHE_R2_BUCKET: bucket } : {} }) };
        throw new Error(name);
      },
    });
    return exports;
  };
  return { load, bucket, advance: () => { time += 20001; }, setBuild(fn) { build = fn; }, builds: () => builds, snapshot: () => stored && JSON.parse(stored.value) };
}
test('separate Worker instances reuse the same R2 snapshot without database reads', async () => {
  const s = setup(); await s.load().getApprovedCatalog(); await s.load().getApprovedCatalog();
  assert.equal(s.builds(), 1); assert.equal(s.snapshot().catalog.categories[0].label, 'Original');
});
test('expiry reloads the database; freshness is bounded', async () => {
  const s = setup(), api = s.load(); await api.getApprovedCatalog(); s.advance();
  s.setBuild(async () => catalog('Updated')); await api.getApprovedCatalog();
  assert.equal(s.builds(), 2); assert.equal(s.snapshot().catalog.categories[0].label, 'Updated');
});
test('admin refresh publishes immediately to another instance', async () => {
  const s = setup(), api = s.load(); await api.getApprovedCatalog();
  s.setBuild(async () => catalog('Edited')); await api.refreshApprovedCatalog();
  assert.equal((await s.load().getApprovedCatalog()).categories[0].label, 'Edited');
});
test('an earlier slow public refresh cannot overwrite a later admin edit', async () => {
  const s = setup(); const api = s.load(); await api.getApprovedCatalog(); s.advance();
  let release; const delayed = new Promise(resolve => { release = resolve; });
  s.setBuild(async () => delayed);
  const old = api.getApprovedCatalog();
  // Let the public request capture its old etag before publishing the edit.
  while (s.builds() < 2) await new Promise(resolve => setTimeout(resolve, 0));
  s.setBuild(async () => catalog('Admin')); await s.load().refreshApprovedCatalog();
  release(catalog('Old')); await old;
  assert.equal((await s.load().getApprovedCatalog()).categories[0].label, 'Admin');
});
test('failed database reads never poison the shared snapshot', async () => {
  const s = setup(), api = s.load(); await api.getApprovedCatalog(); s.advance();
  s.setBuild(async () => { throw new Error('database unavailable'); });
  await assert.rejects(api.getApprovedCatalog(), /database unavailable/);
  assert.equal(s.snapshot().catalog.categories[0].label, 'Original');
});
test('R2 failure falls back to the database', async () => {
  const s = setup(); s.bucket.get = async () => { throw new Error('R2 down'); };
  assert.equal((await s.load().getApprovedCatalog()).categories[0].label, 'Original');
});
test('local development caches completed values and refreshes after edits', async () => {
  const s = setup({ r2: false }), api = s.load(); await api.getApprovedCatalog(); await api.getApprovedCatalog();
  assert.equal(s.builds(), 1); s.setBuild(async () => catalog('Local edit'));
  await api.refreshApprovedCatalog(); assert.equal((await api.getApprovedCatalog()).categories[0].label, 'Local edit');
});
