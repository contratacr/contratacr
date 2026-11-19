// LOCAL PRO ONLY (place features round, 2026-11-17): in-memory PGlite verification of directory-reservations-local.sql.
// Opt-in settings (claimed restaurants/cafés only, CAS, history), public config/availability, booking requests with
// capacity, idempotency and caps, same-day waitlist, owner/team decisions (CAS, transitions, member/read_only roles),
// immutable events and MOCK notices, RLS/anon denial.
import assert from 'node:assert/strict';
import {setup,uuid,id,hex,code,hint} from './directory-features-db-harness.mjs';

const {q,call,call3,mk,claim,team,denied,db}=await setup(['directory-reservations-local.sql']);
const owner=id(0xd1),member=id(0xe1),reader=id(0xe2),ana=id(0xa1),beto=id(0xb1),stranger=id(0xf1);
await mk(1);await mk(2,'pharmacy');await mk(3,'cafe_bar',{attributes:{kind:'cafe'}});await mk(4);
await claim(1,owner);await claim(2,owner);
await team(member,owner,'member');await team(reader,owner,'read_only');
const today=(await q("select dir_cr_now()::date::text d"))[0].d;
const plus=n=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const allDays=time=>[0,1,2,3,4,5,6].map(weekday=>({weekday,time,capacity:6}));
const settings=(over={})=>({actionId:uuid(),placeId:id(1),revision:0,enabled:true,waitlistEnabled:true,partyMax:8,horizonDays:30,minNoticeMinutes:0,slots:[...allDays('12:00'),...allDays('23:45')],...over});

// ---------------------------------------------------------------- settings
assert.equal(await q("select dir_reservation_public_config('lugar-1') c").then(r=>r[0].c),null,'off by default');
await assert.rejects(()=>call3('dir_reservation_settings_mutate',stranger,null,settings()),hint('dir_tool_not_manager','42501'),'not the manager');
await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,null,settings({placeId:id(2)})),hint('dir_reservations_section'),'pharmacy cannot take reservations');
await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,null,settings({slots:[]})),hint('dir_reservations_no_slots'),'enabled needs slots');
for(const bad of [{slots:[{weekday:7,time:'12:00',capacity:4}]},{slots:[{weekday:1,time:'12:10',capacity:4}]},{slots:[{weekday:1,time:'12:00',capacity:0}]},
 {slots:[{weekday:1,time:'12:00',capacity:4},{weekday:1,time:'12:00',capacity:5}]},{partyMax:0},{horizonDays:200},{extra:1},{enabled:'yes'}])
 await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,null,settings(bad)),code('22023'),JSON.stringify(bad));
await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,reader,settings()),hint('dir_tool_role','42501'),'read_only member cannot change settings');
const s1in=settings();const s1=await call3('dir_reservation_settings_mutate',owner,null,s1in);assert.equal(s1.revision,1);
assert.deepEqual(await call3('dir_reservation_settings_mutate',owner,null,s1in),s1,'idempotent actionId');
await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,null,{...s1in,partyMax:6}),code('22023'),'actionId reused with other input');
await assert.rejects(()=>call3('dir_reservation_settings_mutate',owner,null,settings({revision:0})),code('40001'),'CAS');
const s2=await call3('dir_reservation_settings_mutate',owner,member,settings({revision:1,partyMax:6}));assert.equal(s2.revision,2,'member (work.write) can manage');
assert.equal((await q('select count(*)::int n from dir_reservation_settings_history where place_id=$1',[id(1)]))[0].n,2,'history per version');
const cfg=(await q("select dir_reservation_public_config('lugar-1') c"))[0].c;assert.equal(cfg.partyMax,6);assert.equal(cfg.waitlistOpen,true);assert.equal(cfg.today,today);
assert.equal((await q("select dir_reservation_public_config('lugar-4') c"))[0].c,null,'unclaimed place: no form');
const av=(await q("select dir_reservation_availability('lugar-1',$1::date) a",[plus(2)]))[0].a;assert.deepEqual(av,[{time:'12:00',left:6},{time:'23:45',left:6}]);
assert.deepEqual((await q("select dir_reservation_availability('lugar-1',$1::date) a",[plus(40)]))[0].a,[],'beyond horizon');

