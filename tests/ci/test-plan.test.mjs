import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, nativeSpecs } from '../../scripts/ci/test-plan.mjs';
import { readFileSync } from 'node:fs';
const changed = (...paths) => paths.map(path => ({ path, status: 'M' }));
for (const path of ['AGENTS.md', 'docs/mobile-release-history.md', 'docs/test-selection-policy.md']) {
  test(`reviewed document ${path} avoids heavy work`, () => {
    const p = classify(changed(path));
    assert.equal(p.scope, 'documents');
    for (const k of ['regression', 'security', 'mobile', 'deploy']) assert.equal(p[k], false);
  });
}
for (const path of ['docs/generated.md', 'src/app/page.tsx', 'src/app/layout.tsx', 'src/content/help.md',
  'package-lock.json', 'supabase/migrations/20261026000000_change.sql', 'tests/e2e/helpers/chat.ts',
  'playwright.config.ts', 'android/app/build.gradle', 'ios/App/App/Info.plist', 'mystery.file',
  'scripts/ci/test-plan.mjs', '.github/workflows/ci-test-plan.yml']) {
  test(`conservative fallback for ${path}`, () => {
    const p = classify(changed(path));
    assert.equal(p.scope, 'broad');
    for (const k of ['regression', 'security', 'mobile', 'deploy']) assert.equal(p[k], true);
  });
}
test('modified web spec selects complete spec without unrelated native/deploy/security', () => {
  const p = classify(changed('tests/e2e/services.spec.ts', 'docs/mobile-release-history.md'));
  assert.equal(p.scope, 'specs');assert.equal(p.regression, true);
  assert.deepEqual(p.webSpecs, ['tests/e2e/services.spec.ts']);
  assert.equal(p.mobile, false);assert.equal(p.deploy, false);assert.equal(p.security, false);
});
test('shared web/native spec keeps both distinct configurations', () => {
  const p = classify(changed('tests/e2e/native-social-access.spec.ts'));
  assert.equal(p.regression, true);assert.equal(p.mobile, true);
});
test('native-only spec cannot disappear in main config testIgnore', () => {
  const p = classify(changed('tests/e2e/direct-chat.spec.ts'));
  assert.equal(p.regression, false);assert.equal(p.mobile, true);
});
for (const status of ['A','D','R100']) test(`test status ${status} broadens safely`, () => {
  assert.equal(classify([{ path:'tests/e2e/services.spec.ts',status }]).scope, 'broad');
});
test('imported specs are shared fixtures', () => {
  assert.equal(classify(changed('tests/e2e/services.spec.ts'),{importedSpecs:['tests/e2e/services.spec.ts']}).scope,'broad');
});
test('failed/missing baseline cannot skip even documentation', () => {
  assert.equal(classify(changed('AGENTS.md'),{baseline:false}).scope,'broad');
});
test('manual and periodic runs always preserve broad coverage', () => {
  assert.equal(classify(changed('AGENTS.md'),{force:true}).scope,'broad');
});
test('empty diff reuses compatible baseline', () => assert.equal(classify([]).scope,'documents'));
test('mixed runtime and documentation is never a doc skip', () => {
  assert.equal(classify(changed('AGENTS.md','src/app/page.tsx')).scope,'broad');
});
test('native selection stays synchronized with actual mobile config', () => {
  const s=readFileSync('playwright.mobile.config.ts','utf8');
  const specs=[...s.matchAll(/"\*\*\/(.+\.spec\.ts)"/g)].map(m=>m[1]).filter(n=>!n.startsWith('.tmp'));
  assert.deepEqual([...nativeSpecs].sort(),specs.map(n=>`tests/e2e/${n}`).sort());
});

// Run the real CLI in an ordinary disposable Git repository (not a worktree
// or branch of ContrataCR). Stub only GitHub's read-only baseline response.
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
const cli = resolve('scripts/ci/test-plan.mjs');
test('real CLI accumulates changes since last successful run, emits evidence and fails closed on API failure', () => {
  const dir=mkdtempSync(join(tmpdir(),'ccr-plan-test-'));
  const g=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  try {
    g('init','-q');g('config','user.email','ci@example.invalid');g('config','user.name','CI');
    mkdirSync(join(dir,'src'),{recursive:true});writeFileSync(join(dir,'src/main.ts'),'base');
    g('add','.');g('commit','-qm','base');const base=g('rev-parse','HEAD');
    writeFileSync(join(dir,'src/main.ts'),'unvalidated runtime change');g('add','.');g('commit','-qm','failed push');const failed=g('rev-parse','HEAD');
    writeFileSync(join(dir,'AGENTS.md'),'documentation');g('add','.');g('commit','-qm','docs after failure');
    const event=join(dir,'event.json'),out=join(dir,'output'),summary=join(dir,'summary');
    writeFileSync(event,JSON.stringify({before:failed}));
    const env={...process.env,GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'test/example',GITHUB_REF_NAME:'test',GITHUB_RUN_ID:'5',GH_TOKEN:'fake',PLAN_WORKFLOW:'regression-tests.yml',PLAN_KIND:'regression',GITHUB_OUTPUT:out,GITHUB_STEP_SUMMARY:summary};
    const stub=join(dir,'fetch.mjs');
    writeFileSync(stub,`globalThis.fetch=async()=>({ok:true,json:async()=>({workflow_runs:[{id:4,head_sha:'${base}',html_url:'https://example.invalid/run/4'}]})});`);
    let r=spawnSync(process.execPath,['--import',stub,cli],{cwd:dir,env,encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    let p=JSON.parse(readFileSync(join(dir,'ci-test-plan.json'),'utf8'));
    assert.equal(p.base,base);assert.equal(p.scope,'broad');assert.ok(p.paths.includes('src/main.ts'));
    assert.match(readFileSync(out,'utf8'),/run=true/);assert.match(readFileSync(summary,'utf8'),/Automatic test plan/);
    // A known green runtime revision permits documentation-only omission.
    writeFileSync(stub,`globalThis.fetch=async()=>({ok:true,json:async()=>({workflow_runs:[{id:4,head_sha:'${failed}',html_url:'https://example.invalid/run/4'}]})});`);
    r=spawnSync(process.execPath,['--import',stub,cli],{cwd:dir,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    p=JSON.parse(readFileSync(join(dir,'ci-test-plan.json'),'utf8'));assert.equal(p.scope,'documents');assert.equal(p.regression,false);
    writeFileSync(stub,'globalThis.fetch=async()=>({ok:false,status:403});');
    r=spawnSync(process.execPath,['--import',stub,cli],{cwd:dir,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
    p=JSON.parse(readFileSync(join(dir,'ci-test-plan.json'),'utf8'));assert.equal(p.scope,'broad');assert.equal(p.regression,true);assert.match(p.lookupError,/403/);
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

import { selectedArgs } from '../../scripts/ci/run-selected-specs.mjs';
test('runner uses literal anchored filters and the native config', () => {
  assert.deepEqual(selectedArgs(['tests/e2e/direct-chat.spec.ts'],true),
    ['playwright','test','--config=playwright.mobile.config.ts','tests/e2e/direct-chat\\.spec\\.ts$']);
});
for (const specs of [[],['--project=anything'],['tests/e2e/../../secret.spec.ts'],['tests/e2e/foo.spec.ts;echo injected'],null]) {
  test(`runner rejects missing or unsafe selection ${JSON.stringify(specs)}`, () => assert.throws(()=>selectedArgs(specs)));
}
