// Prepares only the native loopback stack; never links or writes a hosted project.
import {localSqlManifest} from './local-sql-manifest.mjs';
import {readFile,writeFile,chmod,readdir} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
const parse=text=>Object.fromEntries(text.split(/\r?\n/).filter(l=>/^[A-Z_]+=/.test(l)).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const status=spawnSync('npx',['--yes','supabase@2.122.0','status','--env','--output-format','text'],{encoding:'utf8',env:{...process.env,SUPABASE_EXPERIMENTAL_STACK:'1'}});
if(status.status!==0)throw Error('Start the native Supabase stack first.');
const local=parse(status.stdout);
if(local.API_URL!=='http://127.0.0.1:54321'||new URL(local.DB_URL).hostname!=='127.0.0.1')throw Error('Refusing a non-loopback or unexpected Supabase target.');
async function find(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isFile()&&entry.name==='psql')return path;if(entry.isDirectory()){const found=await find(path);if(found)return found;}}}
const psql=await find(join(homedir(),'.supabase/cache/stack/slim-services/postgres'));if(!psql)throw Error('Native psql not found.');
function sql(args){const r=spawnSync(psql,[local.DB_URL,'--set=ON_ERROR_STOP=1',...args],{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr.slice(-1200));return r.stdout;}
let existing={};try{existing=parse(await readFile('.env.test','utf8'));if(existing.NEXT_PUBLIC_SUPABASE_URL!==local.API_URL)throw Error('Existing .env.test must not target another environment.');}catch(e){if(e.code!=='ENOENT')throw e;}
const password=existing.LOCAL_REGRESSION_PASSWORD||'LocalPro!'+randomBytes(16).toString('hex');
const users=Number(sql(['-Atc','select count(*) from auth.users']));
if(users===0){
 for(const [file,extra]of[['scripts/ci/grant-local-regression-service-role.sql',[]],['scripts/ci/seed-local-regression-auth.sql',['--set=regression_password='+password]]])sql(['--set=local_seed_guard=contratacr-local-only',...extra,'--file='+file]);
}
for(const step of localSqlManifest){
 if(step.ifMissing&&sql(['-Atc',"select to_regclass('"+step.ifMissing+"') is not null"]).trim()==='t')continue;
 sql(['--file=docs/pro/sql/'+step.file]);
}
const env={NEXT_PUBLIC_SUPABASE_URL:local.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:local.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:local.SERVICE_ROLE_KEY,SUPABASE_DB_URL:local.DB_URL,NEXT_PUBLIC_APP_URL:'http://127.0.0.1:3185',LOCAL_REGRESSION_SEED:'1',LOCAL_REGRESSION_PASSWORD:password,E2E_TEST_PASSWORD:password,REGRESSION_TEST_PASSWORD:password,E2E_ALLOW_NON_TEST_SUPABASE:'1',E2E_FIXTURES_READY:'1',E2E_LEGACY_SEED:'0'};
await writeFile('.env.test',Object.entries(env).map(([k,v])=>`${k}=${v}\n`).join(''),{mode:0o600});await chmod('.env.test',0o600);
if(users===0)for(const file of ['scripts/seed-local-regression-foundation.js','scripts/verify-local-regression-foundation.js']){const r=spawnSync('node',[file],{env:{...process.env,...env},encoding:'utf8'});if(r.status!==0)throw Error(r.stderr.slice(-1200));}
console.log('Loopback Supabase prepared. Private .env.test written; credentials omitted.');
