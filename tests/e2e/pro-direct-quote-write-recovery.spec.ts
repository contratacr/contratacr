import {test,expect} from 'playwright/test';
import {continueDirectQuoteWrite,DirectQuoteWriteFailure,readDirectQuoteWrite,saveDirectQuoteWrite,clearDirectQuoteWrite,directQuoteWriteKey,type DirectQuoteWrite} from '../../src/lib/pro/direct-quote-write-recovery';
import {directProjectQuoteSchema} from '../../src/lib/pro/direct-project-quotes';
import {proQuoteDraftSchema} from '../../src/lib/pro/quote-draft';
const account='a1000000-0000-4000-8000-000000000001',action='a1000000-0000-4000-8000-000000000002',quoteId='a1000000-0000-4000-8000-000000000003';
const input={context:'direct',clientActionId:action,proClientId:'customer-1',clientName:'Local customer',clientPhone:null,clientCedula:null,clientEmail:null,title:'Visit',notes:null,items:[{description:'Review',quantity:1,unit_price:100}],taxMode:'exento',validDays:15};
function setup(){const values=new Map<string,string>();return {values,store:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}},attempt:{version:1,accountId:account,body:JSON.stringify(input),phase:'ready',quoteId:null} as DirectQuoteWrite};}
const quote={id:quoteId,professional_id:'a1000000-0000-4000-8000-000000000004',client_id:null,client_name:input.clientName,client_phone:null,client_cedula:null,client_email:null,public_code:'abcdef234567',quote_number:1,project_id:null,proposal_id:null,title:input.title,notes:null,items:input.items,tax_mode:input.taxMode,subtotal:100,tax_amount:0,total:100,valid_until:'2026-12-01',status:'sent',accepted_at:null,declined_at:null,created_at:'2026-11-08T12:00:00Z'};
const canonical=()=>Response.json({owned:true,quote,link:{clientId:'customer-1'}});