// ---------------------------------------------------------------- requests
const vh=hex('device-1');
const req=(actor,over={})=>call('dir_reservation_request',actor,{actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(2),time:'12:00',partySize:2,name:'Ana Mora',email:'ana@example.test',...over});
const r1in={actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(2),time:'12:00',partySize:4,name:'  Ana   Mora ',phone:'+506 8888 0000'};
const r1=await call('dir_reservation_request',ana,r1in);assert.equal(r1.status,'pending');assert.match(r1.reference,/^[A-Z0-9]{6}$/);assert.equal(r1.notice.channel,'sms');
assert.deepEqual(await call('dir_reservation_request',ana,r1in),r1,'idempotent request');
assert.equal((await q('select name from dir_reservations where id=$1',[r1in.reservationId]))[0].name,'Ana Mora');
await assert.rejects(()=>req(beto,{partySize:3}),hint('dir_reservation_full','23514'),'capacity: 4 + 3 > 6');
assert.equal((await req(beto,{partySize:2})).status,'pending','exactly fills the slot');
await assert.rejects(()=>req(beto,{partySize:1}),hint('dir_reservation_full'));
await assert.rejects(()=>req(beto,{partySize:7,time:'23:45'}),hint('dir_reservation_party'),'party max');
await assert.rejects(()=>req(beto,{time:'13:00'}),hint('dir_reservation_slot'),'not a slot');
await assert.rejects(()=>req(beto,{day:plus(-1)}),hint('dir_reservation_slot'),'past day');
for(const bad of [{name:'A'},{email:null,phone:null},{email:'x@'},{phone:'abc'},{note:'ver https://x.cr'},{partySize:'2'},{extra:1}])
 await assert.rejects(()=>req(beto,{time:'23:45',...bad}),code('22023'),JSON.stringify(bad));
await assert.rejects(()=>call('dir_reservation_request',null,{actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(2),time:'23:45',partySize:1,name:'Invitado',email:'i@x.test'}),code('22023'),'guest needs a device hash');
const g1=await call('dir_reservation_request',null,{actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(3),time:'23:45',partySize:1,name:'Invitado',email:'i@x.test',visitorHash:vh});assert.equal(g1.status,'pending','guest by device');
await assert.rejects(()=>req(ana,{slug:'lugar-4'}),hint('dir_reservations_off','P0002'),'place without reservations');
// caps: 3 active per person and place
await req(ana,{day:plus(3),time:'12:00',partySize:1});await req(ana,{day:plus(4),time:'12:00',partySize:1});
await assert.rejects(()=>req(ana,{day:plus(5),time:'12:00',partySize:1}),hint('dir_reservation_cap','54000'),'3 active bookings per place');

// ---------------------------------------------------------------- decisions
const rev=async rid=>(await q('select revision from dir_reservations where id=$1',[rid]))[0].revision;
const decide=(actor,memberId,rid,action,revision)=>call3('dir_reservation_decide',actor,memberId,{actionId:uuid(),reservationId:rid,revision,action});
await assert.rejects(()=>decide(stranger,null,r1in.reservationId,'confirm',1),hint('dir_tool_not_manager'));
await assert.rejects(()=>decide(owner,reader,r1in.reservationId,'confirm',1),hint('dir_tool_role'),'read_only cannot decide');
await assert.rejects(()=>decide(owner,null,r1in.reservationId,'seated',1),hint('dir_reservation_transition'),'pending cannot be seated');
const dIn={actionId:uuid(),reservationId:r1in.reservationId,revision:1,action:'confirm'};
const d1=await call3('dir_reservation_decide',owner,member,dIn);assert.equal(d1.status,'confirmed');assert.equal(d1.notice.kind,'confirmed');assert.equal(d1.notice.channel,'sms');assert.equal(d1.notice.to,'+506 8888 0000');
assert.deepEqual(await call3('dir_reservation_decide',owner,member,dIn),d1,'idempotent decision');
await assert.rejects(()=>decide(owner,null,r1in.reservationId,'cancel',1),code('40001'),'stale revision');
assert.equal((await decide(owner,null,r1in.reservationId,'seated',await rev(r1in.reservationId))).notice,null,'seated: no notice');
const g1d=await decide(owner,null,g1.reservationId,'decline',1);assert.equal(g1d.notice.kind,'declined');assert.equal(g1d.notice.channel,'email');
assert.deepEqual((await q('select action,from_status,to_status,member_id from dir_reservation_events where reservation_id=$1 order by id',[r1in.reservationId])).map(e=>[e.action,e.from_status,e.to_status,e.member_id]),
 [['request',null,'pending',null],['confirm','pending','confirmed',member],['seated','confirmed','seated',null]],'immutable event trail');
