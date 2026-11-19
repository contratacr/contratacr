// LOCAL PRO ONLY (multivertical F2 extras): conservative parser for the OSM `opening_hours` tag.
// Supported (the forms that cover most real Costa Rica data):
//   24/7 · Mo-Fr 07:00-21:00 · Sa,Su 08:00-12:00 · Su-Th (wrapping ranges) · 11:00-22:00 (no day = every day)
//   several ranges «12:00-15:00,18:00-23:00» · overnight «Th-Sa 11:00-02:00» · «18:00-24:00» / «18:00-00:00»
//   «;» rules (a later rule replaces the days it names) · «,» additional rules after a time («Mo-Sa 07:00-22:00, Su 07:00-21:00»)
//   off / closed · PH (public holidays: we do not model them, so «PH off» or «PH 08:00-12:00» is ignored and
//   «Mo-Su,PH 08:00-21:00» keeps Mo-Su).
// Anything else is NOT guessed: fallback rules (||), months/dates/weeks, SH, sunrise/sunset, am/pm, Spanish day names,
// missing separators, open-ended or comment forms, overlapping ranges, more than 4 ranges a day, and overnight ranges
// that close after 06:00 (e.g. «10:00-8:00», which almost always means 20:00) all return {ok:false,reason}.
// Output: weekday 0 = Sunday (same as dir_place_hours), times «HH:MM», closing «24:00» for midnight.

const DAYS=['su','mo','tu','we','th','fr','sa'];
const MAX_SLOTS_PER_DAY=4;
/** Latest closing time accepted for a range that crosses midnight (minutes after 00:00). */
export const MAX_OVERNIGHT_CLOSE=6*60;
const fail=reason=>({ok:false,reason});
const pad=n=>String(n).padStart(2,'0');
const fmt=m=>`${pad(Math.floor(m/60))}:${pad(m%60)}`;

function dayIndex(token){const i=DAYS.indexOf(token.toLowerCase());return i;}
/** «Mo-Fr,Su» / «Mo, We-Su» / «PH» → {days:Set<number>, holidays:boolean} or null when not a weekday selector. */
function parseSelector(text){
 const days=new Set();let holidays=false;
 for(const raw of text.split(/\s*,\s*/)){
  const token=raw.trim();
  if(/^ph$/i.test(token)){holidays=true;continue;}
  const range=/^([A-Za-z]{2})(?:\s*-\s*([A-Za-z]{2}))?$/.exec(token);if(!range)return null;
  const a=dayIndex(range[1]),b=range[2]?dayIndex(range[2]):a;if(a<0||b<0)return null;
  if(range[2]&&a===b)return null;// «Mo-Mo»: ambiguous (one day or the whole week)
  for(let d=a;;d=(d+1)%7){days.add(d);if(d===b)break;}
 }
 return {days,holidays};
}
/** «07:00-21:00, 22:00-23:00» → [[open,close],…] in minutes; close may be < open (overnight) or 1440 (24:00). */
function parseTimes(text){
 const out=[];
 for(const raw of text.split(/\s*,\s*/)){
  const m=/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(raw.trim());if(!m)return fail('time_syntax');
  const [oh,om,ch,cm]=m.slice(1).map(Number);
  if(oh>23||om>59||ch>24||cm>59||(ch===24&&cm!==0))return fail('time_range');
  const open=oh*60+om;let close=ch*60+cm;if(close===0)close=1440;// «18:00-00:00» = until midnight
  if(open===close)return fail('empty_range');
  if(close<open&&close>MAX_OVERNIGHT_CLOSE)return fail('suspicious_overnight');
  out.push([open,close]);
 }
 return {ok:true,ranges:out};
}
/** One rule part: «[selector] (times|off|closed)». Returns {days,holidaysOnly,off,ranges} or a failure. */
function parsePart(text){
 const part=text.trim();if(!part)return fail('empty_rule');
 if(part==='24/7')return fail('24_7_mixed');
 const m=/^(?:(.+?)\s+)?(off|closed|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/i.exec(part);
 if(!m)return fail('rule_syntax');
 let days=new Set([0,1,2,3,4,5,6]),holidaysOnly=false;
 if(m[1]){const sel=parseSelector(m[1]);if(!sel)return fail('selector_syntax');days=sel.days;holidaysOnly=sel.holidays&&sel.days.size===0;}
 if(/^(off|closed)$/i.test(m[2]))return {ok:true,days,holidaysOnly,off:true,ranges:[]};
 const times=parseTimes(m[2]);if(!times.ok)return times;
 return {ok:true,days,holidaysOnly,off:false,ranges:times.ranges};
}
/** Weekly intervals on a 10080-minute circle; true when two of them overlap (touching ends are fine). */
function overlaps(week){
 const iv=[];
 for(let d=0;d<7;d++)for(const [o,c] of week[d]){const start=d*1440+o,end=d*1440+(c<o?c+1440:c);iv.push([start,end]);}
 for(let i=0;i<iv.length;i++)for(let j=i+1;j<iv.length;j++){
  const [a1,a2]=iv[i],[b1,b2]=iv[j];
  for(const shift of [-10080,0,10080])if(a1<b2+shift&&b1+shift<a2)return true;
 }
 return false;
}

/**
 * Parses an OSM opening_hours value. Returns {ok:true,slots:[{weekday,opens,closes}]} (sorted) or {ok:false,reason}.
 * Never throws.
 */
export function parseOpeningHours(input){
 if(typeof input!=='string')return fail('empty');
 const text=input.trim();if(!text)return fail('empty');if(text.length>255)return fail('too_long');
 if(text.includes('||'))return fail('fallback_rule');
 if(text==='24/7')return {ok:true,slots:[0,1,2,3,4,5,6].map(weekday=>({weekday,opens:'00:00',closes:'24:00'}))};
 const rules=text.split(';').map(s=>s.trim());
 if(rules.at(-1)==='')rules.pop();// tolerate one trailing «;»
 if(!rules.length||rules.some(r=>!r))return fail('empty_rule');
 const week=Array.from({length:7},()=>[]);
 for(const rule of rules){
  // «,» followed by a letter right after a time or off/closed starts an additional rule (adds, does not replace).
  const parts=rule.split(/(?<=\d|\boff|\bclosed)\s*,\s*(?=[A-Za-z])/i);
  for(const [i,partText] of parts.entries()){
   const part=parsePart(partText);if(!part.ok)return part;
   if(part.holidaysOnly)continue;// public-holiday rules are not modelled
   for(const d of part.days){
    if(i===0||part.off)week[d]=[];// a «;» rule (and «off») replaces what earlier rules said for that day
    week[d].push(...part.ranges);
   }
  }
 }
 for(const day of week)if(day.length>MAX_SLOTS_PER_DAY)return fail('too_many_ranges');
 if(overlaps(week))return fail('overlapping_ranges');
 const slots=[];
 for(let d=0;d<7;d++)for(const [o,c] of [...week[d]].sort((a,b)=>a[0]-b[0]))slots.push({weekday:d,opens:fmt(o),closes:fmt(c)});
 if(!slots.length)return fail('never_open');
 return {ok:true,slots};
}
