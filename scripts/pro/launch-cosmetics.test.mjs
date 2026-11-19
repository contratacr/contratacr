// Run: node --test scripts/pro/launch-cosmetics.test.mjs
// LOCAL PRO ONLY (launch fixes 2026-11-17). Pure unit tests, no DB/network:
//  - src/lib/text/sentence.ts: «6:17 p. m..» (Intl time + hard-coded sentence period).
//  - src/lib/pro/project-invite-handoff.ts: the join page keeps its «joined» result (never the code) across a reload.
import test from 'node:test';
import assert from 'node:assert/strict';

const {endSentence}=await import('../../src/lib/text/sentence.ts');
const H=await import('../../src/lib/pro/project-invite-handoff.ts');

test('endSentence never doubles the period after an Intl time (es-CR «p. m.»)',()=>{
 const date=new Intl.DateTimeFormat('es-CR',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date('2026-11-25T00:17:00Z'));
 assert.match(date,/m\.$/u,'es-CR short time ends with «m.»');
 const text=endSentence(`Invitación abierta, vence el ${date}`);
 assert.ok(!text.includes('..'),text);assert.ok(text.endsWith('m.'),text);
 const en=new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'America/Costa_Rica'}).format(new Date('2026-11-25T00:17:00Z'));
 assert.equal(endSentence(`Open invitation, expires ${en}`),`Open invitation, expires ${en}.`);
});
test('endSentence adds one period only when the sentence has no terminal punctuation',()=>{
 assert.equal(endSentence('Hola'),'Hola.');assert.equal(endSentence('Hola.'),'Hola.');assert.equal(endSentence('¿Listo?'),'¿Listo?');
 assert.equal(endSentence('Espere…'),'Espere…');assert.equal(endSentence('Dijo «sí.»'),'Dijo «sí.»');assert.equal(endSentence('Hola  '),'Hola.');
});

function fakeStorage(){const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),clear:()=>m.clear(),_m:m};}
test('join page: only the request id is remembered after joining; the code is never stored with it',()=>{
 globalThis.sessionStorage=fakeStorage();
 const code='A'.repeat(43);
 H.stashProjectInviteCode(code);
 assert.equal(H.takeProjectInviteCode(),code);assert.equal(H.takeProjectInviteCode(),null,'the code is consumed once (sign-in handoff contract)');
 assert.ok(H.rememberProjectInviteJoined('b2b7fdf2-e135-452e-b276-1e263c3b0827'));
 assert.ok(![...globalThis.sessionStorage._m.values()].some(v=>v.includes(code)),'the code is never stored with the result');
 assert.equal(H.readProjectInviteJoined(),'b2b7fdf2-e135-452e-b276-1e263c3b0827','a reload after joining shows the confirmation');
 H.forgetProjectInviteJoined();assert.equal(H.readProjectInviteJoined(),null);
});
test('join page: a stale «joined» marker (over 30 min) is ignored and removed',()=>{
 globalThis.sessionStorage=fakeStorage();
 globalThis.sessionStorage.setItem('ccr:project-invite-joined',JSON.stringify({requestId:'x',at:Date.now()-31*60*1000}));
 assert.equal(H.readProjectInviteJoined(),null);assert.equal(globalThis.sessionStorage.getItem('ccr:project-invite-joined'),null);
});
test('join page: storage failures never throw',()=>{
 globalThis.sessionStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 assert.equal(H.readProjectInviteJoined(),null);assert.equal(H.rememberProjectInviteJoined('x'),false);
 assert.doesNotThrow(()=>H.forgetProjectInviteJoined());
});
