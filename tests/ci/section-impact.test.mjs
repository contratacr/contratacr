import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dependencyGraph, entrySuites, sectionSuites, sectionImpact, gitSnapshot } from '../../scripts/ci/section-impact.mjs';
import { classify } from '../../scripts/ci/test-plan.mjs';
const changed = (...paths) => paths.map(path=>({path,status:'M'}));
const jobs='src/components/jobs/board.tsx';
const page='src/app/[locale]/empleos/page.tsx';
function snapshot(extra={}) {
  const files=new Map([...new Set([...entrySuites,...Object.values(sectionSuites).flat()])].map(name=>[`tests/e2e/${name}.spec.ts`,{source:''}]));
  for(const [path,source] of Object.entries({[jobs]:'export default 1;',[page]:"import Board from '@/components/jobs/board';",...extra}))files.set(path,{source});
  return files;
}
const impact=(files,paths=[jobs],before=files)=>sectionImpact(changed(...paths),before,files);
test('jobs select behavior, entry and native suites, not unrelated offers suites; runtime still builds/deploys/security',()=>{
  const result=impact(snapshot());assert.equal(result.safe,true);assert.deepEqual(result.sections,['empleos']);
  assert.ok(result.specs.includes('tests/e2e/marketplace-editors.spec.ts'));
  assert.ok(result.specs.includes('tests/e2e/mobile-native-shell.spec.ts'));
  assert.ok(!result.specs.includes('tests/e2e/search-offer-loading.spec.ts'));
  const plan=classify(changed(jobs),{impact:result});assert.equal(plan.scope,'sections');
  for(const flag of ['regression','mobile','security','deploy'])assert.equal(plan[flag],true);
  assert.ok(plan.mobileSpecs.includes('tests/e2e/mobile-native-shell.spec.ts'));
});
test('transitive barrel, type and literal dynamic imports retain all consumers in both revisions',()=>{
  const before=snapshot({'src/components/jobs/index.ts':"export {default} from './board';",[page]:"import Board from '@/components/jobs';",'src/app/[locale]/promociones/page.tsx':"const Board=import('@/components/jobs/board');"});
  const after=snapshot({'src/types/job.ts':`type B=typeof import('../components/jobs/board');`,[page]:"import type B from '@/types/job';",'src/app/[locale]/promociones/page.tsx':'export default 1;'});
  const result=impact(after,[jobs],before);assert.equal(result.safe,true);assert.deepEqual(result.sections,['empleos','promociones']);
  assert.ok(result.specs.includes('tests/e2e/search-offer-loading.spec.ts'));
});
test('URL-only tests and imported URL helpers are retained, unrelated section omitted',()=>{
  const files=snapshot({'tests/e2e/helpers/paths.ts':"export const url='/en/empleos?filter=all';",'tests/e2e/url-behavior.spec.ts':"import {url} from './helpers/paths';",'tests/e2e/other-section.spec.ts':"const url='/promociones';"});
  const result=impact(files);assert.equal(result.safe,true);
  assert.ok(result.specs.includes('tests/e2e/url-behavior.spec.ts'));assert.ok(!result.specs.includes('tests/e2e/other-section.spec.ts'));
});
test('inline compiled harness references and opaque computed test loaders cannot disappear',()=>{
  const files=snapshot({'tests/e2e/inline-harness.spec.ts':"const code=\"import Board from '@/components/jobs/board'\";",'tests/e2e/opaque.spec.ts':'const component=require(file);'});
  const result=impact(files);assert.equal(result.safe,true);
  for(const name of ['inline-harness','opaque'])assert.ok(result.specs.includes(`tests/e2e/${name}.spec.ts`));
});
test('Next implicit section layouts affect descendant routes, root layout affects global scope',()=>{
  const layout='src/app/[locale]/empleos/layout.tsx';const files=snapshot({[layout]:'export default 1;'});
  assert.equal(impact(files,[layout]).safe,true);
  assert.ok(impact(files,[layout]).roots.includes(page));
  const global='src/app/layout.tsx';files.set(global,{source:'export default 1;'});assert.equal(impact(files,[global]).safe,false);
});
for(const root of ['src/app/[locale]/page.tsx','src/app/api/jobs/route.ts','src/app/[locale]/admin/page.tsx','src/app/[locale]/new-section/page.tsx','src/app/[locale]/empleos/route.ts','src/app/[locale]/empleos/opengraph-image.tsx'])test(`unmapped/global consumer ${root} forces broad`,()=>{
  const result=impact(snapshot({[root]:"import Board from '@/components/jobs/board';"}));assert.equal(result.safe,false);assert.match(result.reason,/unmapped|Critical.shared/);
});
for(const path of ['src/components/mobile/shell.tsx','src/components/auth/gate.tsx','src/lib/supabase/client.ts','src/i18n/request.ts'])test(`critical input ${path} remains broad`,()=>{
  const files=snapshot({[path]:'export default 1;',[page]:`import value from '${path.replace('src/','@/').replace(/\.tsx?$/,'')}';`});assert.equal(impact(files,[path]).safe,false);
});
for(const source of ["import value from './missing';",'const data=import(path);','const broken = ('])test(`uncertain source graph falls back: ${source}`,()=>{
  assert.equal(impact(snapshot({[jobs]:source})).safe,false);
});
test('finite locale JSON load is recognized, arbitrary computed source load is not',()=>{
  const files=snapshot({'src/i18n/request.ts':'const messages=import(`../../messages/${locale}.json`);','messages/es.json':'{}','messages/en.json':'{}'});
  assert.deepEqual(dependencyGraph(files).uncertainties,[]);assert.equal(impact(files).safe,true);
  files.set('src/i18n/request.ts',{source:'const messages=import(`../../messages/${other}.json`);'});assert.equal(impact(files).safe,false);
});
test('cycles terminate and missing required behavior suite fails closed',()=>{
  const files=snapshot({[jobs]:"import './cycle';",'src/components/jobs/cycle.ts':"import './board';"});assert.equal(impact(files).safe,true);
  files.delete('tests/e2e/marketplace-lifecycle.spec.ts');assert.equal(impact(files).safe,false);
});
test('more than three sections does not narrow',()=>{
  const files=snapshot(Object.fromEntries(['promociones','proyectos','mensajes'].map(s=>[`src/app/[locale]/${s}/page.tsx`,"import Board from '@/components/jobs/board';"])));assert.equal(impact(files).safe,false);
});
test('unconsumed, new or deleted inputs do not narrow',()=>{
  const files=snapshot({'src/lib/orphan.ts':'export default 1;'});assert.equal(impact(files,['src/lib/orphan.ts']).safe,false);
  for(const status of ['A','D','R100'])assert.equal(sectionImpact([{path:jobs,status}],files,files).safe,false);
});
test('mixed fixtures, lock/config, new specs, manual or missing baseline cannot use safe section claim',()=>{
  const safe=impact(snapshot());
  for(const path of ['tests/e2e/helpers/fixture.ts','package-lock.json','playwright.config.ts','supabase/migrations/a.sql'])assert.equal(classify(changed(jobs,path),{impact:safe}).scope,'broad');
  assert.equal(classify([...changed(jobs),{path:'tests/e2e/new.spec.ts',status:'A'}],{impact:safe}).scope,'broad');
  assert.equal(classify(changed(jobs),{impact:safe,force:true}).scope,'broad');
  assert.equal(classify(changed(jobs),{impact:safe,baseline:false}).scope,'broad');
});
// This is a pinned graph fixture, not a constraint on future application wiring.
// A legitimate new/global consumer must select broad, not fail the planner tests.
test('validated application fixture narrows jobs but preserves broad homepage contact coverage',()=>{
  const files=gitSnapshot('7fa53f8f7a7dfad8af39d4f190844d66e9a37bd6');assert.deepEqual(dependencyGraph(files).uncertainties,[]);
  const result=sectionImpact(changed('src/components/jobs/jobs-board.tsx'),files,files);
  assert.equal(result.safe,true,result.reason);assert.deepEqual(result.sections,['empleos']);
  assert.ok(files.has('src/components/professionals/contact-button.tsx'));
  const shared=sectionImpact(changed('src/components/professionals/contact-button.tsx'),files,files);assert.equal(shared.safe,false);assert.match(shared.reason,/unmapped route consumer|Critical.shared/);
});

