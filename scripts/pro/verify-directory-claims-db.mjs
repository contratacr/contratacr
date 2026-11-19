// LOCAL PRO ONLY (multivertical F3): in-memory PGlite verification of directory-claims-local.sql (+ the core it
// depends on) and the pro-entitled-draft.sql helper. SQL is read from DIR_SQL_DIR (default docs/pro/sql).
// 2026-11-17: email_listed (code to the e-mail already on the place, masked, 30-day provenance rule), SMS off by default.
// Checks zod mirrors, OTP adapter (mock only), claim methods, state machine, caps, disputes, no self-approval,
// managers, self-signup, immutability, grants and that nothing commercial appears in claims. No shared database.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {registerHooks} from 'node:module';
const libRoot=new URL('../../src/lib/',import.meta.url).href;
registerHooks({resolve(specifier,context,next){return next(context.parentURL?.startsWith(libRoot)&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?specifier+'.ts':specifier,context);}});
const dir=process.env.DIR_SQL_DIR||'docs/pro/sql';
const Z=await import('../../src/lib/directory/claim-schemas.ts');
const OTP=await import('../../src/lib/directory/claim-otp.ts');
const {hasProAccess}=await import('../../src/lib/pro/access.ts');
const uuid=()=>crypto.randomUUID(),code=c=>e=>{assert.equal(e.code,c,`${c} expected, got ${e.code}: ${e.message}`);return true;};
const hint=h=>e=>{assert.equal(e.hint??e.detail?.hint,h,e.message);return true;};
const COMMERCIAL=/pay|tier|membership|subscri|billing|sponsor|featured|premium/i;

