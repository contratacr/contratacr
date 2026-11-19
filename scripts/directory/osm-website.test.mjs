// LOCAL PRO ONLY: node --test scripts/directory/osm-website.test.mjs
// Samples are real website values from the Costa Rica Overpass dump used for the seed (2026-11-16).
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeWebsite} from './osm-website.mjs';

const ok=v=>{const r=normalizeWebsite(v);assert.equal(r.ok,true,`${v}: ${r.reason}`);return r.url;};
const no=v=>{const r=normalizeWebsite(v);assert.equal(r.ok,false,`${v} should be rejected`);return r.reason;};

test('http(s) URLs are kept, host lower-cased, bare «/» and fragment removed',()=>{
 assert.equal(ok('http://www.fischel.cr/'),'http://www.fischel.cr','http stays http (never upgraded silently)');
 assert.equal(ok('https://www.facebook.com/dominospizzacr/'),'https://www.facebook.com/dominospizzacr/');
 assert.equal(ok('https://www.instagram.com/bosco_parque_gastronomico/?hl=es'),'https://www.instagram.com/bosco_parque_gastronomico/?hl=es');
 assert.equal(ok('http://www.walmartmexico.com.mx/directorio_costarica.html'),'http://www.walmartmexico.com.mx/directorio_costarica.html');
 assert.equal(ok('HTTPS://WWW.Example.CR/#menu'),'https://www.example.cr');
 assert.equal(ok('  https://example.com/a  '),'https://example.com/a');
});
test('«www.» without scheme becomes https; several values keep the first',()=>{
 assert.equal(ok('www.masxmenos.co.cr/'),'https://www.masxmenos.co.cr');
 assert.equal(ok('www.vanzuco.com'),'https://www.vanzuco.com');
 assert.equal(ok('https://a.example.com; https://b.example.com'),'https://a.example.com');
});
test('rejects obviously bad values',()=>{
 assert.equal(no('no'),'no_scheme');assert.equal(no('Fundaca'),'no_scheme');assert.equal(no('example.com'),'no_scheme');
 assert.equal(no('Tilapiera y Reto Los Laguitos'),'whitespace');
 assert.equal(no('https://www.instagram.com/cevichesguty/https://www.facebook.com/profile.php?id=61580437289696'),'several_urls');
 assert.equal(no('https://www.facebook.com/search/top?q=bar%20restaurant%20los%20laureles'),'search_page');
 assert.equal(no('javascript:alert(1)'),'scheme');assert.equal(no('mailto:info@example.com'),'scheme');assert.equal(no('ftp://example.com'),'scheme');
 assert.equal(no('https://user:pass@example.com'),'credentials');assert.equal(no('http://example.com:8080/'),'port');
 assert.equal(no('http://192.168.1.1/'),'host');assert.equal(no('http://localhost/'),'host');assert.equal(no('https://intranet/'),'host');
 assert.equal(no('https://example.com/'+'a'.repeat(600)),'too_long');
 assert.equal(no(''),'empty');assert.equal(no(undefined),'empty');assert.equal(no(';'),'empty');
});
test('every accepted URL satisfies the dir_places website check',()=>{
 for(const v of ['https://x.example.org/p?q="<a>"','http://www.fischel.cr/','www.rincondedomi.com']){
  const u=ok(v);assert.match(u,/^https?:\/\/[^\s"<>]{3,}$/);assert.ok(u.length<=500);
 }
});
