#!/usr/bin/env node
// Pro demo seed (2026-11-28). Fills a FICTITIOUS demo company (demo-pro@contratacr.test, «Ejemplo») with example
// data for every Houzz Pro section, through the same schemas and database writers (RPCs) the /api/pro routes use.
//   * target "test": only the test project (oqheayqqprpciqdvdaqo), only from the test branch in CI
//     (workflow supabase-migrations.yml, input pro_demo). The production ref is refused by name.
//   * target "local": only the loopback stack http://127.0.0.1:54321, never in CI.
// Dry run by default (reads and counts only); --apply writes. Idempotent: deterministic ids, upserts, "create if
// missing" checks, so a rerun leaves the same counts. Never creates outbox/notification/reminder rows and no contact
// has a real e-mail or phone, so nothing is delivered to anyone.
// Usage: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… PRO_DEMO_TEST_PASSWORD=… TARGET_ENV=test \
//   node scripts/pro/demo/seed-pro-demo.mjs test [--apply] [--only core,leads,…] [--anchor 2026-12-01]
import {guardedTarget,adminClient,fail} from './lib.mjs';

// Order matters: team (custom roles) before planning; templates before finance; purchasing before time.
const SECTIONS=['core','team','contacts','leads','templates','planning','schedule','logs','files','selections','design','purchasing','finance','time','reports'];
const [target,...rest]=process.argv.slice(2);
guardedTarget(target);
const apply=rest.includes('--apply');
const onlyIndex=rest.indexOf('--only');
const only=onlyIndex>=0?String(rest[onlyIndex+1]||'').split(',').filter(Boolean):null;
if(only&&only.some(s=>!SECTIONS.includes(s)))fail(`unknown section; use ${SECTIONS.join(',')}`);
const anchorIndex=rest.indexOf('--anchor');
const anchor=anchorIndex>=0?rest[anchorIndex+1]:'2026-12-01';
if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor))fail('--anchor must be YYYY-MM-DD.');

const ctx={db:adminClient(),apply,anchor,target,owner:null,counts:{},log:(section,msg)=>console.log(`[${section}] ${msg}`)};
const results=[];
for(const name of SECTIONS){
 if(only&&!only.includes(name)&&name!=='core')continue;
 let mod;
 try{mod=await import(`./sections/${name}.mjs`);}catch(error){if(error?.code==='ERR_MODULE_NOT_FOUND'){results.push([name,'not implemented']);continue;}throw error;}
 if(name!=='core'&&!ctx.owner){results.push([name,'skipped: no demo account yet (run with --apply)']);continue;}
 try{await mod.seed(ctx);results.push([name,'ok']);}
 catch(error){results.push([name,`FAILED: ${error.message}`]);if(name==='core')break;}
}
console.log(JSON.stringify({mode:apply?'apply':'dry-run',target,owner:ctx.owner,counts:ctx.counts,sections:Object.fromEntries(results)},null,1));
if(results.some(([,r])=>r.startsWith('FAILED')))process.exitCode=1;
