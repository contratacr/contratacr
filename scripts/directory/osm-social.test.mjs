// LOCAL PRO ONLY: node --test scripts/directory/osm-social.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSocial,socialFromTags} from './osm-social.mjs';

test('links of the network itself are kept as https, without tracking query strings',()=>{
 assert.equal(normalizeSocial('facebook','https://m.facebook.com/Creaciones-NEL-106393580721338/'),'https://www.facebook.com/Creaciones-NEL-106393580721338');
 assert.equal(normalizeSocial('facebook','http://es-la.facebook.com/sodatica'),'https://www.facebook.com/sodatica');
 assert.equal(normalizeSocial('facebook','https://www.facebook.com/profile.php?id=61580437289696&ref=x'),'https://www.facebook.com/profile.php?id=61580437289696');
 assert.equal(normalizeSocial('instagram','https://www.instagram.com/bosco_parque_gastronomico/?hl=es'),'https://www.instagram.com/bosco_parque_gastronomico');
 assert.equal(normalizeSocial('x','https://twitter.com/sodatica'),'https://x.com/sodatica');
 assert.equal(normalizeSocial('youtube','https://youtu.be/abc123'),'https://youtu.be/abc123');
 assert.equal(normalizeSocial('instagram','instagram.com/soda; facebook.com/soda'),'https://www.instagram.com/soda');
});
test('bare handles become the profile link',()=>{
 assert.equal(normalizeSocial('instagram','@soda_tica'),'https://www.instagram.com/soda_tica');
 assert.equal(normalizeSocial('tiktok','sodatica'),'https://www.tiktok.com/@sodatica');
});
test('anything else is dropped',()=>{
 for(const [n,v] of [['facebook','https://evil.example/facebook.com/x'],['facebook','javascript:alert(1)'],['facebook','https://www.facebook.com/search/top?q=soda'],
  ['facebook','https://www.facebook.com/profile.php'],['instagram','https://www.instagram.com/'],['instagram','https://www.facebook.com/soda'],['x','https://user:pw@x.com/a'],
  ['facebook','Soda La Tica'],['facebook',''],['facebook',42],['myspace','soda']])assert.equal(normalizeSocial(n,v),null,`${n} ${v}`);
});
test('socialFromTags prefers contact:* and returns undefined without valid values',()=>{
 assert.deepEqual(socialFromTags({'contact:facebook':'https://www.facebook.com/a','facebook':'https://www.facebook.com/b',instagram:'@c',twitter:'nope nope'}),
  {facebook:'https://www.facebook.com/a',instagram:'https://www.instagram.com/c'});
 assert.equal(socialFromTags({name:'Soda',website:'https://www.facebook.com/a'}),undefined);
});
test('stage-import keeps the social links of a place in attributes.social, next to its kind',async()=>{
 const {parseImport}=await import('./stage-import.mjs');
 const text=JSON.stringify({elements:[{type:'node',id:1,lat:9.93,lon:-84.08,tags:{amenity:'restaurant',name:'Soda Las Palmas','contact:facebook':'https://m.facebook.com/sodalaspalmas/',instagram:'@sodalaspalmas',twitter:'http://evil.example/x'}}]});
 const rows=parseImport(text).rows??parseImport(text);
 const row=(Array.isArray(rows)?rows:[]).find(r=>r.ref==='node/1');
 assert.ok(row,'row staged');
 assert.deepEqual(row.attributes?.social,{facebook:'https://www.facebook.com/sodalaspalmas',instagram:'https://www.instagram.com/sodalaspalmas'});
});