test('uncertain quote keeps exact body through auth failures; confirmed recovery only reads',async()=>{
 const {store,attempt}=setup();let current=attempt,mode='lost';const posts:string[]=[];
 const request=async(_url:string,init?:RequestInit)=>{
  if(init?.method==='POST'){
   posts.push(String(init.body));
   if(mode==='lost')throw Error('Lost acknowledgement');
   if(mode==='401'||mode==='403')return Response.json({}, {status:Number(mode)});
   return Response.json({quote});
  }
  return mode==='read-failed'?Response.json({}, {status:503}):canonical();
 };
 const run=()=>continueDirectQuoteWrite({store,attempt:current,request,currentAccount:()=>account,onCheckpoint:value=>{current=value;}});
 for(mode of ['lost','401','403']){await expect(run()).rejects.toBeInstanceOf(DirectQuoteWriteFailure);current=readDirectQuoteWrite(store,account)!;expect(current.phase).toBe('uncertain');expect(current.body).toBe(attempt.body);}
 mode='read-failed';await expect(run()).rejects.toMatchObject({kind:'read'});current=readDirectQuoteWrite(store,account)!;expect(current).toMatchObject({phase:'confirmed',quoteId});
 const count=posts.length;mode='ordinary';expect((await run()).status).toBe('confirmed');expect(posts).toHaveLength(count);expect(posts.every(body=>body===attempt.body)).toBe(true);
 clearDirectQuoteWrite(store,current);expect(readDirectQuoteWrite(store,account)).toBeNull();
});
test('first definitive rejection permits correction but later rejection preserves uncertainty',async()=>{
 const {store,attempt}=setup();const request=async()=>Response.json({}, {status:409});
 expect((await continueDirectQuoteWrite({store,attempt,request,currentAccount:()=>account,onCheckpoint:()=>{}})).status).toBe('rejected');expect(readDirectQuoteWrite(store,account)).toBeNull();
 const uncertain={...attempt,phase:'uncertain' as const};saveDirectQuoteWrite(store,uncertain);
 await expect(continueDirectQuoteWrite({store,attempt:uncertain,request,currentAccount:()=>account,onCheckpoint:()=>{}})).rejects.toMatchObject({kind:'uncertain'});
 expect(readDirectQuoteWrite(store,account)).toEqual(uncertain);
});
test('corrupt, unavailable or silently dropped storage sends no request and preserves bytes',async()=>{
 const {store,values,attempt}=setup();let calls=0;const request=async()=>{calls++;return canonical();};
 values.set(directQuoteWriteKey(account),'{broken');
 await expect(continueDirectQuoteWrite({store,attempt,request,currentAccount:()=>account,onCheckpoint:()=>{}})).rejects.toMatchObject({kind:'storage'});expect(calls).toBe(0);expect(values.get(directQuoteWriteKey(account))).toBe('{broken');
 for(const broken of [{getItem:()=>null,setItem:()=>{},removeItem:()=>{}},{getItem:()=>{throw Error('Denied');},setItem:()=>{},removeItem:()=>{}}]){
  await expect(continueDirectQuoteWrite({store:broken,attempt,request,currentAccount:()=>account,onCheckpoint:()=>{}})).rejects.toMatchObject({kind:'storage'});
 }
 expect(calls).toBe(0);
});
test('different attempt and confirmed downgrade cannot replace a saved quote',()=>{
 const {store,attempt}=setup();const confirmed={...attempt,phase:'confirmed' as const,quoteId};saveDirectQuoteWrite(store,confirmed);
 expect(()=>saveDirectQuoteWrite(store,attempt)).toThrow();
 expect(()=>saveDirectQuoteWrite(store,{...confirmed,body:JSON.stringify({...input,title:'Changed'})})).toThrow();
 expect(()=>clearDirectQuoteWrite(store,attempt)).toThrow();expect(readDirectQuoteWrite(store,account)).toEqual(confirmed);
});
test('account switch after POST preserves recovery without a read or another write',async()=>{
 const {store,attempt}=setup();let actor:string|undefined=account,calls=0;
 await expect(continueDirectQuoteWrite({store,attempt,currentAccount:()=>actor,onCheckpoint:()=>{},request:async()=>{calls++;actor=undefined;return Response.json({quote});}})).rejects.toMatchObject({kind:'scope'});
 expect(calls).toBe(1);expect(readDirectQuoteWrite(store,account)?.phase).toBe('uncertain');
});
test('canonical ownership and link mismatch retain confirmed recovery',async()=>{
 const {store,attempt}=setup();const confirmed={...attempt,phase:'confirmed' as const,quoteId};
 for(const response of [{owned:false,quote,link:{clientId:'customer-1'}},{owned:true,quote,link:{clientId:'another'}}]){
  await expect(continueDirectQuoteWrite({store,attempt:confirmed,currentAccount:()=>account,onCheckpoint:()=>{},request:async()=>Response.json(response)})).rejects.toMatchObject({kind:'read'});
  expect(readDirectQuoteWrite(store,account)).toEqual(confirmed);
 }
});

test('incomplete ACKs and inconsistent canonical amounts never finish recovery',async()=>{
 const {store,attempt}=setup();
 await expect(continueDirectQuoteWrite({store,attempt,currentAccount:()=>account,onCheckpoint:()=>{},request:async()=>Response.json({quote:{id:quoteId}})})).rejects.toMatchObject({kind:'uncertain'});
 const confirmed={...attempt,phase:'confirmed' as const,quoteId};
 for(const malformed of [{id:quoteId,project_id:null},{...quote,total:101},{...quote,items:undefined},{...quote,total:'100'}]){
  await expect(continueDirectQuoteWrite({store,attempt:confirmed,currentAccount:()=>account,onCheckpoint:()=>{},request:async()=>Response.json({owned:true,quote:malformed,link:{clientId:'customer-1'}})})).rejects.toMatchObject({kind:'read'});
  expect(readDirectQuoteWrite(store,account)?.phase).toBe('confirmed');
 }
});
test('a known in-memory ACK survives failed persistence without repeating its POST',async()=>{
 const {store,attempt}=setup();let current=attempt,posts=0,fail=true;
 const flaky={...store,setItem:(key:string,value:string)=>{if(fail&&JSON.parse(value).phase==='confirmed')throw Error('Quota');store.setItem(key,value);}};
 const run=()=>continueDirectQuoteWrite({store:flaky,attempt:current,currentAccount:()=>account,onCheckpoint:value=>{current=value;},request:async(_url,init)=>{if(init?.method==='POST'){posts++;return Response.json({quote});}return canonical();}});
 await expect(run()).rejects.toMatchObject({kind:'storage'});expect(current.phase).toBe('confirmed');expect(readDirectQuoteWrite(store,account)?.phase).toBe('uncertain');
 fail=false;expect((await run()).status).toBe('confirmed');expect(posts).toBe(1);
});

