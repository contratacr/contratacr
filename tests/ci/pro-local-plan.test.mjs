import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TRIGGER_GLOBS, classify, isRelevant, parseDispatch, plan, specFilters, FULL_SHARDS } from '../../scripts/ci/pro-local-plan.mjs';
const c = (status, ...paths) => paths.map(path => ({ path, status }));
const workflow = readFileSync('.github/workflows/pro-local-regression.yml', 'utf8');

test('workflow push paths equal the selector trigger list', () => {
  const block = workflow.match(/push:\n\s+branches:\n\s+- test\n\s+paths:\n((?:\s+- .+\n)+)/);
  assert.ok(block, 'push.paths block missing');
  const paths = block[1].split('\n').filter(Boolean).map(l => l.replace(/^\s+- /, '').replace(/^"|"$/g, ''));
  assert.deepEqual(paths, TRIGGER_GLOBS);
});
test('workflow keeps the reviewed contract', () => {
  for (const text of ['playwright.pro-local.config.ts', 'PLAYWRIGHT_BASE_URL: http://127.0.0.1:3185', 'next build --webpack', 'next start -H 127.0.0.1 -p 3185', 'scripts/ci/pro-local-plan.mjs', 'test:e2e:verify-results', 'group: contratacr-pro-local-regression']) assert.ok(workflow.includes(text), text);
  assert.ok(!/\n\s+pull_request/.test(workflow) && !/\n\s+schedule:/.test(workflow));
});
test('irrelevant files never trigger Pro', () => {
  for (const p of ['docs/regression-testing.md', 'src/app/page.tsx', 'tests/e2e/services.spec.ts', 'messages/es.json']) assert.equal(isRelevant(p), false, p);
  for (const p of ['src/lib/pro/enabled.ts', 'src/app/api/pro/access/route.ts', 'src/app/[locale]/dashboard/pro/page.tsx', 'supabase/migrations/400_x.sql', 'tests/e2e/pro-projects.spec.ts', 'tests/e2e/helpers/chat.ts']) assert.equal(isRelevant(p), true, p);
});
test('only unrelated changes select nothing', () => assert.equal(classify(c('M', 'docs/x.md', 'src/app/page.tsx')).mode, 'none'));
test('modified or added Pro specs select exactly those specs', () => {
  const p = classify([...c('M', 'tests/e2e/pro-b.spec.ts'), ...c('A', 'tests/e2e/pro-a.spec.ts'), ...c('M', 'docs/x.md')]);
  assert.equal(p.mode, 'specs'); assert.deepEqual(p.specs, ['tests/e2e/pro-a.spec.ts', 'tests/e2e/pro-b.spec.ts']);
});
test('deleted-only Pro specs select nothing; deletions do not widen', () => {
  assert.equal(classify(c('D', 'tests/e2e/pro-a.spec.ts')).mode, 'none');
  assert.equal(classify([...c('D', 'tests/e2e/pro-a.spec.ts'), ...c('M', 'tests/e2e/pro-b.spec.ts')]).mode, 'specs');
});
for (const p of ['src/lib/pro/x.ts', 'supabase/migrations/400_x.sql', 'docs/pro/sql/x.sql', 'tests/e2e/pro-local-stable-runtime.ts', 'tests/e2e/seed.ts', 'playwright.pro-local.config.ts', 'package-lock.json', '.github/workflows/pro-local-regression.yml'])
  test(`shared input ${p} runs the full suite`, () => assert.equal(classify([...c('M', p), ...c('M', 'tests/e2e/pro-a.spec.ts')]).mode, 'full'));
test('no compatible baseline or too many specs runs full', () => {
  assert.equal(classify(c('M', 'tests/e2e/pro-a.spec.ts'), { baseline: false }).mode, 'full');
  assert.equal(classify(Array.from({ length: 31 }, (_, i) => ({ path: `tests/e2e/pro-s${i}.spec.ts`, status: 'M' }))).mode, 'full');
});
test('plan: push without baseline is full with every shard', () => {
  const p = plan({ EVENT_NAME: 'push', BASE_SHA: '' });
  assert.equal(p.mode, 'full'); assert.equal(p.matrix.length, FULL_SHARDS); assert.equal(p.filters, '');
});
test('plan: focused push builds anchored escaped filters', () => {
  const p = plan({ EVENT_NAME: 'push', BASE_SHA: 'a', HEAD_SHA: 'b' }, () => true, () => c('M', 'tests/e2e/pro-a.spec.ts'));
  assert.equal(p.mode, 'specs'); assert.equal(p.filters, 'tests/e2e/pro-a\\.spec\\.ts$'); assert.equal(p.matrix.length, 1);
});
test('plan: nothing selected yields an empty matrix', () => {
  const p = plan({ EVENT_NAME: 'push', BASE_SHA: 'a' }, () => true, () => c('M', 'docs/x.md'));
  assert.equal(p.mode, 'none'); assert.deepEqual(p.matrix, []);
});
test('manual dispatch: full, or validated specs only', () => {
  assert.equal(parseDispatch('full', '').mode, 'full');
  assert.deepEqual(parseDispatch('selected', 'pro-a, tests/e2e/pro-b.spec.ts', () => true).specs, ['tests/e2e/pro-a.spec.ts', 'tests/e2e/pro-b.spec.ts']);
  for (const bad of ['', 'services', 'pro-a;echo x', '../pro-a', 'pro-a --project=x']) assert.throws(() => parseDispatch('selected', bad, () => true), bad);
  assert.throws(() => parseDispatch('selected', 'pro-missing', () => false));
});
test('spec filters reject unsafe paths', () => {
  for (const bad of [[], ['tests/e2e/services.spec.ts'], ['tests/e2e/pro-a.spec.ts;x'], null]) assert.throws(() => specFilters(bad));
});
