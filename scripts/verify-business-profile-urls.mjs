import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated;
create table public.professionals(id uuid primary key, slug text unique not null, business_name text, is_banned boolean default false, visible boolean default true);
alter table public.professionals enable row level security;
grant select on public.professionals to anon, authenticated;
create policy visible on public.professionals for select using (visible);
insert into professionals(id,slug,business_name) values
 ('4a2c72f3-6bfa-4ef9-9e98-a58144fd9f3d','luis-gerardo-suarez-chaves-54xrmtku','Ley Total Abogados'),
 ('11111111-1111-4111-8111-111111111111','ana-perez-ab123456',null),
 ('22222222-2222-4222-8222-222222222222','ana-perez-cd123456',null);`);
await db.exec(fs.readFileSync(new URL('../supabase/migrations/256_urls_nombre_comercial.sql', import.meta.url), 'utf8'));
const slug = async id => (await db.query('select slug from professionals where id=$1',[id])).rows[0]?.slug;
const first='4a2c72f3-6bfa-4ef9-9e98-a58144fd9f3d';
assert.equal(await slug(first),'ley-total-abogados-4a2c72f36b');
assert.equal(await slug('11111111-1111-4111-8111-111111111111'),'ana-perez-ab123456');
await db.exec(`insert into professionals(id,slug,business_name) values
 ('4a2c72f3-6b00-4000-8000-000000000000','other-old-abcdefgh','Ley Total Abogados'),
 ('33333333-3333-4333-8333-333333333333','reserved-old-abcdefgh','Login'),
 ('44444444-4444-4444-8444-444444444444','accent-old-abcdefgh','  Clínica Ñandú & Salud  ');`);
assert.equal(await slug('4a2c72f3-6b00-4000-8000-000000000000'),'ley-total-abogados-4a2c72f36b0040008000000000000000');
assert.equal(await slug('33333333-3333-4333-8333-333333333333'),'login-3333333333');
assert.equal(await slug('44444444-4444-4444-8444-444444444444'),'clinica-nandu-salud-4444444444');
await db.query('update professionals set business_name=$1 where id=$2',['Ley Total Costa Rica',first]);
assert.equal(await slug(first),'ley-total-costa-rica-4a2c72f36b');
await db.query('update professionals set business_name=$1 where id=$2',['Ley Total Renovada',first]);
assert.equal(await slug(first),'ley-total-renovada-4a2c72f36b');
await assert.rejects(db.exec(`insert into professionals(id,slug) values
 ('55555555-5555-4555-8555-555555555555','luis-gerardo-suarez-chaves-54xrmtku')`));
const actors=JSON.parse(fs.readFileSync(new URL('./actores-de-regresion.json',import.meta.url),'utf8'));
for(const actor of [actors.cliente,actors.profesional]) {
 await db.query('insert into professionals(id,slug,business_name) values($1,$2,$3)',[actor.professionalId,actor.slug,actor.negocio]);
 assert.equal(await slug(actor.professionalId),actor.slug,'Shared fixture must use its actual persisted business URL');
}
await db.exec('set role anon');
for(const old of ['luis-gerardo-suarez-chaves-54xrmtku','luis-gerardo-suarez-chaves','ley-total-abogados-4a2c72f36b','ley-total-costa-rica-4a2c72f36b']) {
 assert.deepEqual((await db.query('select professional_id from professional_slug_aliases where slug=$1',[old])).rows,[{professional_id:first}]);
}
assert.equal((await db.query("select * from professional_slug_aliases where slug='ana-perez'")).rows.length,2);
// Run the actual query resolver against the isolated PostgreSQL database.
const source = fs.readFileSync(new URL('../src/lib/queries/professionals.ts', import.meta.url), 'utf8');
const start = source.indexOf('      async function fetchBySlug(select: string)');
const end = source.indexOf('      let { data: pro, error }', start);
assert.ok(start > 0 && end > start);
const compiled = ts.transpileModule(source.slice(start,end), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const mock = { from(table) {
  assert.ok(['professionals','professional_slug_aliases'].includes(table));
  const filters=[]; const values=[]; let limit=100;
  const query={select(){return query;},eq(column,value){filters.push(`${column}=$${values.push(value)}`);return query;},
    ilike(column,value){filters.push(`${column} ilike $${values.push(value)}`);return query;},
    limit(n){limit=n;return query;},
    async run(single=false){const result=await db.query(`select * from ${table} where ${filters.join(' and ') || 'true'} limit ${limit}`,values);
      return {data:single ? result.rows[0] ?? null : result.rows,error:null};},
    maybeSingle(){return query.run(true);},then(resolve,reject){return query.run().then(resolve,reject);}};
  return query;
}};
const resolve = normalized => new Function('supabase','normalizedSlug', `${compiled}; return fetchBySlug('id, slug');`)(mock,normalized);
for (const old of ['luis-gerardo-suarez-chaves','luis-gerardo-suarez-chaves-54xrmtku','ley-total-abogados-4a2c72f36b','ley-total-renovada-4a2c72f36b']) {
  const result=await resolve(old); assert.equal(result.error,null); assert.equal(result.data?.id,first);
  assert.equal(result.data?.slug,'ley-total-renovada-4a2c72f36b');
}
assert.equal((await resolve('ana-perez')).data,null);
assert.equal((await resolve('not-a-real-profile-0000000000')).data,null);
assert.equal((await resolve('ana-perez-ab123456')).data.id,'11111111-1111-4111-8111-111111111111');
const helperSource=fs.readFileSync(new URL('../src/lib/profile-url.ts',import.meta.url),'utf8');
const helperJS=ts.transpileModule(helperSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};new Function('exports',helperJS)(exports);
assert.equal(exports.enlacePerfil('ley-total-abogados-4a2c72f36b','https://contratacr.com'),'https://contratacr.com/ley-total-abogados-4a2c72f36b');
assert.equal(exports.enlacePerfil('ana-perez-ab123456','https://contratacr.com'),'https://contratacr.com/ana-perez');

await assert.rejects(db.query("insert into professional_slug_aliases values ('hijack','4a2c72f3-6bfa-4ef9-9e98-a58144fd9f3d')"));
await db.exec('reset role');
await db.query('update professionals set is_banned=true where id=$1',[first]);
await db.exec('set role anon');
assert.equal((await db.query('select * from professional_slug_aliases where professional_id=$1',[first])).rows.length,0);
await db.exec('reset role');
await db.exec("update professionals set visible=false where id='44444444-4444-4444-8444-444444444444'; set role authenticated");
assert.equal((await db.query("select * from professional_slug_aliases where professional_id='44444444-4444-4444-8444-444444444444'")).rows.length,0);
await db.exec('reset role');
await db.query('delete from professionals where id=$1',[first]);
assert.equal((await db.query('select * from professional_slug_aliases where professional_id=$1',[first])).rows.length,0);
// Exercise the actual vanity rewrite in both languages, including @ legacy links.
const middleware = fs.readFileSync(new URL('../src/middleware.ts',import.meta.url),'utf8');
const rewriteStart=middleware.indexOf('  const perfilCorto =');
const rewriteEnd=middleware.indexOf('  // Direcciones que se renombraron.',rewriteStart);
assert.ok(rewriteStart>0 && rewriteEnd>rewriteStart);
const routesJS=ts.transpileModule(fs.readFileSync(new URL('../src/lib/site-routes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const routes={};new Function('exports',routesJS)(routes);
const rewrite=new Function('pathname','request','RUTAS_DEL_SITIO','reescribirConIdioma',middleware.slice(rewriteStart,rewriteEnd));
for(const lang of ['es','en']) for(const name of ['ley-total-abogados-4a2c72f36b','luis-gerardo-suarez-chaves','@luis-gerardo-suarez-chaves']) {
 const path=`${lang==='en'?'/en':''}/${name}`;
 const url=new URL(`https://contratacr.com${path}?tab=reviews`);
 const destination=rewrite(path,{url:url.href,nextUrl:url},routes.RUTAS_DEL_SITIO,(_request,destination)=>destination);
 assert.equal(destination.pathname,`/${lang}/profesionales/${name.replace('@','')}`);
 assert.equal(destination.search,'?tab=reviews');
}
for(const name of routes.RUTAS_DEL_SITIO) for(const prefix of ['','/en']) {
 const path=`${prefix}/${name}`; const url=new URL(`https://contratacr.com${path}`);
 assert.equal(rewrite(path,{url:url.href,nextUrl:url},routes.RUTAS_DEL_SITIO,()=>{throw Error('Site route captured');}),undefined);
}
await db.close();
console.log('Business URL SQL passed: existing/new/renamed businesses, personal URLs unchanged, accents, duplicate names and ID-prefix collision, reserved route safety, historical full/short aliases, ambiguity, public RLS, banned/hidden profiles, write denial and deletion cleanup.');