import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
test('real Git-to-CLI section plan emits complete engine lists and retains deployment/security',()=>{
  const cli=resolve('scripts/ci/test-plan.mjs'),dir=mkdtempSync(join(tmpdir(),'ccr-section-cli-'));
  const git=(...args)=>execFileSync('git',args,{cwd:dir,encoding:'utf8'}).trim();
  try {
    git('init','-q');git('config','user.email','ci@example.invalid');git('config','user.name','CI');
    for(const [path,file] of snapshot()){mkdirSync(dirname(join(dir,path)),{recursive:true});writeFileSync(join(dir,path),file.source);}
    for(const path of ['package.json','tsconfig.json','playwright.config.ts','playwright.mobile.config.ts'])writeFileSync(join(dir,path),readFileSync(resolve(path)));
    writeFileSync(join(dir,'tests/e2e/global-setup.ts'),'export default async function globalSetup() {}');
    git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
    writeFileSync(join(dir,jobs),'export default 2;');git('add','.');git('commit','-qm','jobs change');
    const event=join(dir,'event.json'),stub=join(dir,'fetch.mjs'),out=join(dir,'output');
    writeFileSync(event,'{}');writeFileSync(stub,`globalThis.fetch=async()=>({ok:true,json:async()=>({workflow_runs:[{id:4,head_sha:'${base}',html_url:'https://example.invalid/run/4'}]})});`);
    const env={...process.env,GITHUB_EVENT_PATH:event,GITHUB_EVENT_NAME:'push',GITHUB_REPOSITORY:'test/example',GITHUB_REF_NAME:'test',GITHUB_RUN_ID:'5',GH_TOKEN:'fake',PLAN_WORKFLOW:'regression-tests.yml',PLAN_KIND:'regression',GITHUB_OUTPUT:out};
    const result=spawnSync(process.execPath,['--import',stub,cli],{cwd:dir,env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const plan=JSON.parse(readFileSync(join(dir,'ci-test-plan.json'),'utf8'));
    assert.equal(plan.scope,'sections');assert.deepEqual(plan.impact.sections,['empleos']);
    assert.equal(plan.security,true);assert.equal(plan.deploy,true);
    assert.ok(plan.webSpecs.includes('tests/e2e/marketplace-lifecycle.spec.ts'));
    assert.ok(plan.mobileSpecs.includes('tests/e2e/marketplace-editors.spec.ts'));
    assert.match(readFileSync(out,'utf8'),/scope=sections/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

import { reviewedConfiguration } from '../../scripts/ci/section-impact.mjs';
for(const paths of [{'@/*':['./src/*'],'@jobs/*':['./src/components/jobs/*']},{'@/*':['./other/*']}])test(`unreviewed TS aliases cannot hide consumers: ${JSON.stringify(paths)}`,()=>{
  const files=snapshot({'tsconfig.json':JSON.stringify({compilerOptions:{paths}})});assert.equal(impact(files).safe,false);
});
for(const config of [{extends:'./other.json'},{compilerOptions:{baseUrl:'src'}},{compilerOptions:{rootDirs:['src','generated']}},{compilerOptions:{moduleResolution:'nodenext'}}])test(`unreviewed TS resolution broadens: ${JSON.stringify(config)}`,()=>{
  assert.equal(impact(snapshot({'tsconfig.json':JSON.stringify(config)})).safe,false);
});
test('reviewed TS aliases and Next configuration still permit section selection',()=>{
  const files=snapshot({'tsconfig.json':JSON.stringify({compilerOptions:{paths:{'@/*':['./src/*']}}}),'package.json':'{"dependencies":{"react":"19"}}'});
  files.set('next.config.ts',{hash:reviewedConfiguration['next.config.ts'],source:''});assert.equal(impact(files).safe,true);
  files.set('next.config.ts',{hash:'unreviewed',source:''});assert.equal(impact(files).safe,false);
});
for(const config of [{imports:{'#local':'./src/foo.ts'}},{exports:'./src/foo.ts'}])test(`package module alias broadens: ${JSON.stringify(config)}`,()=>{
  assert.equal(impact(snapshot({'package.json':JSON.stringify(config)})).safe,false);
});
for(const request of ['#internal','~/components/other','/src/components/other','file:///tmp/component.mjs','data:text/javascript,export default 1','https://example.invalid/module.js'])test(`unsupported local module path ${request} never counts as an external dependency`,()=>{
  assert.equal(impact(snapshot({[jobs]:`import value from '${request}';`})).safe,false);
});
for(const path of ['tests/ci/test-plan.test.mjs','tests/ci/section-impact.test.mjs'])test(`planner test-only edit ${path} keeps mandatory self-tests without app work`,()=>{
  const p=classify(changed(path,'docs/test-selection-policy.md'));assert.equal(p.scope,'planner-tests');
  for(const flag of ['regression','mobile','security','deploy'])assert.equal(p[flag],false);
  assert.equal(classify(changed(path,jobs)).scope,'broad');
  assert.equal(classify(changed(path),{importedSpecs:[path]}).scope,'broad');
  assert.equal(classify([{path,status:'A'}]).scope,'broad');
  assert.equal(classify(changed(path),{force:true}).scope,'broad');
  assert.equal(classify(changed(path),{baseline:false}).scope,'broad');
});


test('all plausible local extension candidates retain every consuming section',()=>{
  const files=snapshot({'src/components/jobs/board.ts':'export default 2;','src/app/[locale]/promociones/page.tsx':"import Board from '@/components/jobs/board.tsx';"});
  const result=impact(files);assert.equal(result.safe,true,result.reason);assert.deepEqual(result.sections,['empleos','promociones']);
});


test('source symlinks cannot hide route consumers behind a different Git path',()=>{
  const files=snapshot();files.set(jobs,{source:'./other.tsx',mode:'120000'});
  const result=impact(files);assert.equal(result.safe,false);assert.match(result.reason,/non-regular/);
});


test('embedded source Git links force broad rather than hiding nested routes',()=>{
  const files=snapshot();files.set('src/app/embedded',{source:'',mode:'160000'});assert.equal(impact(files).safe,false);
});
test('unmapped route names with control characters cannot disappear from the graph',()=>{
  const files=snapshot({'src/app/[locale]/other\nsection/page.tsx':"import Board from '@/components/jobs/board';"});assert.equal(impact(files).safe,false);
});


test('transitive implicit global entry consumers stay broad in either revision',()=>{
  const before=snapshot({'src/i18n/request.ts':"import Board from '@/components/jobs/board';"});
  const after=snapshot();const result=impact(after,[jobs],before);
  assert.equal(result.safe,false);assert.match(result.reason,/Critical.shared infrastructure consumer/);
});
test('a terminal application module with an unknown entry convention cannot hide behind a known page',()=>{
  const result=impact(snapshot({'src/app/[locale]/other/view.tsx':"import Board from '@/components/jobs/board';"}));
  assert.equal(result.safe,false);assert.match(result.reason,/Unmodeled application entry/);
});
test('an application wrapper flowing into its known page still narrows',()=>{
  const result=impact(snapshot({'src/app/[locale]/empleos/wrapper.tsx':"export {default} from '@/components/jobs/board';",[page]:"import Board from './wrapper';"}));
  assert.equal(result.safe,true,result.reason);assert.deepEqual(result.sections,['empleos']);
});
for(const source of ["const url=import.meta.url;","new Worker('/worker.js');","new SharedWorker('/worker.js');","new Function('return 1');","eval('code');","import {createRequire as load} from 'node:module';"])test(`unmodeled loader broadens: ${source}`,()=>{
  const result=impact(snapshot({[jobs]:source}));assert.equal(result.safe,false);
});
test('test-side module loader factories are retained even when calls use aliases',()=>{
  const files=snapshot({'tests/e2e/aliased-loader.spec.ts':"import {createRequire as loader} from 'node:module'; const load=loader(import.meta.url); const value=load(name);"});
  const result=impact(files);assert.equal(result.safe,true,result.reason);assert.ok(result.specs.includes('tests/e2e/aliased-loader.spec.ts'));
});


for(const pkg of [{workspaces:['packages/*']},{dependencies:{local:'file:../local'}},{dependencies:{local:'workspace:*'}},{overrides:{local:'./local'}}])test(`local project package resolution remains broad: ${JSON.stringify(pkg)}`,()=>{
  assert.equal(impact(snapshot({'package.json':JSON.stringify(pkg)})).safe,false);
});
test('a test importing unparsed project code is retained rather than losing its hidden inputs',()=>{
  const files=snapshot({'tools/helper.mjs':"import Board from '@/components/jobs/board';",'tests/e2e/outside-helper.spec.ts':"import '../../tools/helper.mjs';"});
  const result=impact(files);assert.equal(result.safe,true,result.reason);assert.ok(result.specs.includes('tests/e2e/outside-helper.spec.ts'));
});
test('runtime project code outside the analyzed namespace cannot hide route consumers',()=>{
  const files=snapshot({'tools/helper.mjs':'export default 1;',[jobs]:"import '../../../tools/helper.mjs';"});assert.equal(impact(files).safe,false);
});
test('source helper consumers in the configured shared setup and test config force broad',()=>{
  for(const setup of [true,false]){
    const files=snapshot();
    files.set('playwright.config.ts',{hash:reviewedConfiguration['playwright.config.ts'],source:setup?"export default {globalSetup:'./tests/e2e/global-setup.ts'};":"import Board from '@/components/jobs/board';"});
    if(setup)files.set('tests/e2e/global-setup.ts',{source:"import Board from '@/components/jobs/board';"});
    const result=impact(files);assert.equal(result.safe,false);assert.match(result.reason,/Critical.shared/);
  }
});
test('unknown global setup expressions and project dependency declarations cannot reduce coverage',()=>{
  for(const source of ["export default {globalSetup: setupFile};","export default {projects:[{name:'a',dependencies:['setup']}]};"]){
    const files=snapshot();files.set('playwright.config.ts',{hash:reviewedConfiguration['playwright.config.ts'],source});assert.equal(impact(files).safe,false);
  }
});
test('unsupported runner/context errors override spec and section reduction but not reviewed non-runtime documents',()=>{
  assert.equal(classify(changed('tests/e2e/services.spec.ts'),{analysisError:'unknown runner'}).scope,'broad');
  assert.equal(classify(changed(jobs),{impact:impact(snapshot()),analysisError:'unknown context'}).scope,'broad');
  assert.equal(classify(changed('AGENTS.md'),{analysisError:'unknown context'}).scope,'documents');
});