// ---------------------------------------------------------------- zod mirrors + adapter
{const cid=uuid(),ok=(s,v)=>s.safeParse(v).success,b={actionId:uuid(),claimId:cid,slug:'soda-uno'};
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'phone_listed'}),true);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'phone_listed',phone:'+506 8888 0000'}),false,'claimant never types the phone');
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'email_domain',email:'Duena@SodaUno.cr'}),true);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'email_domain',email:'duena@gmail.com'}),false);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'email_listed'}),true);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'email_listed',email:'duena@gmail.com'}),false,'claimant never types the listed e-mail');
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'email_listed',dispute:true}),false,'disputes need staff review');
 const doc={documents:[{kind:'municipal_license',path:`dir-claims/${cid}/patente.pdf`}]};
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'document_review',evidence:doc}),true);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'document_review',evidence:{documents:[{kind:'other',path:`dir-claims/${uuid()}/x.pdf`}]}}),false,'other claim folder');
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'phone_listed',dispute:true}),false,'disputes need staff review');
 const hac={hacienda:{cedula:'3101123456',officialName:'SODA UNO SOCIEDAD ANONIMA',score:0.8,matched:true,provider:'hacienda_api'}};
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'hacienda_juridica',evidence:hac}),true);
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'hacienda_juridica',evidence:{hacienda:{...hac.hacienda,cedula:'112340567'}}}),false,'persona fisica');
 assert.equal(ok(Z.claimOpenSchema,{...b,method:'hacienda_juridica',evidence:{hacienda:{...hac.hacienda,score:0.4}}}),false);
 assert.equal(ok(Z.claimVerifyCodeSchema,{actionId:uuid(),claimId:cid,code:'012345'}),true);
 assert.equal(ok(Z.claimVerifyCodeSchema,{actionId:uuid(),claimId:cid,code:'12345'}),false);
 assert.equal(ok(Z.claimReviewSchema,{actionId:uuid(),claimId:cid,decision:'reject'}),false,'reason needed');
 assert.equal(ok(Z.placeSelfSignupSchema,{actionId:uuid(),claimId:cid,placeId:uuid(),place:{slug:'mi-soda',vertical:'restaurant',name:'Mi Soda'},method:'document_review',evidence:doc}),true);
 assert.equal(ok(Z.placeSelfSignupSchema,{actionId:uuid(),claimId:cid,placeId:uuid(),place:{slug:'mi-soda',vertical:'restaurant',name:'Mi Soda'},method:'phone_listed',evidence:{}}),false);
 assert.deepEqual(Z.CLAIM_METHOD_LEVEL,{phone_listed:'claimed',email_listed:'claimed',email_domain:'claimed',hacienda_juridica:'verified',document_review:'verified'});
 assert.deepEqual([...Z.CODE_METHODS],['phone_listed','email_listed','email_domain']);
 for(const s of [Z.claimSendCodeSchema,Z.claimVerifyCodeSchema,Z.claimWithdrawSchema,Z.claimReviewSchema,Z.placeManagerMutationSchema])
  for(const k of Object.keys((s.shape??s.def?.schema?.shape??{})))assert.doesNotMatch(k,COMMERCIAL);
 assert.doesNotMatch(await readFile('src/lib/directory/claim-schemas.ts','utf8').then(t=>t.replace(/\/\/.*|\/\*[\s\S]*?\*\//g,'')),COMMERCIAL,'no commercial key in claim schemas');
 const codes=new Set();for(let i=0;i<200;i++){const c=OTP.generateClaimCode();assert.match(c,/^\d{6}$/);codes.add(c);}assert.ok(codes.size>190);
 const pepper='p'.repeat(40),h1=await OTP.hashClaimCode(pepper,cid,'123456');assert.match(h1,/^[a-f0-9]{64}$/);
 assert.equal(await OTP.hashClaimCode(pepper,cid.toUpperCase(),'123456'),h1);assert.notEqual(await OTP.hashClaimCode(pepper,uuid(),'123456'),h1);
 await assert.rejects(()=>OTP.hashClaimCode('short',cid,'123456'));
 const mock=OTP.createClaimCodeSender('mock');assert.equal(mock.name,'mock');assert.throws(()=>OTP.createClaimCodeSender('twilio'));
 assert.match(OTP.claimCodeText('123456','es'),/usted/);
 // e-mail adapter: renders ES/EN, goes to the transport (mock outbox), never to an SMS channel; no links in the body
 const box=[],mailer=OTP.createClaimCodeSender('email-mock',box);assert.equal(mailer.name,'email-mock');
 assert.equal((await mailer.send({claimId:cid,channel:'email',destination:'sodauno@gmail.com',code:'042424',locale:'es'})).accepted,true);
 assert.deepEqual([box[0].claimId,box[0].channel,box[0].destination,box[0].code],[cid,'email','sodauno@gmail.com','042424']);
 assert.match(box[0].subject,/código/);assert.match(box[0].text,/usted/);
 const en=OTP.claimCodeEmail('042424','en');assert.match(en.subject,/code/);assert.match(en.bodyHtml,/042424/);assert.doesNotMatch(en.bodyHtml+en.text,/https?:|href=/i,'no links');
 await assert.rejects(()=>mailer.send({claimId:cid,channel:'sms',destination:'+506 2200 0000',code:'042424',locale:'es'}));
 assert.throws(()=>OTP.claimCodeEmail('12a456','es'));
 const shared=OTP.claimMockOutbox();assert.equal(OTP.claimMockOutbox(),shared,'one process-wide outbox');}

// ---------------------------------------------------------------- database
const {PGlite}=await import(process.env.PRO_PGLITE_MODULE||'@electric-sql/pglite'),db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;`);
const core=await readFile(join(dir,'directory-core-local.sql'),'utf8'),claims=await readFile(join(dir,'directory-claims-local.sql'),'utf8');
await db.exec(core);await db.exec(claims);await db.exec(claims);await db.exec(core);await db.exec(claims);
await db.exec('set role service_role');
const q=async(text,params=[])=>(await db.query(text,params)).rows;
const call=async(fn,actor,input)=>(await q(`select ${fn}($1,$2) r`,[actor,input]))[0].r;
const staff='00000000-0000-4000-8000-0000000000aa',staff2='00000000-0000-4000-8000-0000000000ab',ana='00000000-0000-4000-8000-00000000a001',beto='00000000-0000-4000-8000-00000000b001',caro='00000000-0000-4000-8000-00000000c001';
const id=i=>'00000000-0000-4000-8000-'+String(i).padStart(12,'0');
const mutate=(input,actor=staff)=>call('dir_place_mutate',actor,{actionId:uuid(),...input});
const place=async(n,extra={},source='osm')=>{const r=await mutate({action:'create',placeId:id(n),revision:0,place:{slug:'lugar-'+n,vertical:'restaurant',name:'Lugar '+n,lat:9.93+n/1000,lng:-84.08,phone:'+506 2200 00'+String(n).padStart(2,'0'),website:`https://lugar${n}.cr`,...extra},source:{id:source,ref:'node/'+n}});
 return (await mutate({action:'status',placeId:id(n),revision:r.revision,status:'published'})).revision;};
const P=async n=>(await q('select claim_status,verification_level,revision from dir_places where id=$1',[id(n)]))[0];
const pepper='x'.repeat(48),mock=new OTP.MockClaimCodeSender();
const send=async(actor,claimId,c=OTP.generateClaimCode())=>{const r=await call('dir_claim_send_code',actor,{actionId:uuid(),claimId,codeHash:await OTP.hashClaimCode(pepper,claimId,c)});
 if(r.status==='code_sent')await mock.send({claimId,channel:r.channel,destination:r.destination,code:c,locale:'es'});return r;};
const verify=async(actor,claimId,c)=>call('dir_claim_verify_code',actor,{actionId:uuid(),claimId,codeHash:await OTP.hashClaimCode(pepper,claimId,c)});
const open=(actor,input)=>call('dir_claim_open',actor,{actionId:uuid(),claimId:uuid(),...input});
const hac={hacienda:{cedula:'3101123456',officialName:'LUGAR TRES SOCIEDAD ANONIMA',score:0.8,matched:true,provider:'hacienda_api'}};
const sms=async on=>{await db.exec('reset role');await db.query('update dir_claim_settings set sms_enabled=$1',[on]);await db.exec('set role service_role');};

// SMS is OFF by default: phone_listed refused cleanly at opening (and at sending, below); the switch is staff-only
assert.equal((await q('select dir_claim_sms_enabled() s'))[0].s,false);
await place(40);
await assert.rejects(()=>open(uuid(),{slug:'lugar-40',method:'phone_listed'}),hint('dir_claim_sms_disabled'));
assert.equal((await P(40)).claim_status,'unclaimed','refused opening changes nothing');
assert.equal((await q("select dir_claim_options('lugar-40') o"))[0].o.smsEnabled,false);
await sms(true);
const o40=await open(uuid(),{slug:'lugar-40',method:'phone_listed'}),c40=(await q('select claimant_id from dir_place_claims where id=$1',[o40.claimId]))[0].claimant_id;
await sms(false);
await assert.rejects(()=>send(c40,o40.claimId),hint('dir_claim_sms_disabled'),'no SMS code while off, even for a claim opened before');
await call('dir_claim_withdraw',c40,{actionId:uuid(),claimId:o40.claimId});
await sms(true);// the phone_listed checks below run with the switch on

// phone_listed: code goes to the place phone, idempotent open, one open claim per place
await place(1);
const openIn={actionId:uuid(),claimId:uuid(),slug:'lugar-1',method:'phone_listed'};
const o1=await call('dir_claim_open',ana,openIn);assert.equal(o1.status,'open');assert.deepEqual(await call('dir_claim_open',ana,openIn),o1);
await assert.rejects(()=>call('dir_claim_open',ana,{...openIn,note:'otro'}),code('22023'));
assert.equal((await P(1)).claim_status,'claim_pending');
await assert.rejects(()=>open(beto,{slug:'lugar-1',method:'phone_listed'}),hint('dir_claim_pending'));
await assert.rejects(()=>open(ana,{slug:'lugar-1',method:'phone_listed',phone:'+506 8888 8888'}),code('22023'),'no typed phone');
await assert.rejects(()=>call('dir_claim_send_code',beto,{actionId:uuid(),claimId:o1.claimId,codeHash:'a'.repeat(64)}),code('P0002'),'not the claimant');
const s1=await send(ana,o1.claimId);assert.equal(s1.destination,'+506 2200 0001');assert.equal(s1.destinationMasked,'*** 0001');assert.equal(s1.channel,'sms');assert.equal(s1.sendsLeft,2);
await assert.rejects(()=>send(ana,o1.claimId),hint('dir_claim_code_cooldown'));
const stored=(await q('select otp_hash from dir_place_claims where id=$1',[o1.claimId]))[0].otp_hash;
assert.equal(stored,await OTP.hashClaimCode(pepper,o1.claimId,mock.last(o1.claimId).code),'only the HMAC is stored');
assert.equal(JSON.stringify(await q('select input,result from dir_place_actions')).includes('"'+mock.last(o1.claimId).code+'"'),false,'plain code never in receipts');
let v=await verify(ana,o1.claimId,mock.last(o1.claimId).code==='000000'?'111111':'000000');assert.deepEqual([v.verified,v.attemptsLeft,v.reason],[false,4,'wrong_code']);
const view=(await q('select dir_claim_read($1,$2) r',[ana,o1.claimId]))[0].r;assert.equal(view.attemptsLeft,4);assert.equal(view.destinationMasked,'*** 0001');
for(const k of ['otpHash','otp_hash','destination','claimantId','reviewedBy'])assert.equal(k in view,false);
assert.equal((await q('select dir_claim_read($1,$2) r',[beto,o1.claimId]))[0].r,null);
v=await verify(ana,o1.claimId,mock.last(o1.claimId).code);assert.equal(v.verified,true);assert.equal(v.status,'approved');assert.equal(v.verificationLevel,'claimed');
assert.deepEqual({...(await P(1)),revision:undefined},{claim_status:'claimed',verification_level:'claimed',revision:undefined});
assert.equal((await q("select role from dir_place_managers where place_id=$1 and user_id=$2 and status='active'",[id(1),ana]))[0].role,'owner');
await assert.rejects(()=>verify(ana,o1.claimId,'123456'),code('40001'));
// claimed place: plain claim refused, dispute only with staff-reviewed methods, owner can't re-claim
await assert.rejects(()=>open(beto,{slug:'lugar-1',method:'phone_listed'}),hint('dir_place_already_claimed'));
await assert.rejects(()=>open(beto,{slug:'lugar-1',method:'phone_listed',dispute:true}),hint('dir_claim_dispute_method'));
await assert.rejects(()=>open(ana,{slug:'lugar-1',method:'document_review',dispute:true}),hint('dir_claim_already_manager'));
await assert.rejects(()=>open(beto,{slug:'lugar-9',method:'phone_listed'}),code('P0002'));

// wrong codes: 5 attempts reject the claim and free the place; code expiry; send cap
await place(2);const o2=await open(beto,{slug:'lugar-2',method:'phone_listed'});await send(beto,o2.claimId,'222222');
for(let i=4;i>=1;i--)assert.equal((await verify(beto,o2.claimId,'999999')).attemptsLeft,i);
v=await verify(beto,o2.claimId,'999999');assert.deepEqual([v.status,v.verified,v.attemptsLeft],['rejected',false,0]);
assert.equal((await P(2)).claim_status,'unclaimed');assert.equal((await P(2)).verification_level,'unverified','rejected claims change no level');
assert.equal((await q('select decision_reason from dir_place_claims where id=$1',[o2.claimId]))[0].decision_reason,'attempts_exhausted');
const o2b=await open(beto,{slug:'lugar-2',method:'phone_listed'});await send(beto,o2b.claimId,'333333');
await db.exec(`reset role;update dir_place_claims set otp_expires_at=clock_timestamp()-interval '1 second',otp_last_sent_at=clock_timestamp()-interval '2 minutes' where id='${o2b.claimId}';set role service_role`);
v=await verify(beto,o2b.claimId,'333333');assert.deepEqual([v.verified,v.reason,v.attemptsLeft],[false,'code_expired',5],'expired code does not count');
await send(beto,o2b.claimId,'444444');
await db.exec(`reset role;update dir_place_claims set otp_last_sent_at=clock_timestamp()-interval '2 minutes' where id='${o2b.claimId}';set role service_role`);
assert.equal((await send(beto,o2b.claimId,'555555')).sendsLeft,0);
await db.exec(`reset role;update dir_place_claims set otp_last_sent_at=clock_timestamp()-interval '2 minutes' where id='${o2b.claimId}';set role service_role`);
await assert.rejects(()=>send(beto,o2b.claimId),hint('dir_claim_send_cap'));
assert.equal((await verify(beto,o2b.claimId,'444444')).verified,false,'only the latest code is valid');
// withdraw + claim expiry (lazy and sweep)
assert.equal((await call('dir_claim_withdraw',beto,{actionId:uuid(),claimId:o2b.claimId})).status,'withdrawn');assert.equal((await P(2)).claim_status,'unclaimed');
await assert.rejects(()=>call('dir_claim_withdraw',beto,{actionId:uuid(),claimId:o2b.claimId}),code('40001'));
const o2d=await open(beto,{slug:'lugar-2',method:'phone_listed'});await call('dir_claim_withdraw',beto,{actionId:uuid(),claimId:o2d.claimId});
await assert.rejects(()=>open(beto,{slug:'lugar-2',method:'phone_listed'}),hint('dir_claim_cap'),'3 claims per place in 30 days');
const o2c=await open(caro,{slug:'lugar-2',method:'phone_listed'});
await db.exec(`reset role;update dir_place_claims set expires_at=clock_timestamp()-interval '1 second' where id='${o2c.claimId}';set role service_role`);
assert.equal((await send(caro,o2c.claimId)).status,'expired');assert.equal((await P(2)).claim_status,'unclaimed');
await place(4);const o4=await open(caro,{slug:'lugar-4',method:'phone_listed'});
await db.exec(`reset role;update dir_place_claims set expires_at=clock_timestamp()-interval '1 second' where id='${o4.claimId}';set role service_role`);
const sweep={actionId:uuid()};assert.deepEqual(await call('dir_claim_expire_due',staff,sweep),{expired:1});assert.deepEqual(await call('dir_claim_expire_due',staff,sweep),{expired:1});
assert.equal((await P(4)).claim_status,'unclaimed');

// independent phone only: a phone typed by the owner source never enables phone_listed
await place(5,{},'contratacr');const r5=(await P(5)).revision;
await mutate({action:'update',placeId:id(5),revision:r5,place:{phone:'+506 8000 0005'},source:{id:'owner'}});
await assert.rejects(()=>open(caro,{slug:'lugar-5',method:'phone_listed'}),hint('dir_claim_phone_unavailable'));
await place(6,{phone:null});await assert.rejects(()=>open(caro,{slug:'lugar-6',method:'phone_listed'}),hint('dir_claim_phone_unavailable'));

// email_domain: must match the listed website host; free mail refused
await place(7,{website:'https://www.lugar7.cr/menu'});
await assert.rejects(()=>open(caro,{slug:'lugar-7',method:'email_domain',email:'duena@otro.cr'}),hint('dir_claim_domain_mismatch'));
await assert.rejects(()=>open(caro,{slug:'lugar-7',method:'email_domain',email:'duena@gmail.com'}),hint('dir_claim_domain_mismatch'));
await assert.rejects(()=>open(caro,{slug:'lugar-7',method:'email_domain'}),code('22023'));
const o7=await open(caro,{slug:'lugar-7',method:'email_domain',email:'Duena@Lugar7.cr'});
const s7=await send(caro,o7.claimId,'777777');assert.deepEqual([s7.channel,s7.destination,s7.destinationMasked],['email','duena@lugar7.cr','du***@lugar7.cr']);
assert.equal((await verify(caro,o7.claimId,'777777')).verificationLevel,'claimed');
await place(41,{website:'https://gmail.com'});
await assert.rejects(()=>open(uuid(),{slug:'lugar-41',method:'email_domain',email:'duena@gmail.com'}),hint('dir_claim_domain_mismatch'),'free mail refused for email_domain even when the website is on it');
assert.equal((await q("select dir_claim_options('lugar-41') o"))[0].o.websiteHost,null);

// email_listed: code to the e-mail already on the place (any domain), masked, approved by the code → claimed
const ago=d=>new Date(Date.now()-d*864e5).toISOString();
await place(30,{email:'SodaUno@Gmail.com'});
assert.equal((await q('select email from dir_places where id=$1',[id(30)]))[0].email,'sodauno@gmail.com','stored lower-case');
assert.equal((await q("select dir_place_public('lugar-30') p"))[0].p.email,undefined,'the public reader never returns the e-mail');
const opt30=(await q("select dir_claim_options('lugar-30') o"))[0].o;
assert.deepEqual(opt30,{emailListed:'so***@gmail.com',websiteHost:'lugar30.cr',phoneListed:true,smsEnabled:true});
assert.doesNotMatch(JSON.stringify(opt30),/sodauno/,'options carry only the mask');
const dave=uuid();
await assert.rejects(()=>open(dave,{slug:'lugar-30',method:'email_listed',email:'otra@gmail.com'}),code('22023'),'no typed address');
const o30=await open(dave,{slug:'lugar-30',method:'email_listed'});assert.deepEqual([o30.status,o30.method],['open','email_listed']);
await assert.rejects(()=>verify(dave,o30.claimId,'123456'),hint('dir_claim_no_code_sent'));
const s30=await send(dave,o30.claimId,'303030');
assert.deepEqual([s30.channel,s30.destination,s30.destinationMasked,s30.sendsLeft],['email','sodauno@gmail.com','so***@gmail.com',2]);
const v30=(await q('select dir_claim_read($1,$2) r',[dave,o30.claimId]))[0].r;assert.deepEqual([v30.method,v30.destinationMasked,v30.sendsLeft],['email_listed','so***@gmail.com',2]);
assert.equal(JSON.stringify(v30).includes('sodauno'),false,'claimant view never has the full address');
await assert.rejects(()=>send(dave,o30.claimId),hint('dir_claim_code_cooldown'),'same cooldown as every code');
assert.equal((await verify(dave,o30.claimId,'000001')).attemptsLeft,4);
const a30=await verify(dave,o30.claimId,'303030');assert.deepEqual([a30.verified,a30.status,a30.verificationLevel],[true,'approved','claimed']);
assert.deepEqual({...(await P(30)),revision:undefined},{claim_status:'claimed',verification_level:'claimed',revision:undefined});
assert.equal((await q("select role from dir_place_managers where place_id=$1 and user_id=$2 and status='active'",[id(30),dave]))[0].role,'owner');
await assert.rejects(()=>open(uuid(),{slug:'lugar-30',method:'email_listed',dispute:true}),hint('dir_claim_dispute_method'));
// a later change by that verified owner keeps the e-mail eligible; staff changes are trusted too
await mutate({action:'update',placeId:id(30),revision:(await P(30)).revision,place:{email:'ventas@sodauno.cr'},source:{id:'owner'}},dave);
assert.equal((await q('select dir_listed_email_eligible($1) e',[id(30)]))[0].e,true,'verified owner');
await place(35,{},'contratacr');await mutate({action:'update',placeId:id(35),revision:(await P(35)).revision,place:{email:'info@lugar35.cr'}});
assert.equal((await q('select dir_listed_email_eligible($1) e',[id(35)]))[0].e,true,'staff');
// not eligible: no e-mail; set/changed in the last 30 days by someone who is not staff nor a verified owner
await place(31);await assert.rejects(()=>open(uuid(),{slug:'lugar-31',method:'email_listed'}),hint('dir_claim_email_unavailable'));
assert.equal((await q("select dir_claim_options('lugar-31') o"))[0].o.emailListed,null);
await place(32,{email:'recien@gmail.com'},'osm');
await mutate({action:'update',placeId:id(32),revision:(await P(32)).revision,place:{email:'otro.dueno@gmail.com'},source:{id:'owner'}},uuid());
await assert.rejects(()=>open(uuid(),{slug:'lugar-32',method:'email_listed'}),hint('dir_claim_email_unavailable'),'recently changed by a non-verified person');
assert.equal((await q("select dir_claim_options('lugar-32') o"))[0].o.emailListed,null);
await place(33);await mutate({action:'update',placeId:id(33),revision:(await P(33)).revision,place:{email:'nuevo@soda33.cr'},source:{id:'osm',ref:'node/33',observedAt:ago(5)}});
await assert.rejects(()=>open(uuid(),{slug:'lugar-33',method:'email_listed'}),hint('dir_claim_email_unavailable'),'upstream edit younger than 30 days');
await place(34);await mutate({action:'update',placeId:id(34),revision:(await P(34)).revision,place:{email:'viejo@soda34.cr'},source:{id:'osm',ref:'node/34',observedAt:ago(45)}});
assert.equal((await q('select dir_listed_email_eligible($1) e',[id(34)]))[0].e,true,'upstream edit older than 30 days');
await mutate({action:'update',placeId:id(34),revision:(await P(34)).revision,place:{email:'cambio@gmail.com'},source:{id:'owner'}},uuid());
assert.equal((await q('select dir_listed_email_eligible($1) e',[id(34)]))[0].e,false,'any recent untrusted change blocks');
// the e-mail is checked again at every send: a change after opening stops the code
await place(36,{email:'duena@soda36.cr'});const eva=uuid(),o36=await open(eva,{slug:'lugar-36',method:'email_listed'});
await mutate({action:'update',placeId:id(36),revision:(await P(36)).revision,place:{email:'intruso@gmail.com'},source:{id:'owner'}},uuid());
await assert.rejects(()=>send(eva,o36.claimId),hint('dir_claim_email_unavailable'));
assert.equal((await q("select count(*)::int n from dir_place_claims where method='email_listed' and contact_email is not null"))[0].n,0,'email_listed stores no address on the claim');

// staff-reviewed: hacienda_juridica / document_review; no self-approval, no manager approval, code methods can't be approved
await place(3);
await assert.rejects(()=>open(caro,{slug:'lugar-3',method:'hacienda_juridica',evidence:{hacienda:{...hac.hacienda,matched:false}}}),hint('dir_claim_evidence'));
await assert.rejects(()=>open(caro,{slug:'lugar-3',method:'hacienda_juridica',evidence:{hacienda:{...hac.hacienda,cedula:'112340567'}}}),hint('dir_claim_evidence'));
const o3=await open(caro,{slug:'lugar-3',method:'hacienda_juridica',evidence:hac});
await assert.rejects(()=>send(caro,o3.claimId),hint('dir_claim_no_code'));
await assert.rejects(()=>verify(caro,o3.claimId,'123456'),code('40001'));
await assert.rejects(()=>call('dir_claim_review',caro,{actionId:uuid(),claimId:o3.claimId,decision:'approve'}),hint('dir_claim_self_review'));
await db.exec('reset role');
await assert.rejects(()=>db.query(`update dir_place_claims set status='approved',resolved_at=now(),reviewed_by=claimant_id,reviewed_at=now() where id=$1`,[o3.claimId]),code('23514'),'table check: reviewer is never the claimant');
await assert.rejects(()=>db.query(`update dir_place_claims set status='approved',resolved_at=now() where id=$1`,[o3.claimId]),code('23514'),'table check: staff methods need a reviewer');
await db.exec('set role service_role');
const queue=(await q('select dir_claim_queue() r'))[0].r;assert.equal(queue.length,1);assert.equal(queue[0].claimId,o3.claimId);
const rv={actionId:uuid(),claimId:o3.claimId,decision:'approve'};const a3=await call('dir_claim_review',staff,rv);
assert.deepEqual([a3.status,a3.verificationLevel],['approved','verified']);assert.deepEqual(await call('dir_claim_review',staff,rv),a3);
assert.equal((await q('select reviewed_by from dir_place_claims where id=$1',[o3.claimId]))[0].reviewed_by,staff);
await assert.rejects(()=>call('dir_claim_review',staff,{actionId:uuid(),claimId:o1.claimId,decision:'reject',reason:'Ya cerrada'}),code('40001'));
await place(8);const o8=await open(beto,{slug:'lugar-8',method:'phone_listed'});
await assert.rejects(()=>call('dir_claim_review',staff,{actionId:uuid(),claimId:o8.claimId,decision:'approve'}),hint('dir_claim_requires_code'));
await assert.rejects(()=>call('dir_claim_review',staff,{actionId:uuid(),claimId:o8.claimId,decision:'reject'}),code('22023'),'reason required');
assert.equal((await call('dir_claim_review',staff,{actionId:uuid(),claimId:o8.claimId,decision:'reject',reason:'Número no corresponde.'})).status,'rejected');
assert.equal((await P(8)).claim_status,'unclaimed');

// dispute on a claimed place (document_review): disputed while open; approval replaces owner and managers
const daveDoc=cid=>({documents:[{kind:'legal_personhood',path:`dir-claims/${cid}/personeria.pdf`}]});
await call('dir_place_manager_mutate',ana,{actionId:uuid(),placeId:id(1),action:'add',userId:caro});
await assert.rejects(()=>call('dir_place_manager_mutate',caro,{actionId:uuid(),placeId:id(1),action:'add',userId:staff2}),code('42501'),'managers cannot add');
await assert.rejects(()=>call('dir_place_manager_mutate',caro,{actionId:uuid(),placeId:id(1),action:'revoke',userId:ana}),hint('dir_owner_fixed'));
const dcid=uuid(),dOpen={actionId:uuid(),claimId:dcid,slug:'lugar-1',method:'document_review',dispute:true,evidence:daveDoc(dcid),note:'Somos los dueños actuales.'};
await assert.rejects(()=>call('dir_claim_open',beto,{...dOpen,actionId:uuid(),evidence:daveDoc(uuid())}),hint('dir_claim_evidence'));
await call('dir_claim_open',beto,dOpen);assert.equal((await P(1)).claim_status,'disputed');
await assert.rejects(()=>call('dir_claim_review',ana,{actionId:uuid(),claimId:dcid,decision:'reject',reason:'Es mío'}),hint('dir_claim_conflict'));
const lvlBefore=(await P(1)).verification_level;
await call('dir_claim_review',staff,{actionId:uuid(),claimId:dcid,decision:'approve'});
assert.equal((await P(1)).claim_status,'claimed');assert.equal((await P(1)).verification_level,'verified');assert.notEqual(lvlBefore,'verified');
assert.deepEqual((await q("select user_id,role from dir_place_managers where place_id=$1 and status='active'",[id(1)])),[{user_id:beto,role:'owner'}]);
assert.equal((await q("select count(*)::int n from dir_place_managers where place_id=$1 and revoke_reason='dispute'",[id(1)]))[0].n,2);
// rejected dispute returns to claimed and keeps the owner
const d2=uuid();await call('dir_claim_open',ana,{actionId:uuid(),claimId:d2,slug:'lugar-1',method:'hacienda_juridica',dispute:true,evidence:hac});
await call('dir_claim_review',staff2,{actionId:uuid(),claimId:d2,decision:'reject',reason:'Documentos insuficientes.'});
assert.equal((await P(1)).claim_status,'claimed');assert.equal((await q("select user_id from dir_place_managers where place_id=$1 and status='active'",[id(1)]))[0].user_id,beto);
// levels never go down: a staff license verification survives a later claim
await place(10,{},'contratacr');await mutate({action:'verify',placeId:id(10),revision:(await P(10)).revision,verificationLevel:'license_verified'});
await mutate({action:'update',placeId:id(10),revision:(await P(10)).revision,place:{phone:'+506 2200 0010'},source:{id:'osm',ref:'node/10'}});
const o10=await open(staff2,{slug:'lugar-10',method:'phone_listed'});await send(staff2,o10.claimId,'101010');
assert.equal((await verify(staff2,o10.claimId,'101010')).verificationLevel,'license_verified');
// managers: cap, self-leave
await call('dir_place_manager_mutate',beto,{actionId:uuid(),placeId:id(1),action:'add',userId:caro});
await assert.rejects(()=>call('dir_place_manager_mutate',beto,{actionId:uuid(),placeId:id(1),action:'add',userId:caro}),code('23505'));
assert.equal((await call('dir_place_manager_mutate',caro,{actionId:uuid(),placeId:id(1),action:'revoke',userId:caro})).managers,1);
for(let i=0;i<9;i++)await call('dir_place_manager_mutate',beto,{actionId:uuid(),placeId:id(1),action:'add',userId:id(5000+i)});
await assert.rejects(()=>call('dir_place_manager_mutate',beto,{actionId:uuid(),placeId:id(1),action:'add',userId:id(6000)}),hint('dir_manager_cap'));

// self-signup "add my business": draft place in claim_pending, staff decides; phone typed there never allows phone_listed
const su=uuid(),sp=id(20),signup={actionId:uuid(),claimId:su,placeId:sp,method:'document_review',evidence:{documents:[{kind:'municipal_license',path:`dir-claims/${su}/patente.pdf`}]},
 place:{slug:'mi-soda-nueva',vertical:'restaurant',name:'Mi Soda Nueva',lat:9.95,lng:-84.1,phone:'+506 8000 2020',adminArea2:'Heredia'}};
const sres=await call('dir_place_self_signup',caro,signup);assert.deepEqual([sres.status,sres.placeStatus,sres.slug],['open','draft','mi-soda-nueva']);
assert.deepEqual(await call('dir_place_self_signup',caro,signup),sres);
assert.equal((await P(20)).claim_status,'claim_pending');assert.equal((await q('select dir_place_public($1) p',['mi-soda-nueva']))[0].p,null,'draft not public');
await assert.rejects(()=>call('dir_place_self_signup',caro,{...signup,actionId:uuid(),claimId:uuid(),placeId:id(21),place:{...signup.place,slug:'mi-soda-copia'}}),hint('dir_place_possible_duplicate'));
await assert.rejects(()=>call('dir_place_self_signup',caro,{...signup,actionId:uuid(),method:'phone_listed'}),code('22023'));
await assert.rejects(()=>call('dir_claim_review',caro,{actionId:uuid(),claimId:su,decision:'approve'}),hint('dir_claim_self_review'));
await call('dir_claim_review',staff,{actionId:uuid(),claimId:su,decision:'approve'});
assert.deepEqual({...(await P(20)),revision:0},{claim_status:'claimed',verification_level:'verified',revision:0});
assert.equal((await q('select status from dir_places where id=$1',[sp]))[0].status,'draft','publication stays a staff decision');
assert.equal((await q("select source_id from dir_field_provenance where place_id=$1 and field='phone'",[sp]))[0].source_id,'owner');

// history: every claim transition is recorded on the place
const h1=await q("select after->>'claimStatus' s from dir_place_history where place_id=$1 and action='verify' order by id",[id(1)]);
assert.deepEqual(h1.map(x=>x.s),['claim_pending','claimed','disputed','claimed','disputed','claimed']);
// claim events immutable, rows never deleted, closed claims final
await db.exec('reset role');
await assert.rejects(()=>db.exec('update dir_place_claim_events set event=event'),code('23514'));
await assert.rejects(()=>db.exec('delete from dir_place_claim_events'),code('23514'));
await assert.rejects(()=>db.exec('truncate dir_place_claims cascade'),code('23514'));
await assert.rejects(()=>db.exec('delete from dir_place_claims'),code('23514'));
await assert.rejects(()=>db.query("update dir_place_claims set status='open',resolved_at=null where id=$1",[o2.claimId]),code('23514'),'closed is final');
await assert.rejects(()=>db.query("update dir_place_claims set claimant_id=$2 where id=$1",[o8.claimId,ana]),code('23514'));
await assert.rejects(()=>db.query("update dir_place_managers set status='active',revoked_at=null,revoked_by=null,revoke_reason=null where place_id=$1 and revoke_reason='dispute'",[id(1)]),code('23514'));
await assert.rejects(()=>db.exec("insert into dir_place_claims(id,place_id,claimant_id,method,expires_at) values(gen_random_uuid(),'"+id(8)+"','"+ana+"','phone_listed',now()+interval '1 day'),(gen_random_uuid(),'"+id(8)+"','"+beto+"','phone_listed',now()+interval '1 day')"),code('23505'),'one open claim per place');
await db.exec('set role service_role');
for(const t of ['dir_place_claims','dir_place_managers','dir_place_claim_events'])await assert.rejects(()=>db.exec(`delete from ${t}`),code('42501'),t);

// nothing commercial in claims: columns, parameters, function sources
const cols=await q(`select table_name,column_name from information_schema.columns where table_schema='public' and (table_name in('dir_place_claims','dir_place_managers','dir_place_claim_events') or (table_name='dir_places' and column_name='claim_status'))`);
assert.ok(cols.length>30);for(const c of cols)assert.doesNotMatch(c.column_name,COMMERCIAL,c.table_name);
const fns=await q(`select p.proname,coalesce(array_to_string(p.proargnames,','),'') args,p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'dir\\_claim%' or p.proname like 'dir\\_place\\_manager%' or p.proname='dir_place_self_signup')`);
assert.ok(fns.length>=14);for(const f of fns){assert.doesNotMatch(f.args,COMMERCIAL,f.proname);assert.doesNotMatch(f.prosrc,COMMERCIAL,f.proname);assert.doesNotMatch(f.prosrc,/pro_entitled|pro_memberships/,f.proname);}

// grants / RLS / security invoker
for(const role of ['anon','authenticated']){
 await db.exec(`reset role;set role ${role}`);
 await assert.rejects(()=>q("select dir_claim_options('lugar-30')"),code('42501'));
 for(const t of ['dir_place_claims','dir_place_managers','dir_place_claim_events','dir_claim_settings'])await assert.rejects(()=>db.exec(`select * from ${t}`),code('42501'),role+' '+t);
 await assert.rejects(()=>open(ana,{slug:'lugar-8',method:'phone_listed'}),code('42501'));
 await assert.rejects(()=>q('select dir_claim_queue()'),code('42501'));
}
await db.exec('reset role');
assert.equal((await q("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'dir\\_%' and (p.prosecdef or not exists(select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%'))"))[0].n,0);
assert.equal((await q("select count(*)::int n from pg_class where relname like 'dir\\_%' and relkind='r' and not relrowsecurity"))[0].n,0);
const snap=await q('select id,status from dir_place_claims order by id');await db.exec(claims);assert.deepEqual(await q('select id,status from dir_place_claims order by id'),snap);

// ---------------------------------------------------------------- pro_entitled draft (stub Pro tables) vs hasProAccess
await db.exec(`create table profiles(id uuid primary key,role text not null,is_disabled boolean,is_provider boolean);
 create table professionals(profile_id uuid primary key,is_banned boolean);
 create table pro_memberships(user_id uuid primary key,status text not null,expires_at timestamptz);
 create table pro_audit(id bigint generated always as identity primary key,actor uuid,subject uuid,action text not null,detail jsonb not null);
 grant select,insert on profiles,professionals,pro_memberships,pro_audit to service_role;`);
const ent=await readFile(join(dir,'pro-entitled-draft.sql'),'utf8');await db.exec(ent);await db.exec(ent);
const matrix=[];let n=7000;
for(const role of ['admin','professional','client'])for(const dis of [false,true])for(const prov of [false,true])for(const g of [null,{status:'active',expires_at:null},{status:'active',expires_at:'2999-01-01T00:00:00Z'},{status:'active',expires_at:'2000-01-01T00:00:00Z'},{status:'inactive',expires_at:null},{status:'active',expires_at:'infinity'}]){
 const u=id(n++);await db.query('insert into profiles values($1,$2,$3,$4)',[u,role,dis,prov]);if(g)await db.query('insert into pro_memberships values($1,$2,$3)',[u,g.status,g.expires_at]);matrix.push([u,{role,is_disabled:dis,is_provider:prov},g]);}
await db.exec('set role service_role');
for(const [u,prof,g] of matrix)assert.equal((await q('select pro_entitled($1) e',[u]))[0].e,hasProAccess(prof,g,false),JSON.stringify([prof,g]));// no professionals rows yet: ban flag false
assert.equal((await q('select pro_entitled($1) e',[id(99999)]))[0].e,false);
await db.exec('reset role');await db.query('insert into professionals values($1,true)',[matrix[0][0]]);await db.exec('set role service_role');
assert.equal((await q('select pro_entitled($1) e',[matrix[0][0]]))[0].e,false,'banned');assert.equal(hasProAccess(matrix[0][1],matrix[0][2],true),false,'TS mirrors the SQL ban');
await assert.rejects(()=>q('select pro_entitled_require($1)',[matrix[0][0]]),code('42501'));
const fresh=matrix.find(([,p,g])=>p.role==='professional'&&!p.is_disabled&&!g)[0],inactive=matrix.find(([,p,g])=>p.role==='professional'&&!p.is_disabled&&g?.status==='inactive')[0];
assert.deepEqual((await q('select pro_membership_grant_launch_free($1,$2) r',[staff,fresh]))[0].r,{userId:fresh,granted:true});
assert.deepEqual((await q('select pro_membership_grant_launch_free($1,$2) r',[staff,fresh]))[0].r,{userId:fresh,granted:false});
assert.deepEqual((await q('select pro_membership_grant_launch_free($1,$2) r',[staff,inactive]))[0].r,{userId:inactive,granted:false},'existing grants untouched');
assert.equal((await q('select pro_entitled($1) e',[fresh]))[0].e,true);
await assert.rejects(()=>q('select pro_membership_grant_launch_free($1,$2)',[staff,matrix.find(([,p])=>p.role==='client'&&!p.is_provider)[0]]),hint('pro_launch_not_eligible'));
assert.equal((await q("select count(*)::int n from pro_audit where action='membership.launch_free'"))[0].n,1);
await db.exec('reset role;set role authenticated');await assert.rejects(()=>q('select pro_entitled($1)',[fresh]),code('42501'));
await db.close();
console.log(`PASS directory claims: email_listed (code to the e-mail already on the place, any domain, masked so***@gmail.com in options/send/read, never typed, never on the public reader, no address stored on the claim, refused without e-mail or when changed in the last 30 days by a non-staff/non-verified actor or by a recent upstream edit, re-checked at every send, staff/verified-owner changes trusted), SMS off by default (phone_listed refused at open and send, switch staff-only), free mail still refused for email_domain, e-mail adapter (ES/EN, mock outbox, no links); zod mirrors (no typed phone, domain mail, evidence per method, no commercial keys), mock-only code adapter (6 digits, HMAC hash, no real sender), module applied 3× + core re-applied, phone_listed to the listed independent phone (owner-typed phone refused), email_domain matched to website host, hashed code with 10-min expiry/3 sends/60 s cooldown/5 attempts, one open claim per place, unclaimed→claim_pending→claimed and back on reject/expire/withdraw (lazy + sweep), disputes (document/Hacienda only, disputed→claimed, owner replaced or kept), no self-approval (function + table checks), no approval by a manager, levels claimed/verified never lowered, managers (owner fixed, cap 10, self-leave), self-signup draft in claim_pending, history/events immutable, no DELETE grants, RLS/grants, no commercial column/param/source; pro_entitled = hasProAccess on ${matrix.length} cases + ban, launch_free grant idempotent and audited.`);
