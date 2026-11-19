// LOCAL PRO ONLY: node --test scripts/directory/osm-email.test.mjs (synthetic addresses shaped like the OSM dump).
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOsmEmail} from './osm-email.mjs';

const ok=v=>{const r=normalizeOsmEmail(v);assert.equal(r.ok,true,`${v}: ${r.reason}`);return r.email;};
const no=v=>{const r=normalizeOsmEmail(v);assert.equal(r.ok,false,`${v} should be rejected`);return r.reason;};

test('valid addresses are trimmed and lower-cased; free mailboxes are accepted (the claimant never picks them)',()=>{
 assert.equal(ok('  Info@SodaEjemplo.CR '),'info@sodaejemplo.cr');
 assert.equal(ok('sodalaesquina@gmail.com'),'sodalaesquina@gmail.com');
 assert.equal(ok('SAC.Tienda@wal-mart.com'),'sac.tienda@wal-mart.com');
 assert.equal(ok('ventas+web@empresa.co.cr'),'ventas+web@empresa.co.cr');
});
test('«mailto:» removed and several values keep the first',()=>{
 assert.equal(ok('mailto:reservas@hotel-ejemplo.com'),'reservas@hotel-ejemplo.com');
 assert.equal(ok('uno@ejemplo.cr; dos@ejemplo.cr'),'uno@ejemplo.cr');
 assert.equal(ok('uno@ejemplo.cr, dos@ejemplo.cr'),'uno@ejemplo.cr');
});
test('rejects values that cannot receive a code',()=>{
 assert.equal(no(''),'empty');assert.equal(no(null),'empty');assert.equal(no(' ; '),'empty');
 assert.equal(no('Soda La Esquina'),'whitespace');assert.equal(no('ejemplo.cr'),'no_at');assert.equal(no('a@b@ejemplo.cr'),'several_at');
 assert.equal(no('admin@localhost'),'domain');assert.equal(no('x@192.168.1.1'),'domain');
 assert.equal(no('prueba@algo.test'),'reserved');assert.equal(no('prueba@ejemplo.invalid'),'reserved');
 assert.equal(no('noreply@ejemplo.cr'),'no_reply');assert.equal(no('no-reply@ejemplo.cr'),'no_reply');
 assert.equal(no('ñandú@ejemplo.cr'),'invalid');assert.equal(no('a..b@ejemplo.cr'),'invalid');assert.equal(no('.a@ejemplo.cr'),'invalid');
 assert.equal(no('a'.repeat(65)+'@ejemplo.cr'),'invalid');
});
test('every accepted value satisfies the database check',()=>{
 for(const v of ['info@sodaejemplo.cr','a@b.co','x_y-z%1@sub.dominio.com'])assert.match(ok(v),/^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/);
});
