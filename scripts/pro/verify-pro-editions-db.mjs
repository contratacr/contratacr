// LOCAL PRO ONLY (multivertical F4): in-memory PGlite verification of pro-editions-local.sql.
// pro-editions-local.sql and pro-entitled-draft.sql are read from DIR_SQL_DIR (default docs/pro/sql);
// memberships-draft.sql and team-roles-local.sql always from PRO_SQL_DIR (default docs/pro/sql).
// Optional: PRO_F4_WIRING_MD=<dir-wiring-F4.md> also applies the team-roles patch block and checks the new capabilities
// and the module gate in pro_team_route_authorize. No shared database, no dev server.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql',proDir=process.env.PRO_SQL_DIR||'docs/pro/sql';
const E=await import('../../src/lib/pro/editions.ts');
const uuid=()=>crypto.randomUUID(),code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint,h,e.message);return true;};

const editionsSql=await readFile(join(dir,'pro-editions-local.sql'),'utf8');
// Independence from the public directory: no directory table, search or ordering reference at all.
assert.doesNotMatch(editionsSql,/\bdir_|is_featured|directory_|search_(?!path)|query-core/i,'pro-editions never touches directory/search');
assert.doesNotMatch((await readFile('src/lib/pro/editions.ts','utf8')).replace(/\/\/.*|\/\*[\s\S]*?\*\//g,''),/import\s|from\s+['"]|dir_|directory/,'editions.ts is dependency-free and directory-free');

const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
const q=async(sql,params)=>(await db.query(sql,params)).rows;
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
 create table public.profiles(id uuid primary key,role text not null,is_disabled boolean,is_provider boolean,full_name text);
 create table public.professionals(profile_id uuid primary key,is_banned boolean,business_name text);
 grant select,insert,update on public.profiles,public.professionals to service_role;
 create function public.pro_team_name(p uuid) returns text language sql stable as $$ select coalesce((select full_name from public.profiles where id=p),'') $$;
 grant execute on function public.pro_team_name(uuid) to service_role;`);
await db.exec(await readFile(join(proDir,'memberships-draft.sql'),'utf8'));
await db.exec(await readFile(join(proDir,'team-roles-local.sql'),'utf8'));
const entitled=await readFile(join(dir,'pro-entitled-draft.sql'),'utf8');await db.exec(entitled);
// Stub of private-work-tools-access (same rule as pro_entitled) so the team gate can resolve workspaces.
await db.exec(`create or replace function public.pro_private_work_tools_enabled(p uuid) returns boolean language sql stable as $$ select public.pro_entitled(p) $$;
 grant execute on function public.pro_private_work_tools_enabled(uuid) to service_role;`);
await db.exec(editionsSql);await db.exec(editionsSql);await db.exec(editionsSql);
assert.deepEqual(await q('select id,paywall_enabled,revision from pro_billing_switches'),[{id:true,paywall_enabled:false,revision:1}],'singleton seeded once, paywall OFF');

// ---------------------------------------------------------------- catalogue: SQL table == editions.ts
for(const ed of E.PRO_EDITIONS){
 const rows=await q('select module,min_tier from pro_edition_default_modules($1)',[ed]);
 assert.deepEqual(rows.map(r=>({module:r.module,minTier:r.min_tier})),E.PRO_EDITION_DEFAULT_MODULES[ed].map(m=>({...m})),ed);
}
assert.deepEqual((await q('select c from pro_module_catalog() c')).map(r=>r.c),[...E.PRO_MODULES]);
assert.deepEqual(await q("select * from pro_edition_default_modules('pizzeria')"),[]);
assert.equal((await q("select provolatile v from pg_proc where proname='pro_edition_default_modules'"))[0].v,'i','immutable');
for(const [p,m] of [['/api/pro/auto-inventory/x','auto_inventory'],['/api/pro/listings','listings'],['/api/pro/menu-items/1','menu'],['/api/pro/prices','price_list'],['/api/pro/catalog','null'],['/api/pro/reservations','null'],['/api/pro/quotes','null'],['/api/pro/inventory','inventory']])
 assert.equal(String((await q('select pro_route_module($1) m',[p]))[0].m),m,p);

// ---------------------------------------------------------------- people
let n=1;const id=()=>`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`;
const person=async(role,{membership='active',provider=false}={})=>{const u=id();await q('insert into profiles values($1,$2,false,$3,$4)',[u,role,provider,role+u.slice(-3)]);
 if(membership)await q('insert into pro_memberships(user_id,status,expires_at) values($1,$2,null)',[u,membership]);return u;};
const admin=await person('admin',{membership:null}),owner=await person('professional'),other=await person('professional'),
 noPro=await person('professional',{membership:null}),inactive=await person('professional',{membership:'inactive'}),
 memberU=await person('client'),managerU=await person('client'),adminMemberU=await person('client'),stranger=await person('client'),client=await person('client',{membership:null});
for(const [u,role] of [[memberU,'member'],[managerU,'manager'],[adminMemberU,'admin']])
 await q('insert into pro_company_members(owner_id,member_user_id,role) values($1,$2,$3)',[owner,u,role]);
await q("insert into pro_workspaces(user_id,document,revision) values($1,'{}',1)",[client]);
await db.exec('set role service_role');

const mutate=(actor,input)=>q('select pro_workspace_edition_mutate($1,$2) r',[actor,input]).then(r=>r[0].r);
const sw=(actor,input)=>q('select pro_billing_switch_set($1,$2) r',[actor,input]).then(r=>r[0].r);
const has=(o,m)=>q('select pro_has_module($1,$2) h',[o,m]).then(r=>r[0].h);
const req=(a,o,m)=>q('select pro_module_require($1,$2,$3) m',[a,o,m]).then(r=>r[0].m);
const paywall=async(on)=>{const s=(await q('select pro_billing_switch_read() s'))[0].s;if(s.paywallEnabled===on)return;await sw(admin,{actionId:uuid(),paywallEnabled:on,reason:'test toggle',revision:s.revision});};

// ---------------------------------------------------------------- implicit servicios, entitlement
assert.equal(await has(owner,'projects'),true,'no row = servicios');
assert.equal(await has(owner,'menu'),false,'not in servicios');
assert.equal(await has(owner,'bids'),true,'paywall off: plus-tier module of the edition on');
assert.equal(await has(noPro,'clients'),false,'no Pro grant');assert.equal(await has(inactive,'clients'),false);
assert.equal(await has(admin,'projects'),true,'platform admin entitled');
await assert.rejects(()=>req(owner,owner,'nope'),code('22023'));
assert.equal(await req(memberU,owner,'projects'),'projects','member reads an active module');
await assert.rejects(()=>req(stranger,owner,'projects'),code('42501'),'not in the company');
await assert.rejects(()=>req(owner,owner,'menu'),hint('module_disabled'));

// ---------------------------------------------------------------- mutate: auth, CAS, idempotency
const choose=(actor,o,ed,rev,aid=uuid())=>mutate(actor,{action:'choose_edition',actionId:aid,edition:ed,ownerId:o,revision:rev});
await assert.rejects(()=>choose(memberU,owner,'autos',0),code('42501'),'member lacks settings.write');
await assert.rejects(()=>choose(managerU,owner,'autos',0),code('42501'),'manager lacks settings.write');
await assert.rejects(()=>choose(stranger,owner,'autos',0),code('42501'));
await assert.rejects(()=>choose(noPro,noPro,'autos',0),code('42501'),'owner without Pro');
await assert.rejects(()=>choose(owner,owner,'pizzeria',0),code('22023'));
await assert.rejects(()=>mutate(owner,{action:'choose_edition',actionId:uuid(),edition:'autos',ownerId:owner,revision:0,tier:'plus'}),code('22023'),'owner cannot set tier');
await assert.rejects(()=>choose(owner,owner,'autos',1),code('40001'),'CAS on create');
const aid1=uuid(),r1=await choose(owner,owner,'autos',0,aid1);
assert.deepEqual(r1,{ownerId:owner,action:'choose_edition',edition:'autos',tier:'basico',source:'launch_free',active:true,revision:1,replayed:false});
assert.deepEqual(await choose(owner,owner,'autos',0,aid1),{...r1,replayed:true},'idempotent replay');
await assert.rejects(()=>choose(owner,owner,'comercio',0,aid1),code('22023'),'action id reused with other input');
await assert.rejects(()=>choose(owner,owner,'comercio',0),code('40001'),'stale revision');
assert.equal((await choose(adminMemberU,owner,'autos',1)).revision,2,'company admin member has settings.write');

// ---------------------------------------------------------------- paywall OFF: every edition module on, regardless of tier
const admSet=(o,ed,tier,rev,extra={})=>mutate(admin,{action:'admin_set_edition',actionId:uuid(),active:true,edition:ed,ownerId:o,reason:'test setup',revision:rev,source:'admin',tier,...extra});
await assert.rejects(()=>mutate(owner,{action:'admin_set_edition',actionId:uuid(),active:true,edition:'autos',ownerId:owner,reason:'self upgrade',revision:2,source:'admin',tier:'plus'}),code('42501'),'only platform admin');
await assert.rejects(()=>admSet(owner,'autos','plus',2,{reason:'  '}),code('22023'),'reason required');
let rev=(await admSet(owner,'autos','basico',2)).revision;
for(const m of E.PRO_EDITION_DEFAULT_MODULES.autos)assert.equal(await has(owner,m.module),true,'paywall off '+m.module);
assert.equal(await has(owner,'projects'),false,'servicios module not in autos');

// ---------------------------------------------------------------- paywall switch: admin only, CAS, idempotent, immutable history
await assert.rejects(()=>sw(owner,{actionId:uuid(),paywallEnabled:true,reason:'want it',revision:1}),code('42501'));
await assert.rejects(()=>sw(adminMemberU,{actionId:uuid(),paywallEnabled:true,reason:'want it',revision:1}),code('42501'),'company admin is not platform admin');
await assert.rejects(()=>sw(admin,{actionId:uuid(),paywallEnabled:true,reason:'go',revision:1,extra:1}),code('22023'));
await assert.rejects(()=>sw(admin,{actionId:uuid(),paywallEnabled:true,reason:'go live',revision:7}),code('40001'));
const swId=uuid(),on=await sw(admin,{actionId:swId,paywallEnabled:true,reason:'go live',revision:1});
assert.deepEqual(on,{paywallEnabled:true,revision:2,replayed:false});
assert.deepEqual(await sw(admin,{actionId:swId,paywallEnabled:true,reason:'go live',revision:1}),{...on,replayed:true});
await assert.rejects(()=>q('update pro_billing_switches set paywall_enabled=false'),code('23514'),'direct update blocked');
await assert.rejects(()=>q('delete from pro_billing_switches'),code('42501'),'no delete grant');
await db.exec('reset role');
await assert.rejects(()=>db.exec('update pro_billing_switches set paywall_enabled=false'),code('23514'),'even for the table owner');
await assert.rejects(()=>db.exec('delete from pro_billing_switches'),code('23514'));
await assert.rejects(()=>db.exec('truncate pro_billing_switches'),code('23514'));
await db.exec('set role service_role');
assert.deepEqual(await q('select before_enabled,after_enabled,revision,reason from pro_billing_switch_events'),[{before_enabled:false,after_enabled:true,revision:2,reason:'go live'}]);

// ---------------------------------------------------------------- paywall ON: tier respected
const tierOf={basico:1,pro:2,plus:3};
for(const tier of E.PRO_TIERS){
 rev=(await admSet(owner,'autos',tier,rev)).revision;
 for(const m of E.PRO_EDITION_DEFAULT_MODULES.autos)assert.equal(await has(owner,m.module),tierOf[tier]>=tierOf[m.minTier],`${tier} ${m.module}`);
}
rev=(await admSet(owner,'autos','basico',rev)).revision;
assert.equal(await has(owner,'auto_finance_calc'),false);await assert.rejects(()=>req(memberU,owner,'listing_metrics'),hint('module_disabled'));
assert.equal(await has(owner,'listings'),true);
assert.equal(await has(other,'projects'),true,'implicit servicios/basico');assert.equal(await has(other,'timesheets'),false,'implicit basico under paywall');

// ---------------------------------------------------------------- module overrides
const setMod=(actor,o,module,enabled,r,aid=uuid())=>mutate(actor,{action:'set_module',actionId:aid,enabled,module,ownerId:o,revision:r});
const admMod=(o,module,enabled,r,source='billing')=>mutate(admin,{action:'admin_set_module',actionId:uuid(),enabled,module,ownerId:o,reason:'test addon',revision:r,source});
await assert.rejects(()=>setMod(owner,owner,'menu',true,0),hint('module_not_in_edition'));
await assert.rejects(()=>setMod(owner,owner,'nope',true,0),code('22023'));
await assert.rejects(()=>setMod(memberU,owner,'listings',false,0),code('42501'));
const off=await setMod(owner,owner,'listings',false,0);assert.equal(off.active,false);assert.equal(off.revision,1);
assert.equal(await has(owner,'listings'),false);
await assert.rejects(()=>req(memberU,owner,'listings'),e=>code('42501')(e)&&hint('module_disabled')(e),'module off → 42501 module_disabled');
await assert.rejects(()=>setMod(owner,owner,'listings',true,0),code('40001'));
assert.equal((await admMod(owner,'auto_finance_calc',true,0)).active,true,'billing grant above tier');
assert.equal((await admMod(owner,'menu',true,0)).active,true,'add-on outside the edition');
await assert.rejects(()=>setMod(owner,owner,'auto_finance_calc',false,1),hint('module_locked'));
assert.equal((await admMod(owner,'clients',false,0,'admin')).active,false,'admin can lock a module off');
await assert.rejects(()=>admMod(owner,'clients',true,1,'owner'),code('22023'));
await paywall(false);
assert.equal(await has(owner,'listings'),false,'owner off stays off with paywall off');
await assert.rejects(()=>req(owner,owner,'listings'),hint('module_disabled'));
assert.equal(await has(owner,'listing_metrics'),true,'paywall off ignores tier');
assert.equal(await has(owner,'clients'),false,'admin lock stays');
assert.equal((await setMod(owner,owner,'listings',true,1)).active,true);

// ---------------------------------------------------------------- matrix: SQL pro_has_module == editions.ts hasModule
const mx=await person('professional');let cases=0;
await db.exec('reset role');
for(const pw of [false,true])for(const ed of E.PRO_EDITIONS)for(const tier of E.PRO_TIERS)for(const ovKind of ['none','owner_off','billing_on','admin_off']){
 await db.exec(`delete from pro_workspace_modules where owner_id='${mx}';delete from pro_workspace_editions where owner_id='${mx}'`);
 await q('insert into pro_workspace_editions(owner_id,edition,tier,source) values($1,$2,$3,$4)',[mx,ed,tier,'admin']);
 const overrides={};const probe=['listings','menu','bids','statistics','price_list','stock_alerts'];
 if(ovKind!=='none')for(const m of probe){const ov={enabled:ovKind==='billing_on',source:ovKind==='owner_off'?'owner':ovKind==='billing_on'?'billing':'admin'};overrides[m]=ov;
  await q('insert into pro_workspace_modules(owner_id,module,enabled,source) values($1,$2,$3,$4)',[mx,m,ov.enabled,ov.source]);}
 await db.exec('set role service_role');await paywall(pw);
 const state={entitled:true,edition:ed,tier,active:true,paywallEnabled:pw,overrides};
 const read=(await q('select pro_workspace_edition_read($1,$1) r',[mx]))[0].r;
 for(const m of E.PRO_MODULES){const sql=await has(mx,m);assert.equal(sql,E.hasModule(state,m),JSON.stringify({pw,ed,tier,ovKind,m}));
  assert.equal(read.modules.find(x=>x.module===m).active,sql);cases++;}
 assert.deepEqual(read.modules.filter(x=>x.active).map(x=>x.module).sort(),[...E.activeModules(state)].sort());
 await db.exec('reset role');
}
await db.exec('set role service_role');
assert.equal(E.hasModule({entitled:false,edition:'autos',tier:'plus',active:true,paywallEnabled:false},'listings'),false);

// ---------------------------------------------------------------- inactive edition
rev=(await admSet(owner,'autos','plus',rev,{active:false})).revision;
assert.equal(await has(owner,'listings'),false,'inactive edition');
await assert.rejects(()=>choose(owner,owner,'comercio',rev),hint('edition_inactive'));
rev=(await admSet(owner,'autos','plus',rev)).revision;

// ---------------------------------------------------------------- backfill (not auto-run)
await assert.rejects(()=>q('select pro_editions_backfill_servicios($1,false)',[owner]),code('42501'));
const dry=(await q('select pro_editions_backfill_servicios($1) r',[admin]))[0].r;
assert.equal(dry.dryRun,true);assert.equal(dry.inserted,0);
const expected=(await q('select count(*)::int c from profiles p where (exists(select 1 from pro_memberships m where m.user_id=p.id) or exists(select 1 from pro_workspaces w where w.user_id=p.id)) and not exists(select 1 from pro_workspace_editions e where e.owner_id=p.id)'))[0].c;
assert.equal(dry.candidates,expected);assert.ok(dry.sample.includes(client),'pro_workspaces owner is a candidate');assert.ok(!dry.sample.includes(owner),'existing edition untouched');
assert.equal((await q('select count(*)::int c from pro_workspace_editions'))[0].c,2,'dry run inserts nothing');
const real=(await q('select pro_editions_backfill_servicios($1,false,$2) r',[admin,'pro']))[0].r;
assert.equal(real.inserted,expected);
assert.equal((await q('select pro_editions_backfill_servicios($1,false) r',[admin]))[0].r.inserted,0,'idempotent');
assert.deepEqual(await q('select edition,tier,source from pro_workspace_editions where owner_id=$1',[other]),[{edition:'servicios',tier:'pro',source:'launch_free'}]);
assert.deepEqual(await q('select edition,tier from pro_workspace_editions where owner_id=$1',[owner]),[{edition:'autos',tier:'plus'}]);

// ---------------------------------------------------------------- immutability, grants, function hygiene
for(const t of ['pro_billing_switch_events','pro_workspace_edition_events','pro_edition_actions']){
 await assert.rejects(()=>db.exec(`delete from ${t}`),code('42501'),t+' no delete grant');
 await db.exec('reset role');
 await assert.rejects(()=>db.exec(`update ${t} set at=at`),code('23514'),t);
 await assert.rejects(()=>db.exec(`delete from ${t}`),code('23514'),t);
 await assert.rejects(()=>db.exec(`truncate ${t}`),code('23514'),t);
 await db.exec('set role service_role');
}
await db.exec('reset role');
for(const role of ['anon','authenticated']){
 await db.exec(`set role ${role}`);
 for(const t of ['pro_workspace_editions','pro_workspace_modules','pro_billing_switches','pro_billing_switch_events','pro_workspace_edition_events','pro_edition_actions'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'),role+' '+t);
 await assert.rejects(()=>q('select pro_has_module($1,$2)',[owner,'clients']),code('42501'));
 await assert.rejects(()=>q('select pro_billing_switch_set($1,$2)',[admin,{}]),code('42501'));
 await db.exec('reset role');
}
const fns=await q("select p.proname,p.prosecdef,p.proconfig,p.prosrc from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public' and p.proname in('pro_tier_rank','pro_edition_default_modules','pro_module_catalog','pro_route_module','pro_paywall_enabled','pro_has_module','pro_module_require','pro_billing_switch_read','pro_workspace_edition_read','pro_edition_is_admin','pro_workspace_edition_mutate','pro_billing_switch_set','pro_editions_backfill_servicios','pro_edition_history_immutable','pro_billing_switch_guard')");
assert.equal(fns.length,15);
for(const f of fns){assert.equal(f.prosecdef,false,f.proname);assert.ok(f.proconfig?.some(c=>c.startsWith('search_path=')),f.proname);assert.doesNotMatch(f.prosrc,/\bdir_|is_featured|order by .*rank/i,f.proname);}
assert.equal((await q("select count(*)::int c from pg_class where relname like 'dir\\_%'"))[0].c,0,'no directory table created or required');
const snap=await q('select * from pro_workspace_editions order by owner_id'),swSnap=await q('select * from pro_billing_switches');await db.exec(editionsSql);
assert.deepEqual(await q('select * from pro_workspace_editions order by owner_id'),snap,'re-apply keeps data');
assert.deepEqual(await q('select * from pro_billing_switches'),swSnap,'re-apply keeps switch value (paywall ON stays ON)');
assert.equal(swSnap[0].paywall_enabled,true);

// ---------------------------------------------------------------- optional: team-roles patch from dir-wiring-F4.md
let wired='';
if(process.env.PRO_F4_WIRING_MD){
 const md=await readFile(process.env.PRO_F4_WIRING_MD,'utf8');const block=md.match(/```sql\n(-- F4 wiring patch[\s\S]*?)```/);assert.ok(block,'patch block');
 await db.exec(block[1]);await db.exec('set role service_role');
 const matrix=(await q('select pro_role_matrix_read() m'))[0].m;
 assert.deepEqual(matrix.member,['read','work.write','lead.write','inventory.write','menu.write']);
 assert.deepEqual(matrix.read_only,['read']);
 for(const c of ['inventory.write','listing.publish','price.write','menu.write']){assert.ok(matrix.admin.includes(c));assert.ok(matrix.manager.includes(c));}
 for(const [m,p,c] of [['POST','/api/pro/auto-inventory','inventory.write'],['POST','/api/pro/listings','listing.publish'],['PATCH','/api/pro/prices','price.write'],['POST','/api/pro/menu-items','menu.write'],['POST','/api/pro/catalog','company.write'],['POST','/api/pro/reservations','sales.write'],['POST','/api/pro/team-roles','team.manage']])
  assert.equal((await q('select pro_role_route_capability($1,$2) c',[m,p]))[0].c,c,p);
 const auth=(mem,m,p)=>q('select pro_team_route_authorize($1,$2,$3,$4) r',[mem,owner,m,p]).then(r=>r[0].r);
 assert.equal((await auth(memberU,'POST','/api/pro/listings')).reason,'role','member cannot publish');
 assert.deepEqual(await auth(managerU,'POST','/api/pro/listings'),{allowed:true,role:'manager',capability:'listing.publish'});
 assert.deepEqual(await auth(memberU,'GET','/api/pro/stock-alerts'),{allowed:false,reason:'module_disabled',role:'member',capability:'read',module:'stock_alerts'},'module outside the edition');
 assert.deepEqual(await auth(memberU,'POST','/api/pro/menu-items'),{allowed:true,role:'member',capability:'menu.write'},'billing add-on menu');
 assert.equal((await auth(managerU,'POST','/api/pro/quotes')).allowed,true,'existing routes never module-gated');
 wired=' + team-roles patch (4 capabilities, route map, module gate in pro_team_route_authorize)';
 await db.exec('reset role');
}
await db.close();
console.log(`PASS pro editions: module applied 3× (singleton paywall OFF seeded once), default-module table SQL == editions.ts for 5 editions (immutable), route→module map only for new vertical routes, implicit servicios, entitlement via pro_entitled, paywall OFF → every edition module on regardless of tier, paywall ON → tier respected (basico/pro/plus), owner/admin overrides + billing add-ons, module off → 42501 module_disabled (pro_module_require), CAS 40001 + idempotent actionId (replay, reuse 22023), settings.write for owner actions and platform admin for tier/source/paywall, paywall history immutable + direct writes blocked, backfill servicios dry-run/idempotent (not auto-run), ${cases} SQL==TS hasModule cases, RLS/grants, no directory/search reference${wired}.`);
