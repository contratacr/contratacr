// Launch without Pro (2026-11-18): «Mi negocio» must work with PRO_ENABLED=false. Offline checks:
// 1. With PRO_ENABLED=false and NODE_ENV=production, the Pro launch flag is off and no «Mi negocio» path is a Pro-only path
//    (the middleware 404s only isProOnlyPath), while /dashboard/pro and /api/pro stay closed.
// 2. The «Mi negocio» routes/pages never call the Pro gates (proApiAccess, proPlaceContext, proHasModule, pro_entitled,
//    proPageWorkspace, proActor, the Pro workspace member) — they authorize with the place claim (business-access.ts).
// 3. The only PRO_ENABLED use there is the optional Pro company-member path of the review reply.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=new URL('../../',import.meta.url).pathname;
async function files(dir){const out=[];for(const e of await readdir(join(root,dir),{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())out.push(...await files(p));else if(/\.tsx?$/.test(e.name))out.push(p);}return out;}

test('PRO_ENABLED=false: Pro closed, «Mi negocio» paths open',()=>{
 const code=`import('${join(root,'src/lib/pro/enabled.ts')}').then(m=>console.log(JSON.stringify({on:m.PRO_ENABLED,paths:['/dashboard/negocio','/dashboard/negocio/menu','/api/negocio','/api/negocio/respuestas','/dashboard/pro/menu','/api/pro/menu'].map(p=>m.isProOnlyPath(p))})))`;
 const r=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,PRO_ENABLED:'false',NODE_ENV:'production'}});
 assert.equal(r.status,0,r.stderr);
 assert.deepEqual(JSON.parse(r.stdout),{on:false,paths:[false,false,false,false,true,true]});
});

test('«Mi negocio» code never goes through the Pro gates',async()=>{
 const list=[...await files('src/app/api/negocio'),...await files('src/app/[locale]/dashboard/negocio'),'src/lib/directory/business-access.ts','src/lib/directory/business-page.ts',
  'src/components/directory/business-profile-editor.tsx','src/components/directory/business-nav.tsx','src/components/directory/business-dashboard-entry.tsx'];
 assert.ok(list.length>=12,'files: '+list.length);
 const FORBIDDEN=/proApiAccess|proPlaceContext|proHasModule|pro_entitled|proPageWorkspace|proActor\b|proWorkspaceMember|pro-place-hub|api-access-module|workspace-user/;
 for(const f of list){const t=(await readFile(join(root,f),'utf8')).replace(/^\s*\/\/.*$/gm,'');assert.doesNotMatch(t,FORBIDDEN,f);
  if(/PRO_ENABLED/.test(t))assert.equal(f,'src/app/api/negocio/respuestas/route.ts','PRO_ENABLED only in the optional member path');}
 for(const f of list.filter(f=>f.startsWith('src/app/api/negocio')))assert.match(await readFile(join(root,f),'utf8'),/dirEnabledOnly\(\)/,f+' gated by DIR_ENABLED');
 for(const f of list.filter(f=>f.includes('dashboard/negocio')))assert.match(await readFile(join(root,f),'utf8'),/businessPage\(/,f+' gated by businessPage (DIR_ENABLED + sign-in)');
 assert.match(await readFile(join(root,'src/lib/directory/business-page.ts'),'utf8'),/if\(!DIR_ENABLED\)notFound\(\)/);
 assert.doesNotMatch(await readFile(join(root,'src/components/directory/place-review-actions.tsx'),'utf8'),/\/api\/pro\//,'owner reply editor uses /api/negocio/respuestas');
});