assert.deepEqual((await q("select kind,channel,sender from dir_reservation_notices where reservation_id=$1 order by id",[r1in.reservationId])).map(n=>[n.kind,n.channel,n.sender]),[['received','sms','mock'],['confirmed','sms','mock']]);
await db.exec('reset role');
await assert.rejects(()=>db.query("update dir_reservation_events set action='cancel'"),code('23514'),'events immutable');
await assert.rejects(()=>db.query("update dir_reservation_notices set sender='mock'"),code('23514'),'notices immutable');
await assert.rejects(()=>db.query("update dir_reservations set name='Otro'"),code('23514'),'details immutable');
await assert.rejects(()=>db.query("delete from dir_reservations"),code('23514'),'no deletes');
await assert.rejects(()=>db.query("insert into dir_reservation_notices(reservation_id,kind,channel,sender,action_id) values($1,'confirmed','email','brevo',$2)",[r1in.reservationId,uuid()]),code('23514'),'only the mock sender');
await db.exec('set role service_role');

// ---------------------------------------------------------------- waitlist
const join=(actor,over={})=>call('dir_waitlist_join',actor,{actionId:uuid(),reservationId:uuid(),slug:'lugar-1',partySize:2,name:'Lista Uno',phone:'8888 1111',...over});
const w1=await join(beto);assert.equal(w1.status,'waiting');assert.equal(w1.position,1);
await assert.rejects(()=>join(beto),hint('dir_waitlist_exists','23505'),'one active entry per person');
const w2=await join(null,{visitorHash:hex('device-2'),name:'Lista Dos'});assert.equal(w2.position,2);
const ready=await decide(owner,member,w1.reservationId,'notify_ready',1);assert.equal(ready.status,'notified');assert.equal(ready.notice.kind,'table_ready');assert.equal(ready.notice.channel,'sms');
assert.equal((await decide(owner,null,w1.reservationId,'seated',2)).status,'seated');
await assert.rejects(()=>decide(owner,null,w1.reservationId,'left',3),hint('dir_reservation_transition'));
assert.equal((await decide(owner,null,w2.reservationId,'left',1)).status,'left');
// ---------------------------------------------------------------- customer self-service (private link, cancel)
const carla=id(0xc1),tok=s=>hex('token-'+s);
const cIn={actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(5),time:'23:45',partySize:2,name:'Carla Soto',email:'carla@example.test',accessHash:tok('c1')};
const c1=await call('dir_reservation_request',carla,cIn);assert.equal(c1.status,'pending');
assert.deepEqual(await call('dir_reservation_request',carla,cIn),c1,'idempotent with access hash');
await assert.rejects(()=>call('dir_reservation_request',carla,{...cIn,actionId:uuid(),reservationId:uuid()}),code('22023'),'access hash is unique');
await assert.rejects(()=>req(carla,{time:'23:45',day:plus(6),accessHash:'XYZ'}),code('22023'),'access hash format');
const byTok=async t=>(await q('select dir_reservation_by_access($1) r',[t]))[0].r;
const st1=await byTok(tok('c1'));
assert.equal(st1.status,'pending');assert.equal(st1.canCancel,true);assert.equal(st1.placeSlug,'lugar-1');assert.equal(st1.reference,c1.reference);
for(const k of ['id','reservationId','placeId','customerId','visitorHash','email','phone','accessHash'])assert.ok(!(k in st1),'no '+k+' in the customer view');
assert.deepEqual(st1.timeline.map(e=>[e.action,e.status]),[['request','pending']]);
assert.equal(await byTok(tok('nope')),null,'unknown token');assert.equal(await byTok('not-hex'),null,'bad token');
const mine=(await q('select dir_reservation_mine($1) r',[carla]))[0].r;assert.equal(mine.length,1);assert.equal(mine[0].id,cIn.reservationId,'server-side id for the link');
assert.deepEqual((await q('select dir_reservation_mine($1) r',[stranger]))[0].r,[],'only their own');
const cancel=(over={})=>q('select dir_reservation_customer_cancel($1) r',[{actionId:uuid(),accessHash:tok('c1'),revision:1,...over}]).then(r=>r[0].r);
await assert.rejects(()=>cancel({revision:2}),code('40001'),'CAS on cancel');
await assert.rejects(()=>cancel({accessHash:tok('nope')}),code('P0002'),'unknown link');
await assert.rejects(()=>cancel({extra:1}),code('22023'));
const ccIn={actionId:uuid(),accessHash:tok('c1'),revision:1};
const cc=(await q('select dir_reservation_customer_cancel($1) r',[ccIn]))[0].r;
assert.equal(cc.status,'cancelled');assert.equal(cc.canCancel,false);assert.equal(cc.ownerNotice.kind,'customer_cancelled');assert.equal(cc.ownerNotice.placeId,id(1));
assert.deepEqual((await q('select dir_reservation_customer_cancel($1) r',[ccIn]))[0].r,cc,'idempotent cancel');
await assert.rejects(()=>cancel({revision:2}),hint('dir_reservation_cancel_closed'),'already cancelled');
assert.deepEqual((await q('select action,from_status,to_status,actor_id from dir_reservation_events where reservation_id=$1 order by id',[cIn.reservationId])).map(e=>[e.action,e.from_status,e.to_status,e.actor_id]),
 [['request',null,'pending',carla],['customer_cancel','pending','cancelled',carla]],'immutable customer_cancel event');
