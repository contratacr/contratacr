import {test,expect} from 'playwright/test';
import {saveDirectQuoteWrite,readDirectQuoteWrite,clearDirectQuoteWrite,continueDirectQuoteWrite,type DirectQuoteWrite} from '../../src/lib/pro/direct-quote-write-recovery';
const account='a1000000-0000-4000-8000-000000000001';
function store(){const values=new Map<string,string>();return {getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);},removeItem:(key:string)=>{values.delete(key);}};}
const body=JSON.stringify({context:'direct',clientActionId:'a1000000-0000-4000-8000-000000000002',proClientId:null,clientName:'Customer',clientPhone:null,clientCedula:null,clientEmail:null,title:null,notes:null,items:[{description:'Visit',quantity:1,unit_price:100}],taxMode:'exento',validDays:15});
test('originating tab retains exact identity after another tab resolves and clears the global attempt',async()=>{
 const global=store(),tabA=store(),tabB=store();const attempt:DirectQuoteWrite={version:1,accountId:account,body,phase:'ready',quoteId:null};
 tabB.setItem('draft','Unrelated draft B');
 await expect(continueDirectQuoteWrite({store:global,attempt,currentAccount:()=>account,onCheckpoint:value=>saveDirectQuoteWrite(tabA,value),request:async()=>{throw Error('ACK lost');}})).rejects.toThrow();
 const recoveredB=readDirectQuoteWrite(global,account)!;
 saveDirectQuoteWrite(tabB,recoveredB);
 clearDirectQuoteWrite(global,recoveredB);clearDirectQuoteWrite(tabB,recoveredB);
 const reloadedA=readDirectQuoteWrite(tabA,account)!;
 expect(reloadedA.body).toBe(body);expect(reloadedA.phase).toBe('uncertain');expect(tabB.getItem('draft')).toBe('Unrelated draft B');
 let sent='';await expect(continueDirectQuoteWrite({store:global,attempt:reloadedA,currentAccount:()=>account,onCheckpoint:value=>saveDirectQuoteWrite(tabA,value),request:async(_url,init)=>{sent=String(init?.body);return Response.json({}, {status:401});}})).rejects.toThrow();
 expect(sent).toBe(body);expect(readDirectQuoteWrite(tabA,account)?.body).toBe(body);
});
test('failed tab checkpoint prevents a POST even with writable global storage',async()=>{
 let calls=0;await expect(continueDirectQuoteWrite({store:store(),attempt:{version:1,accountId:account,body,phase:'ready',quoteId:null},currentAccount:()=>account,onCheckpoint:()=>{throw Error('Tab persistence denied');},request:async()=>{calls++;return Response.json({});}})).rejects.toThrow();expect(calls).toBe(0);
});

test('only a provably unsent initial collision yields to the other tab',async()=>{
 const {recoverUnsentQuoteCollision}=await import('../../src/lib/pro/direct-quote-collision');
 const {DirectQuoteWriteFailure}=await import('../../src/lib/pro/direct-quote-write-recovery');
 const globalStore=store(),tabStore=store();const a:DirectQuoteWrite={version:1,accountId:account,body,phase:'uncertain',quoteId:null};
 const b={...a,body:JSON.stringify({...JSON.parse(body),clientActionId:'a1000000-0000-4000-8000-000000000099'})};
 saveDirectQuoteWrite(globalStore,b);saveDirectQuoteWrite(tabStore,a);tabStore.setItem('draft','Own untouched form');tabStore.setItem('owner',JSON.stringify({accountId:account,body:a.body,rawDraft:'Own untouched form'}));
 const args={error:new DirectQuoteWriteFailure('storage',a),startedFresh:true,requestStarted:false,globalStore,tabStore,accountId:account,ownerKey:'owner'};
 expect(recoverUnsentQuoteCollision({...args,startedFresh:false})).toBeNull();expect(readDirectQuoteWrite(tabStore,account)).toEqual(a);
 expect(recoverUnsentQuoteCollision({...args,requestStarted:true})).toBeNull();expect(readDirectQuoteWrite(tabStore,account)).toEqual(a);
 expect(recoverUnsentQuoteCollision({...args,error:new DirectQuoteWriteFailure('storage',{...a,phase:'confirmed',quoteId:'a1000000-0000-4000-8000-000000000088'})})).toBeNull();
 expect(recoverUnsentQuoteCollision(args)).toEqual(b);expect(readDirectQuoteWrite(tabStore,account)).toBeNull();expect(tabStore.getItem('owner')).toBeNull();expect(tabStore.getItem('draft')).toBe('Own untouched form');expect(readDirectQuoteWrite(globalStore,account)).toEqual(b);
});
