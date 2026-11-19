// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-saved-lists-local.sql.
// Create/rename/add/remove/share/delete with CAS + idempotency, owner isolation, share token without any id, a new token
// after re-sharing, public reader limited to public places, caps, no deletes, RLS/anon denial.
import assert from 'node:assert/strict';
import {setup,uuid,id,code,hint} from './directory-features-db-harness.mjs';

const {q,call,mk,mutate,denied,db}=await setup(['directory-saved-lists-local.sql']);
const ana=id(0xa1),beto=id(0xb1);
await mk(1);await mk(2,'cafe_bar',{attributes:{kind:'cafe'}});await mk(3,'restaurant',{publish:false});
const m=(actor,input)=>call('dir_saved_list_mutate',actor,{actionId:uuid(),...input});
const L=uuid();
await assert.rejects(()=>m(null,{action:'create',listId:L,name:'Favoritos'}),hint('dir_list_login','42501'));
const cIn={actionId:uuid(),action:'create',listId:L,name:'  Sodas   de   San José '};
const c=await call('dir_saved_list_mutate',ana,cIn);assert.deepEqual([c.revision,c.name,c.shareToken],[1,'Sodas de San José',null],'private by default');
assert.deepEqual(await call('dir_saved_list_mutate',ana,cIn),c,'idempotent');
for(const bad of [{name:''},{name:'x'.repeat(81)},{name:'ver www.x.cr'},{extra:1}])await assert.rejects(()=>m(ana,{action:'create',listId:uuid(),name:'Lista',...bad}),code('22023'),JSON.stringify(bad));
const a1=await m(ana,{action:'add',listId:L,revision:1,slug:'lugar-1'});assert.equal(a1.revision,2);
await assert.rejects(()=>m(ana,{action:'add',listId:L,revision:2,slug:'lugar-1'}),hint('dir_list_item_exists','23505'));
await assert.rejects(()=>m(ana,{action:'add',listId:L,revision:2,slug:'lugar-3'}),code('P0002'),'unpublished place');
await assert.rejects(()=>m(ana,{action:'add',listId:L,revision:1,slug:'lugar-2'}),code('40001'),'CAS');
await m(ana,{action:'add',listId:L,revision:2,slug:'lugar-2'});
await assert.rejects(()=>m(beto,{action:'add',listId:L,revision:3,slug:'lugar-2'}),code('P0002'),'someone else cannot touch the list');
await assert.rejects(()=>m(beto,{action:'share_on',listId:L,revision:3}),code('P0002'));
const mine=(await q('select dir_saved_lists_mine($1,$2) x',[ana,'lugar-2']))[0].x;assert.equal(mine.length,1);assert.equal(mine[0].count,2);assert.equal(mine[0].hasPlace,true);
assert.deepEqual((await q('select dir_saved_lists_mine($1) x',[beto]))[0].x,[],'other people see nothing');
// share link
const sh=await m(ana,{action:'share_on',listId:L,revision:3});assert.match(sh.shareToken,/^[a-f0-9]{32}$/);
assert.ok(!sh.shareToken.includes(ana.replace(/-/g,'').slice(0,12))&&!sh.shareToken.includes(L.replace(/-/g,'').slice(0,12)),'token carries no id');
const pub=(await q('select dir_saved_list_public($1) p',[sh.shareToken]))[0].p;
assert.equal(pub.name,'Sodas de San José');assert.deepEqual(pub.places.map(p=>p.slug).sort(),['lugar-1','lugar-2']);
assert.deepEqual(Object.keys(pub).sort(),['name','places'],'public reader: name + places only');
assert.ok(!JSON.stringify(pub).includes(ana)&&!JSON.stringify(pub).includes(L),'no owner or list id in the shared view');
// a place that stops being public disappears from the shared list
await mutate({action:'status',placeId:id(2),revision:(await q('select revision from dir_places where id=$1',[id(2)]))[0].revision,status:'hidden'});
assert.deepEqual((await q('select dir_saved_list_public($1) p',[sh.shareToken]))[0].p.places.map(p=>p.slug),['lugar-1']);
const off=await m(ana,{action:'share_off',listId:L,revision:4});assert.equal(off.shareToken,null);
assert.equal((await q('select dir_saved_list_public($1) p',[sh.shareToken]))[0].p,null,'old link stops working');
const sh2=await m(ana,{action:'share_on',listId:L,revision:5});assert.notEqual(sh2.shareToken,sh.shareToken,'new token');
await m(ana,{action:'remove',listId:L,revision:6,slug:'lugar-1'});
await assert.rejects(()=>m(ana,{action:'remove',listId:L,revision:7,slug:'lugar-1'}),code('P0002'));
await m(ana,{action:'add',listId:L,revision:7,slug:'lugar-1'});
await m(ana,{action:'rename',listId:L,revision:8,name:'Para el finde'});
await assert.rejects(()=>m(ana,{action:'rename',listId:L,revision:9,name:'Para el finde'}),code('22023'),'nothing to change');
const del=await m(ana,{action:'delete',listId:L,revision:9});assert.deepEqual([del.status,del.shareToken],['deleted',null]);
assert.equal((await q('select dir_saved_list_public($1) p',[sh2.shareToken]))[0].p,null,'deleted list is not shared');
await assert.rejects(()=>m(ana,{action:'rename',listId:L,revision:10,name:'Otra'}),code('P0002'),'deleted list is final');
// caps: 30 new lists a day
for(let i=0;i<29;i++)await m(ana,{action:'create',listId:uuid(),name:'Lista '+i});
await assert.rejects(()=>m(ana,{action:'create',listId:uuid(),name:'Una más'}),hint('dir_list_cap','54000'));
assert.equal((await q('select count(*)::int n from dir_saved_list_changes where list_id=$1',[L]))[0].n,10,'every change recorded');
await db.exec('reset role');
await assert.rejects(()=>db.query('delete from dir_saved_lists'),code('23514'));await assert.rejects(()=>db.query('delete from dir_saved_list_changes'),code('23514'));
await db.exec('set role service_role');
await denied(['dir_saved_lists','dir_saved_list_items','dir_saved_list_changes'],["dir_saved_list_public('00')","dir_saved_list_mutate(null,'{}'::jsonb)"]);
console.log('PASS: saved lists (private by default, CAS + idempotency, owner isolation, share token without ids, re-share = new token, caps, RLS/anon denial)');
