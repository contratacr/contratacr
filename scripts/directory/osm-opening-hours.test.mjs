// LOCAL PRO ONLY: node --test scripts/directory/osm-opening-hours.test.mjs
// Samples are real opening_hours values from the Costa Rica Overpass dump used for the seed (2026-11-16).
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOpeningHours} from './osm-opening-hours.mjs';

const slots=text=>{const r=parseOpeningHours(text);assert.equal(r.ok,true,`${text}: ${r.reason}`);return r.slots.map(s=>`${s.weekday} ${s.opens}-${s.closes}`);};
const reason=text=>{const r=parseOpeningHours(text);assert.equal(r.ok,false,`${text} should be rejected`);return r.reason;};
const ALL=[0,1,2,3,4,5,6];

test('24/7 → every day 00:00-24:00',()=>{
 assert.deepEqual(slots('24/7'),ALL.map(d=>`${d} 00:00-24:00`));
 assert.deepEqual(slots('Tu-Su 00:00-24:00'),[2,3,4,5,6,0].sort().map(d=>`${d} 00:00-24:00`));
});
test('weekday ranges, lists and wrapping ranges',()=>{
 assert.deepEqual(slots('Mo-Fr 08:30-20:00'),[1,2,3,4,5].map(d=>`${d} 08:30-20:00`));
 assert.deepEqual(slots('We, Sa 08:00-14:00'),['3 08:00-14:00','6 08:00-14:00']);
 assert.deepEqual(slots('Su-Th 10:00-20:00; Fr-Sa 10:00-21:00'),['0 10:00-20:00','1 10:00-20:00','2 10:00-20:00','3 10:00-20:00','4 10:00-20:00','5 10:00-21:00','6 10:00-21:00']);
 assert.deepEqual(slots('Th-Mo 08:00-21:00').map(s=>s[0]),['0','1','4','5','6']);
 assert.deepEqual(slots('mo-su 11:00 - 21:00').length,7,'lower-case days and spaces around the dash');
 assert.deepEqual(slots('Mo-Fr, Su 06:30-19:00; Sa 06:30-20:00').length,7);
});
test('no day selector means every day; one-digit hours are accepted',()=>{
 assert.deepEqual(slots('11:00-22:00'),ALL.map(d=>`${d} 11:00-22:00`));
 assert.deepEqual(slots('Mo-Fr 9:00-17:00; Sa 9:00-12:30'),[1,2,3,4,5].map(d=>`${d} 09:00-17:00`).concat('6 09:00-12:30'));
});
test('«;» rules replace earlier days; «off»/«closed» close them',()=>{
 assert.deepEqual(slots('Tu-Su 08:00-15:00;Sa 08:00-12:00'),['0 08:00-15:00','2 08:00-15:00','3 08:00-15:00','4 08:00-15:00','5 08:00-15:00','6 08:00-12:00']);
 assert.deepEqual(slots('Mo-Sa 07:30-19:30; Su off').map(s=>s[0]),['1','2','3','4','5','6']);
 assert.deepEqual(slots('10:00-23:00; Tu off').map(s=>s[0]),['0','1','3','4','5','6']);
 assert.deepEqual(slots('Mo off; Tu-Fr 12:00-15:00,17:00-22:00; Sa 12:00-22:00; Su 12:00-17:00').filter(s=>s[0]==='2'),['2 12:00-15:00','2 17:00-22:00']);
 assert.deepEqual(slots('Mo-Su 11:00-22:00; Fr,Sa 11:00-23:00').filter(s=>/^[56]/.test(s)),['5 11:00-23:00','6 11:00-23:00']);
});
test('«,» after a time starts an additional rule',()=>{
 assert.deepEqual(slots('Mo-Sa 07:00-24:00, Su 07:00-22:30').filter(s=>/^[06]/.test(s)),['0 07:00-22:30','6 07:00-24:00']);
 assert.deepEqual(slots('Mo off, Tu 11:30-15:00, We-Th 11:30-21:00, Fr-Sa 11:30-22:00, Su 11:30-21:00').length,6);
 assert.deepEqual(slots('Mo-Su 11:00-21:45, Fr-Sa 21:45-22:45').filter(s=>s[0]==='5'),['5 11:00-21:45','5 21:45-22:45'],'touching ranges are fine');
});
test('PH is not modelled: PH rules are ignored, PH in a list is dropped',()=>{
 assert.deepEqual(slots('Mo-Su,PH 08:00-21:00'),ALL.map(d=>`${d} 08:00-21:00`));
 assert.deepEqual(slots('Su-Th 08:00-22:00; Fr,Sa 08:00-23:00; PH 08:00-22:00').length,7);
 assert.deepEqual(slots('Mo-Sa 07:00-20:00; Su,PH 07:00-18:00').filter(s=>s[0]==='0'),['0 07:00-18:00']);
 assert.deepEqual(slots('Mo-Fr 08:00-17:00; PH off').length,5);
});
test('several ranges a day and overnight ranges',()=>{
 assert.deepEqual(slots('Mo-Su 07:00-09:30, 12:00-14:30, 18:00-20:30').filter(s=>s[0]==='1'),['1 07:00-09:30','1 12:00-14:30','1 18:00-20:30']);
 assert.deepEqual(slots('Su,Mo-We 11:00-23:00; Th-Sa 11:00-02:00').filter(s=>/^[46]/.test(s)),['4 11:00-02:00','6 11:00-02:00']);
 assert.deepEqual(slots('Mo-Sa 11:00-02:00').length,6);
 assert.deepEqual(slots('Mo-Su 11:00-00:00')[0],'0 11:00-24:00','00:00 as closing time = midnight');
 assert.deepEqual(slots('Mo-We 11:00-22:00; Th 11:00-24:00; Fr,Sa 00:00-04:00,11:00-24:00; Su 00:00-04:00,11:00-22:00').filter(s=>s[0]==='5'),['5 00:00-04:00','5 11:00-24:00']);
});
test('rejected: non-OSM syntax, Spanish day names, am/pm, missing separators',()=>{
 for(const v of ['Lun - Dom 07:00 - 20:00','Mier - Lun 11:00 - 21:00','Di-So 8:00-15:00','mon-sun 12:00-00:00','sun-sat 08:00-21:00'])assert.equal(reason(v),'selector_syntax',v);
 for(const v of ['9am-7pm','de 8 am a 8 pm','Mo-Mo 8:00 am- 4:00 pm','sunrise-sunset','Call ahead','Mo-Sa_08:00-18:00','Mo-Su 24 hour','Tu-Su 13:00','We-Mo 12:00-18:00+',
  'Fr-Sa 10:00-22:30; Su 11:00-1800','Mo-Sa 011:00-19:00','11 00 -22 50','Mo-Su 10:00-21:45 (Local), Mo-Su 11:00-00:00 (Express)','Mo-Sa'])assert.equal(reason(v),'rule_syntax',v);
 assert.equal(reason('Mo-Sa 07:00-22:00 Su 07:00-21:00'),'selector_syntax','missing «;»');
 assert.equal(reason('Mo-Su 11:00-19:00 Su Closed'),'selector_syntax');
 assert.equal(reason('Mo-Sa 07:00-22:00 | Su 07:00-21:00'),'selector_syntax');
 assert.equal(reason('2026-06-30 off; July 01+ 12:00-18:00'),'selector_syntax','dates are not supported');
 assert.equal(reason('Mo-Mo 11:00-21:00'),'selector_syntax','Mo-Mo is ambiguous');
 assert.equal(reason('Mo-Fr 08:00-17:00 || "by appointment"'),'fallback_rule');
 assert.equal(reason('SH off'),'selector_syntax');
});
test('rejected: suspicious overnight, overlaps, never open, too many ranges, bad times',()=>{
 assert.equal(reason('Mo-Th 10:00-8:00; Fr-Su 10:00-9:00'),'suspicious_overnight','10:00-8:00 almost always means 20:00');
 assert.equal(reason('16:00-12:00'),'suspicious_overnight');
 assert.equal(reason('Mo-Su 22:00-10:00'),'suspicious_overnight');
 assert.equal(reason('Mo-Fr 08:00-19:00, 09:00-18:00; Sa, Su 08:30-18:00'),'overlapping_ranges');
 assert.equal(reason('Mo-Sa 07:00-21:30, Mo 9:00-18:00'),'overlapping_ranges');
 assert.equal(reason('Mo 20:00-03:00; Tu 02:00-10:00'),'overlapping_ranges','overnight tail overlaps the next day');
 assert.equal(reason('Su off'),'never_open');assert.equal(reason('closed'),'never_open');
 assert.equal(reason('Mo 08:00-09:00,10:00-11:00,12:00-13:00,14:00-15:00,16:00-17:00'),'too_many_ranges');
 assert.equal(reason('Mo 25:00-26:00'),'time_range');assert.equal(reason('Mo 08:00-24:30'),'time_range');assert.equal(reason('Mo 08:00-08:00'),'empty_range');
 assert.equal(reason(''),'empty');assert.equal(reason(null),'empty');assert.equal(reason('x'.repeat(300)),'too_long');
 assert.equal(reason('24/7; Su off'),'24_7_mixed');
});
test('output is sorted, ≤ 4 a day, ≤ 28 total, HH:MM',()=>{
 const r=parseOpeningHours('Fr 18:00-22:00; Sa 12:00-22:00; Su 12:00-20:00; Mo-Th 07:00-09:00,11:00-14:00,17:00-19:00,20:00-23:00');
 assert.equal(r.ok,true);assert.ok(r.slots.length<=28);
 for(const s of r.slots){assert.match(s.opens,/^([01]\d|2[0-3]):[0-5]\d$/);assert.match(s.closes,/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/);}
 const keys=r.slots.map(s=>s.weekday*10000+Number(s.opens.replace(':','')));assert.deepEqual(keys,[...keys].sort((a,b)=>a-b));
});