assert.deepEqual((await q('select kind,sender from dir_reservation_notices where reservation_id=$1 order by id',[cIn.reservationId])).map(n=>[n.kind,n.sender]),[['received','mock'],['customer_cancelled','mock']]);
assert.equal(await call3('dir_reservation_decide',owner,null,{actionId:uuid(),reservationId:cIn.reservationId,revision:2,action:'confirm'}).catch(e=>e.hint),'dir_reservation_transition','owner cannot revive a cancelled booking');
// Seated/no-show and confirmed-in-the-past cannot be cancelled by the customer.
const c2In={actionId:uuid(),reservationId:uuid(),slug:'lugar-1',day:plus(6),time:'23:45',partySize:1,name:'Carla Soto',phone:'8888 2222',accessHash:tok('c2')};
await call('dir_reservation_request',carla,c2In);await decide(owner,null,c2In.reservationId,'confirm',1);
assert.equal((await byTok(tok('c2'))).status,'confirmed');assert.equal((await byTok(tok('c2'))).canCancel,true,'confirmed: still before the time');
await decide(owner,null,c2In.reservationId,'no_show',2);
await assert.rejects(()=>cancel({accessHash:tok('c2'),revision:3}),hint('dir_reservation_cancel_closed'),'no-show cannot be cancelled');
const past=(await q("select dir_reservation_customer_can_cancel(jsonb_populate_record(null::dir_reservations,jsonb_build_object('kind','booking','status','confirmed','day',(dir_cr_now()-interval '1 day')::date,'slot_time','12:00'))) r"))[0].r;
assert.equal(past,false,'after the start time');
// Waitlist: position, «table ready», leave by link.
const wIn={actionId:uuid(),reservationId:uuid(),slug:'lugar-1',partySize:2,name:'Carla Soto',email:'carla@example.test',accessHash:tok('w1')};
const w3=await call('dir_waitlist_join',carla,wIn);assert.equal(w3.notice.kind,'received');
const ws=await byTok(tok('w1'));assert.equal(ws.kind,'waitlist');assert.equal(ws.position,w3.position);assert.equal(ws.canCancel,true);
await decide(owner,null,wIn.reservationId,'notify_ready',1);
const wr=await byTok(tok('w1'));assert.equal(wr.status,'notified');assert.equal(wr.position,null,'ready: no position');
const wc=await cancel({accessHash:tok('w1'),revision:2});assert.equal(wc.status,'left');assert.equal(wc.ownerNotice.waitlist,true);
await db.exec('reset role');
await assert.rejects(()=>db.query("update dir_reservations set access_hash=$1 where id=$2",[tok('x'),wIn.reservationId]),code('23514'),'access hash immutable');
await db.exec('set role service_role');
await call3('dir_reservation_settings_mutate',owner,null,settings({revision:2,waitlistEnabled:false}));
await assert.rejects(()=>join(ana),hint('dir_waitlist_off','P0002'),'waitlist off');
// Owner day view
const view=await call3('dir_reservation_owner_read',owner,reader,id(1));assert.equal(view.settings.revision,3);assert.ok(view.items.length>=1);
await assert.rejects(()=>call3('dir_reservation_owner_read',stranger,null,id(1)),hint('dir_tool_not_manager'));
// Turning reservations off closes the public form.
await call3('dir_reservation_settings_mutate',owner,null,settings({revision:3,enabled:false}));
assert.equal((await q("select dir_reservation_public_config('lugar-1') c"))[0].c,null);
await assert.rejects(()=>req(beto,{time:'23:45',day:plus(6)}),hint('dir_reservations_off'));

await denied(['dir_reservation_settings','dir_reservation_settings_history','dir_reservations','dir_reservation_events','dir_reservation_notices'],
 ["dir_reservation_public_config('lugar-1')","dir_reservation_request(null,'{}'::jsonb)","dir_reservation_decide(null,null,'{}'::jsonb)",
  "dir_reservation_by_access('x')","dir_reservation_mine(null)","dir_reservation_customer_cancel('{}'::jsonb)"]);
console.log('PASS: reservations + waitlist (opt-in, private customer link + cancel, CAS, idempotency, capacity, caps, roles, mock notices, immutable history, RLS/anon denial)');
