import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../src/lib/queries/professionals.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function setup({ signedIn = false, oldSchema = false, banned = false } = {}) {
  const queries = [];
  let revision = "test";
  const metadata = { portfolio_items: [{ url: 'https://assets.example/work.jpg' }], allow_phone_call: true, coverage_country: true, certifications: [{ name: 'Certification' }], call_phone: '88888888', social_links: { instagram: 'https://instagram.com/example' } };
  const row = { id: 'pro', slug: 'example', profile_id: 'owner', profiles: { full_name: 'Example' }, professions: ['plomeria'], reviews: [], services: [], portfolio_urls: [] };
  function from(table) {
    let columns = '';
    const builder = {
      select(value) { columns = value; queries.push({ table, columns }); return builder; },
      eq() { return builder; },
      async maybeSingle() {
        if (columns === 'is_banned') return { data: { is_banned: banned } };
        if (columns === 'contact_email') {
          assert.ok(signedIn, 'Anonymous readers must never query protected email');
          return { data: { contact_email: 'contact@example.com' } };
        }
        if (columns.includes('profiles(full_name')) return { data: row };
        if (oldSchema && columns.includes('portfolio_items,')) return { error: { message: 'missing column' } };
        return { data: metadata };
      },
      then(resolve) { return Promise.resolve({ data: [], count: 3 }).then(resolve); },
    };
    return builder;
  }
  const publicClient = { from };
  const sessionClient = { from, auth: { getSession: async () => ({ data: { session: signedIn ? { access_token: 'test' } : null } }) } };
  const exports = {};
  const cached = new Map();
  vm.runInNewContext(source, {
    exports, console, setTimeout, clearTimeout,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test' } },
    require(name) {
      if (name === '@/lib/cache/professional-revision') return { professionalRevision: async () => revision };
      if (name === 'react') return { cache: fn => fn };
      if (name === 'next/cache') return { unstable_cache: fn => async (...args) => {
        const key = JSON.stringify(args); if (!cached.has(key)) cached.set(key, await fn(...args)); return cached.get(key);
      } };
      if (name === '@/lib/supabase/server') return { createPublicClient: async () => publicClient, createClient: async () => sessionClient };
      if (name === '@/lib/supabase/admin') return {};
      if (name === '@/lib/data/categories') return { getCategoryLabel: id => id, supportsVideoConsultCategory: () => false };
      if (name === '@/lib/data/cr-geography') return { getProvinceById: id => ({ name: id }), PROVINCES: [] };
      if (name === '@/lib/pricing') return { deriveDisplayPricing: () => ({ type: 'quote' }) };
      if (name === '@/lib/text/repair-visible-text') return { repairVisibleText: value => value };
      if (name === '@/lib/cloudinary') return { cldThumb: value => value };
      if (name === '@/lib/promise-timeout') return { withPromiseTimeout: p => p };
      // Nearby ranking is used by search, not by the profile-detail queries
      // exercised here. Keep this harness isolated from catalogue/geography IO.
      if (name === '@/lib/data/languages' || name === '@/lib/search/ranking' || name === '@/lib/search/nearby') return {};
      throw new Error(name);
    },
  });
  return { api: exports, queries, metadata, row, revise: () => { revision = "updated"; } };
}
test('a cold anonymous profile uses five reads, preserves metadata and never probes protected email', async () => {
  const s = setup(); const result = await s.api.getProfessionalBySlug('example');
  assert.ok(result); assert.equal(s.queries.length, 5);
  assert.equal(result.portfolioItems[0].url, s.metadata.portfolio_items[0].url);
  assert.equal(result.callPhone, s.metadata.call_phone); assert.equal(result.coverage.country, true);
  assert.equal(result.certifications[0].name, 'Certification'); assert.equal(result.socialLinks.instagram, s.metadata.social_links.instagram);
  assert.equal(result.contactEmail, undefined);
});
test('a warm anonymous profile needs only the live suspension check', async () => {
  const s = setup(); await s.api.getProfessionalBySlug('example'); s.queries.length = 0;
  await s.api.getProfessionalBySlug('example'); assert.equal(s.queries.length, 1);
  assert.equal(s.queries[0].columns, 'is_banned');
});
test('signed-in viewers retain contact email outside the public cache', async () => {
  const s = setup({ signedIn: true }); const result = await s.api.getProfessionalBySlug('example');
  assert.equal(result.contactEmail, 'contact@example.com');
  assert.equal(s.queries.filter(q => q.columns === 'contact_email').length, 1);
});
test('a suspended profile stays hidden even when the public profile is cached', async () => {
  const s = setup({ banned: true }); assert.equal(await s.api.getProfessionalBySlug('example'), null);
});
test('the grouped metadata query retains the previous compatibility fallback', async () => {
  const s = setup({ oldSchema: true }); const result = await s.api.getProfessionalBySlug('example');
  assert.equal(result.callPhone, '88888888'); assert.equal(result.portfolioItems.length, 1);
  assert.equal(result.certifications.length, 1); assert.equal(result.coverage.country, true);
});

test('an admin revision makes the previously cached profile unreachable', async () => {
  const s = setup();
  assert.equal((await s.api.getProfessionalBySlug('example')).fullName, 'Example');
  s.row.profiles.full_name = 'Corrected name';
  assert.equal((await s.api.getProfessionalBySlug('example')).fullName, 'Example');
  s.revise();
  assert.equal((await s.api.getProfessionalBySlug('example')).fullName, 'Corrected name');
});
