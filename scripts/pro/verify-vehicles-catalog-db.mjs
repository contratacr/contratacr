// Isolated in-memory PostgreSQL: vehicle reference catalog idempotency, constraints and RLS.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PRO_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const sql = await readFile('docs/pro/sql/vehicles-catalog-local.sql', 'utf8');
await db.exec(sql);
const counts = async () => (await db.query(`select (select count(*)::int from ref_vehicle_makes) m,(select count(*)::int from ref_vehicle_models) o`)).rows[0];
const first = await counts();
await db.exec(sql);
assert.deepEqual(await counts(), first, 'second apply must not duplicate rows');
assert.ok(first.m >= 50 && first.o >= 300, 'seed size');

// Reviewed rows are never overwritten by a re-seed.
await db.exec(`update ref_vehicle_models set name='Hilux (revisado)', seed_status='reviewed' where slug='hilux'`);
await db.exec(sql);
assert.equal((await db.query(`select name from ref_vehicle_models where slug='hilux'`)).rows[0].name, 'Hilux (revisado)');

// Coverage: all kinds present, key makes/models.
const kinds = (await db.query(`select distinct vehicle_type t from ref_vehicle_models order by 1`)).rows.map((r) => r.t);
assert.deepEqual(kinds, ['atv', 'car', 'motorcycle', 'pickup', 'suv', 'truck', 'van']);
assert.equal((await db.query(`select count(*)::int n from ref_vehicle_models o join ref_vehicle_makes m on m.id=o.make_id where m.slug='toyota' and o.slug in ('hilux','yaris','rav4')`)).rows[0].n, 3);
assert.equal((await db.query(`select count(*)::int n from ref_vehicle_models o left join ref_vehicle_makes m on m.id=o.make_id where m.id is null`)).rows[0].n, 0);

// Constraints.
await assert.rejects(() => db.query(`insert into ref_vehicle_models(make_id,slug,name,vehicle_type) values ((select id from ref_vehicle_makes limit 1),'x','X','boat')`));
await assert.rejects(() => db.query(`insert into ref_vehicle_makes(slug,name) values ('Bad Slug','x')`));
await assert.rejects(() => db.query(`insert into ref_vehicle_models(make_id,slug,name,vehicle_type) select make_id,slug,name,vehicle_type from ref_vehicle_models limit 1`));

// RLS: enabled; anon/authenticated denied; service_role allowed.
const rls = (await db.query(`select relname, relrowsecurity from pg_class where relname in ('ref_vehicle_makes','ref_vehicle_models') order by 1`)).rows;
assert.ok(rls.length === 2 && rls.every((r) => r.relrowsecurity));
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(() => db.query('select * from ref_vehicle_makes'), /permission denied/i, role);
  await assert.rejects(() => db.query(`insert into ref_vehicle_makes(slug,name) values ('hack','Hack')`), /permission denied/i, role);
  await db.exec('reset role');
}
await db.exec('set role service_role');
assert.equal((await db.query('select count(*)::int n from ref_vehicle_makes')).rows[0].n, first.m);
await db.query(`insert into ref_vehicle_makes(slug,name) values ('test-make','Test Make')`);
await db.exec('reset role');
console.log(`PASS vehicles catalog: ${first.m} makes, ${first.o} models; idempotent re-apply, reviewed rows preserved, constraints, RLS service_role only.`);
