// LOCAL PRO ONLY (multivertical F6): dynamic proof that directory order never depends on payment.
// 1. Static: scans dir_search*/dir_facets definitions in DIR_SQL_DIR/directory-*.sql (default docs/pro/sql; the
//    original verify-directory-ranking-neutrality.mjs only reads docs/pro/sql) for commercial terms.
// 2. Dynamic (PGlite, in memory): loads core + import + catalog + listings + claims + search, adds minimal stand-ins
//    of the Pro commercial tables (pro_memberships, pro_workspace_editions, pro_workspace_modules,
//    pro_billing_switches) linked to the place managers and listing sellers, snapshots dir_search (every sort) and
//    dir_facets, then flips memberships/editions/modules/switches in several ways and requires identical output.
//    A control step changes a rating and requires the order to change, so the comparison is not vacuous.
// Never touches a shared database.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';

const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const FORBIDDEN=/pro_memberships|pro_workspace|membership|edition|paywall|billing|is_featured|isfeatured|featured|sponsor|payment|\btiers?\b/i;

// ---------------------------------------------------------------- static scan
const hits=[];let scanned=0;
for(const f of (await readdir(dir)).filter(f=>/^directory-.*\.sql$/.test(f)).sort()){
 const text=await readFile(join(dir,f),'utf8');
 const re=/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(dir_search\w*|dir_facets)\s*\(/gi;let m;
 while((m=re.exec(text))){
  const dollar=/\$(\w*)\$/.exec(text.slice(m.index));if(!dollar)continue;
  const open=m.index+dollar.index+dollar[0].length,close=text.indexOf(dollar[0],open);
  const body=text.slice(m.index,close<0?text.length:close+dollar[0].length);scanned++;
  const startLine=text.slice(0,m.index).split('\n').length;
  body.split('\n').forEach((line,i)=>{if(FORBIDDEN.test(line.replace(/--.*$/,'')))hits.push(`${f}:${startLine+i}  ${line.trim()}`);});
 }
}
if(hits.length){console.error('FAIL directory neutrality (static): commercial term in search SQL:');hits.forEach(h=>console.error('  - '+h));process.exit(1);}
assert.ok(scanned>=2,`expected dir_search/dir_facets definitions in ${dir}`);

// ---------------------------------------------------------------- dynamic proof
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
for(const f of ['directory-core-local.sql','directory-import-local.sql','vehicles-catalog-local.sql','directory-listings-local.sql','directory-claims-local.sql','directory-search-local.sql'])
 await db.exec(await readFile(join(dir,f),'utf8'));
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const src=(await q(`select string_agg(prosrc,' ') s from pg_proc where proname like 'dir\\_search%' or proname='dir_facets'`))[0].s;
assert.ok(!FORBIDDEN.test(src.replace(/--[^\n]*/g,'')),'installed dir_search*/dir_facets bodies mention a commercial term');

// Minimal stand-ins of the Pro commercial tables (real ones live in memberships-draft.sql / F4 modules).
await db.exec(`
 create table pro_memberships(user_id uuid primary key,status text not null,expires_at timestamptz);
 create table pro_workspace_editions(workspace_id uuid primary key,owner_id uuid not null,edition text not null);
 create table pro_workspace_modules(workspace_id uuid not null,module text not null,enabled boolean not null,primary key(workspace_id,module));
 create table pro_billing_switches(key text primary key,paywall_enabled boolean not null);
 insert into pro_billing_switches values('global',false);`);

let n=0;const id=()=>`00000000-0000-4000-8000-${String(++n).padStart(12,'0')}`;
const owners=[];
const LOC=[['San José','San José',9.933,-84.08],['San José','Escazú',9.918,-84.14],['Heredia','Heredia',9.998,-84.117]];
for(let i=0;i<18;i++){
 const pid=id(),owner=id(),[a1,a2,lat,lng]=LOC[i%3],vertical=['restaurant','grocery','fuel'][i%3];
 await q(`insert into dir_places(id,slug,vertical_id,name,admin_area_1,admin_area_2,lat,lng,location_precision,status,verification_level,rating_avg,rating_count,created_at)
  values($1,$2,$3,$4,$5,$6,$7,$8,'exact','published',$9,$10,$11,$12)`,
  [pid,`lugar-${i}`,vertical,`Lugar ${i%4===0?'Central':'Barrio'} ${i}`,a1,a2,lat+i*0.001,lng,i%5===0?'verified':'imported',i%3?3+(i%4)/2:null,i%3?i:0,`2026-0${1+(i%9)}-01T00:00:00Z`]);
 await q(`insert into dir_place_managers(id,place_id,user_id,role,granted_by) values($1,$2,$3,'manager',$3)`,[id(),pid,owner]);
 owners.push(owner);
}
const make=(await q(`select o.id model,o.make_id make from ref_vehicle_models o join ref_vehicle_makes k on k.id=o.make_id where k.slug='toyota' and o.slug='hilux'`))[0];
for(let i=0;i<12;i++){
 const lid=id(),seller=id(),[a1,a2,lat,lng]=LOC[i%3],code=(await q('select dir_listing_code($1) c',[lid]))[0].c;
 await q(`insert into dir_listing_sellers(profile_id) values($1)`,[seller]);
 await q(`insert into dir_listings(id,public_code,vertical,seller_kind,seller_profile_id,status,title,description,price_minor,currency,price_crc_norm,admin_area_1,admin_area_2,lat,lng,published_at,expires_at,created_at,updated_at)
  values($1,$2,'vehiculos',$3,$4,$5,$6,'Descripción suficientemente larga del anuncio.',$7,'CRC',$7,$8,$9,$10,$11,$12,'2099-01-01',$12,$12)`,
  [lid,code,i%2?'business':'private',seller,i%4===3?'reserved':'published',`Toyota Hilux ${2010+i}`,(500+i*37%11*100)*100000,a1,a2,lat,lng,`2026-10-${String(10+i).padStart(2,'0')}T00:00:00Z`]);
 await q(`insert into dir_listing_vehicle(listing_id,make_id,model_id,vehicle_type,year,condition,mileage_km) values($1,$2,$3,'pickup',$4,'used',$5)`,[lid,make.make,make.model,2010+i,10000*i]);
 owners.push(seller);
}

const cases=[];
for(const sort of ['relevance','best_rated','newest','distance'])for(const v of ['lugares','restaurantes','vehiculos'])cases.push({v,sort});
for(const sort of ['price_asc','price_desc'])cases.push({v:'vehiculos',sort});
cases.push({v:'lugares',sort:'relevance',q:'central'},{v:'lugares',sort:'relevance',filters:{province:'San José'}},{v:'vehiculos',sort:'relevance',q:'hilux',lat:9.93,lng:-84.1,radius:20});
const snapshot=async()=>{await db.exec('set role service_role');const out=[];
 for(const c of cases){const lat=c.lat??(c.sort==='distance'?9.95:null),lng=c.lng??(c.sort==='distance'?-84.1:null);
  const items=[];let cursor=null;
  do{const r=(await q('select dir_search($1,$2,$3,$4,$5,$6,$7,$8,7) r',[c.v,c.q??null,c.filters??{},lat,lng,c.radius??null,c.sort,cursor]))[0].r;items.push(...r.items);cursor=r.nextCursor;}while(cursor);
  out.push(JSON.stringify(items));
  out.push(JSON.stringify((await q('select dir_facets($1,$2,$3,$4,$5,$6) r',[c.v,c.q??null,c.filters??{},lat,lng,c.radius??null]))[0].r));}
 await db.exec('reset role');return out;};

const base=await snapshot();
let flips=0;
const flip=async(label,sql,params=[])=>{if(params.length)for(const part of sql.split(';'))await q(part,part.includes('$1')?params:[]);else await db.exec(sql);const now=await snapshot();
 base.forEach((b,i)=>assert.equal(now[i],b,`${label}: output changed for ${JSON.stringify(cases[Math.floor(i/2)])}`));flips++;};
const half=owners.filter((_,i)=>i%2===0),other=owners.filter((_,i)=>i%2===1);
await flip('memberships active (even owners)',`insert into pro_memberships(user_id,status,expires_at) select unnest($1::uuid[]),'active',null`,[half]);
await flip('editions top for even owners',`insert into pro_workspace_editions(workspace_id,owner_id,edition) select gen_random_uuid(),u,'enterprise' from unnest($1::uuid[]) u`,[half]);
await flip('modules enabled',`insert into pro_workspace_modules(workspace_id,module,enabled) select w.workspace_id,m,true from pro_workspace_editions w,unnest(array['directory','listings','reviews','ads']) m`);
await flip('paywall switched on',`update pro_billing_switches set paywall_enabled=true`);
await flip('memberships swapped to odd owners',`update pro_memberships set status='expired',expires_at=now()-interval '1 day';insert into pro_memberships(user_id,status,expires_at) select unnest($1::uuid[]),'active','infinity' on conflict(user_id) do update set status='active'`,[other]);
await flip('editions downgraded',`update pro_workspace_editions set edition='free'`);
await flip('everything removed',`delete from pro_workspace_modules;delete from pro_workspace_editions;delete from pro_memberships;update pro_billing_switches set paywall_enabled=false`);

// Control: a neutral signal (client rating) must move the order, proving the snapshot is sensitive.
await q(`update dir_places set rating_avg=5,rating_count=200 where slug='lugar-17'`);
const after=await snapshot();
assert.notEqual(after[cases.findIndex(c=>c.v==='lugares'&&c.sort==='best_rated')*2],base[cases.findIndex(c=>c.v==='lugares'&&c.sort==='best_rated')*2],'control: rating change must reorder');
console.log(`PASS directory neutrality (dynamic): ${scanned} search function(s) scanned in ${dir}; ${cases.length} searches+facets identical across ${flips} membership/edition/module/switch changes; control reorders on rating.`);
