// Pure calendar tests: no app server, network, or database.
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {spawnSync} from 'node:child_process';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
if(process.argv.includes('--timezone-case')){
 const {isQuoteExpired}=await import('../../src/lib/quotes.ts');
 const cases=[
  ['2026-11-08','2026-11-09T00:00:00.000Z',false],
  ['2026-11-08','2026-11-09T05:59:59.000Z',false],
  ['2026-11-08','2026-11-09T05:59:59.999Z',false],
  ['2026-11-08','2026-11-09T06:00:00.000Z',true],
  ['2026-11-08','2026-11-10T06:00:00.000Z',true],
  ['2024-02-29','2024-03-01T05:59:59.999Z',false],
  ['2024-02-29','2024-03-01T06:00:00.000Z',true],
  ['2026-12-31','2027-01-01T05:59:59.999Z',false],
  ['2026-12-31','2027-01-01T06:00:00.000Z',true],
 ];
 for(const [valid_until,instant,expected] of cases){const now=Date.parse(instant);assert.equal(isQuoteExpired({status:'sent',valid_until},now),expected,`${process.env.TZ}: ${valid_until} @ ${instant}`);for(const status of ['accepted','declined','withdrawn'])assert.equal(isQuoteExpired({status,valid_until},now),false);}
 assert.equal(isQuoteExpired({status:'sent',valid_until:null},Date.parse('2026-11-09T06:00:00Z')),false);
}else{
 for(const TZ of ['UTC','America/Costa_Rica','America/Los_Angeles','Asia/Tokyo']){const child=spawnSync(process.execPath,[new URL(import.meta.url).pathname,'--timezone-case'],{env:{...process.env,TZ},encoding:'utf8'});assert.equal(child.status,0,child.stderr);}
 console.log('PASS quote expiry: Costa Rica midnight, last millisecond, UTC/calendar boundaries, leap day/year end and closed states in four time zones.');
}