const manualInput={...input,sourceManualLeadId:'a1000000-0000-4000-8000-000000000005',sourceManualLeadRevision:3};
const manualReceipt=()=>({input:manualInput,result:{link:{leadId:manualInput.sourceManualLeadId,sourceLeadRevision:3,sourceClientId:input.proClientId,quoteId,createdAt:quote.created_at},quote}});
test('manual source is a versioned exclusive context while old direct inputs stay unchanged',()=>{
 expect(directProjectQuoteSchema.parse(input)).toEqual(input);expect(directProjectQuoteSchema.parse(manualInput)).toEqual(manualInput);
 for(const invalid of [{...input,sourceManualLeadId:manualInput.sourceManualLeadId},{...input,sourceManualLeadRevision:3},{...manualInput,sourceManualLeadRevision:0},{...manualInput,context:'project',projectId:action},{...manualInput,proClientId:null}])expect(directProjectQuoteSchema.safeParse(invalid).success).toBe(false);
 const draft={version:1,savedAt:Date.now(),proClientId:'customer-1',cedula:'',clientName:'Customer',clientPhone:'',clientEmail:'',title:'Service',notes:'',validDays:15,taxMode:'exento',rows:[{description:'Service',quantity:'1',unit_price:''}],sourceManualLeadId:manualInput.sourceManualLeadId,sourceManualLeadRevision:3};
 expect(proQuoteDraftSchema.safeParse(draft).success).toBe(true);expect(proQuoteDraftSchema.safeParse({...draft,sourceRequestId:action}).success).toBe(false);expect(proQuoteDraftSchema.safeParse({...draft,sourceProjectId:action}).success).toBe(false);expect(proQuoteDraftSchema.safeParse({...draft,sourceManualLeadRevision:undefined}).success).toBe(false);
});
function manualSetup(){const result=setup();return {...result,attempt:{...result.attempt,body:JSON.stringify(manualInput)}};}
test('manual source uses independent receipt before creation and proves it before completion',async()=>{
 const {store,attempt}=manualSetup();let saved=false,posts=0;const paths:string[]=[];
 const result=await continueDirectQuoteWrite({store,attempt,currentAccount:()=>account,onCheckpoint:()=>{},request:async(url,init)=>{paths.push(url);if(init?.method==='POST'){expect(url).toBe('/api/pro/manual-lead-quotes');expect(init.body).toBe(attempt.body);posts++;saved=true;return Response.json({});}return url.startsWith('/api/pro/lead-private-quotes')?Response.json({receipt:saved?manualReceipt():null}):canonical();}});
 expect(result.status).toBe('confirmed');expect(posts).toBe(1);expect(paths).toHaveLength(4);expect(paths[0]).toContain('view=action');expect(paths[2]).toContain('view=action');expect(readDirectQuoteWrite(store,account)).toMatchObject({phase:'confirmed',quoteId});
});
test('manual lost ACK reload only reads existing immutable receipt despite later source changes',async()=>{
 const {store,attempt}=manualSetup();let saved=false,current=attempt,posts=0;
 const request=async(url:string,init?:RequestInit)=>{if(init?.method==='POST'){saved=true;posts++;throw Error('Lost ACK');}return url.startsWith('/api/pro/lead-private-quotes')?Response.json({receipt:saved?manualReceipt():null}):canonical();};
 await expect(continueDirectQuoteWrite({store,attempt,currentAccount:()=>account,onCheckpoint:v=>{current=v;},request})).rejects.toMatchObject({kind:'uncertain'});
 expect((await continueDirectQuoteWrite({store,attempt:current,currentAccount:()=>account,onCheckpoint:()=>{},request})).status).toBe('confirmed');expect(posts).toBe(1);
});
test('manual forged origin, changed input and fabricated acceptance cannot certify creation',async()=>{
 for(const change of ['lead','client','revision','input','accepted','quote']as const){const {store,attempt}=manualSetup(),r=manualReceipt();if(change==='lead')r.result.link.leadId=action;if(change==='client')r.result.link.sourceClientId='wrong';if(change==='revision')r.result.link.sourceLeadRevision++;if(change==='input')r.input={...manualInput,title:'Wrong'};if(change==='accepted')r.result.quote={...quote,status:'accepted',accepted_at:quote.created_at} as unknown as typeof quote;if(change==='quote')r.result.link.quoteId=action;let posts=0;await expect(continueDirectQuoteWrite({store,attempt,currentAccount:()=>account,onCheckpoint:()=>{},request:async(_u,init)=>{if(init?.method==='POST')posts++;return Response.json({receipt:r});}})).rejects.toMatchObject({kind:'read'});expect(posts).toBe(0);expect(readDirectQuoteWrite(store,account)?.phase).toBe('ready');}
});
test('manual successful ACK without immutable proof remains uncertain',async()=>{
 const {store,attempt}=manualSetup();let posts=0;await expect(continueDirectQuoteWrite({store,attempt,currentAccount:()=>account,onCheckpoint:()=>{},request:async(_u,init)=>{if(init?.method==='POST'){posts++;return Response.json(manualReceipt().result);}return Response.json({receipt:null});}})).rejects.toMatchObject({kind:'uncertain'});expect(posts).toBe(1);expect(readDirectQuoteWrite(store,account)?.body).toBe(attempt.body);
});
test('manual definitive fresh rejection permits review while uncertain rejection retains original body',async()=>{
 for(const phase of ['ready','uncertain']as const){const {store,attempt}=manualSetup(),a={...attempt,phase};const run=continueDirectQuoteWrite({store,attempt:a,currentAccount:()=>account,onCheckpoint:()=>{},request:async(_u,init)=>init?.method==='POST'?Response.json({}, {status:409}):Response.json({receipt:null})});if(phase==='ready'){expect((await run).status).toBe('rejected');expect(readDirectQuoteWrite(store,account)).toBeNull();}else{await expect(run).rejects.toMatchObject({kind:'uncertain'});expect(readDirectQuoteWrite(store,account)?.body).toBe(a.body);}}
});
test('manual deadline covers stalled proof headers and body without sending a quote',async()=>{
 for(const stalledBody of [false,true]){const {store,attempt}=manualSetup();let posts=0;await expect(continueDirectQuoteWrite({store,attempt,timeoutMs:5,currentAccount:()=>account,onCheckpoint:()=>{},request:async(_u,init)=>{if(init?.method==='POST')posts++;return stalledBody?{ok:true,status:200,json:()=>new Promise(()=>{})} as Response:new Promise<Response>(()=>{});}})).rejects.toMatchObject({kind:'read'});expect(posts).toBe(0);expect(readDirectQuoteWrite(store,account)?.phase).toBe('ready');}
});
test('manual POST timeout retains uncertainty and cannot change source on retry',async()=>{
 const {store,attempt}=manualSetup();await expect(continueDirectQuoteWrite({store,attempt,timeoutMs:5,currentAccount:()=>account,onCheckpoint:()=>{},request:async(_u,init)=>init?.method==='POST'?new Promise<Response>(()=>{}):Response.json({receipt:null})})).rejects.toMatchObject({kind:'uncertain'});const saved=readDirectQuoteWrite(store,account)!;expect(saved.body).toBe(attempt.body);expect(()=>saveDirectQuoteWrite(store,{...saved,body:JSON.stringify({...manualInput,sourceManualLeadRevision:4})})).toThrow();
});
test('manual canonical read timeout preserves confirmed proof and never repeats creation',async()=>{
 const {store,attempt}=manualSetup();let current=attempt,posts=0;
 await expect(continueDirectQuoteWrite({store,attempt,timeoutMs:5,currentAccount:()=>account,onCheckpoint:v=>{current=v;},request:async(url,init)=>{if(init?.method==='POST')posts++;return url.startsWith('/api/pro/lead-private-quotes')?Response.json({receipt:manualReceipt()}):{ok:true,status:200,json:()=>new Promise(()=>{})} as Response;}})).rejects.toMatchObject({kind:'read'});
 expect(current).toMatchObject({phase:'confirmed',quoteId});expect(readDirectQuoteWrite(store,account)).toEqual(current);expect(posts).toBe(0);
 expect((await continueDirectQuoteWrite({store,attempt:current,currentAccount:()=>account,onCheckpoint:()=>{},request:async url=>url.startsWith('/api/pro/lead-private-quotes')?Response.json({receipt:manualReceipt()}):canonical()})).status).toBe('confirmed');
});
