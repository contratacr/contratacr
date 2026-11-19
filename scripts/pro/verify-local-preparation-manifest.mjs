/** Offline exhaustive manifest/dependency check. No services, bootstrap or DB execution. */
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {localSqlManifest,localSqlDependencies} from './local-sql-manifest.mjs';
const root=new URL('../../',import.meta.url),files=(await readdir(new URL('docs/pro/sql/',root))).filter(v=>v.endsWith('.sql')).sort();
export function verifyManifest(steps){
 const names=steps.map(step=>step.file);
 for(const step of steps){assert.match(step.file,/^[a-z][a-z-]+\.sql$/);assert.deepEqual(Object.keys(step).filter(k=>!['file','ifMissing','repeat'].includes(k)),[]);}
 assert.deepEqual([...new Set(names)].sort(),files,'Every local SQL file must have an explicit installer.');
 for(const file of files)assert.equal(names.filter(n=>n===file).length,file==='catalog-item-types-local.sql'?2:1,'Unexpected missing/duplicate '+file);
 const repeated=steps.filter(s=>s.repeat);assert.equal(repeated.length,1);assert.equal(repeated[0].file,'catalog-item-types-local.sql');assert.ok(repeated[0].repeat.length>20);
 assert.deepEqual(steps.filter(s=>s.ifMissing).map(s=>[s.file,s.ifMissing]),[['memberships-draft.sql','public.pro_memberships'],['catalog-storage-draft.sql','public.pro_workspace_core'],['panel-storage-draft.sql','public.pro_work']]);
 for(const[before,after]of localSqlDependencies){assert.ok(names.includes(before)&&names.includes(after));assert.ok(names.lastIndexOf(before)<names.indexOf(after),before+' must finish before '+after);}
 assert.ok(names.lastIndexOf('catalog-item-types-local.sql')>names.indexOf('invoice-special-expanded-local.sql'),'Post-invoice stock guard must run after invoice tables.');
 return names;
}
const names=verifyManifest(localSqlManifest);
const bootstrap=await readFile(new URL('scripts/pro/prepare-supabase-local.mjs',root),'utf8');
assert.match(bootstrap,/import \{localSqlManifest\} from '\.\/local-sql-manifest\.mjs'/);
assert.match(bootstrap,/for\(const step of localSqlManifest\)/);
assert.match(bootstrap,/step\.ifMissing/);
assert.match(bootstrap,/--file=docs\/pro\/sql\/.*step\.file/);
assert.ok(bootstrap.indexOf('for(const step of localSqlManifest)')<bootstrap.indexOf("await writeFile('.env.test'"),'Write env only after complete SQL installation.');
// Negative tests verify omissions, duplicate files, guard drift, order and unchecked file additions fail.
for(const file of files)assert.throws(()=>verifyManifest(localSqlManifest.filter(step=>step.file!==file)));
assert.throws(()=>verifyManifest([...localSqlManifest,localSqlManifest.at(-1)]));
assert.throws(()=>verifyManifest(localSqlManifest.map(step=>step.ifMissing?{...step,ifMissing:'public.wrong'}:step)));
for(const[before,after]of localSqlDependencies){const copy=[...localSqlManifest],index=copy.findIndex(s=>s.file===after),[moved]=copy.splice(index,1);copy.splice(copy.findIndex(s=>s.file===before),0,moved);assert.throws(()=>verifyManifest(copy));}
console.log(`PASS: ${files.length} SQL modules, ${names.length} ordered steps, ${localSqlDependencies.length} dependencies, guard/repeat contracts and negative cases; offline only.`);
