import {test,expect} from 'playwright/test';
import {proQuoteDraftKey,readProQuoteDraft,ProQuoteDraftRecoveryError,type ProQuoteDraft} from '../../src/lib/pro/quote-draft';

const requestId='82000000-0000-4000-8000-000000000001';
const actionId='82000000-0000-4000-8000-000000000002';
const quoteId='82000000-0000-4000-8000-000000000003';
const values=new Map<string,string>();
let originalStorage:PropertyDescriptor|undefined;
function draft(overrides:Partial<ProQuoteDraft>={}):ProQuoteDraft{
 return {version:1,savedAt:Date.now(),proClientId:'local-customer',cedula:'',clientName:'Local customer',clientPhone:'',clientEmail:'',title:'Local service',notes:'',validDays:15,taxMode:'incluido',rows:[{description:'Local service',quantity:'1',unit_price:'12500'}],...overrides};
}
function store(value:unknown,account='owner-a'){
 const serialized=JSON.stringify(value);values.set(proQuoteDraftKey(account),serialized);return serialized;
}
test.beforeEach(()=>{
 values.clear();originalStorage=Object.getOwnPropertyDescriptor(globalThis,'sessionStorage');
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:(key:string)=>values.get(key)??null}});
});
test.afterEach(()=>{
 if(originalStorage)Object.defineProperty(globalThis,'sessionStorage',originalStorage);
 else Reflect.deleteProperty(globalThis,'sessionStorage');
});

test('ordinary quote drafts expire without deleting stored data',()=>{
 const recent=draft();store(recent);expect(readProQuoteDraft('owner-a')).toEqual(recent);
 const expired=draft({savedAt:Date.now()-49*3600000});const raw=store(expired);
 expect(readProQuoteDraft('owner-a')).toBeNull();
 expect(values.get(proQuoteDraftKey('owner-a'))).toBe(raw);
});

test('uncertain creation and durable quote receipts survive ordinary draft expiry',()=>{
 for(const receipt of [
  {sourceRequestId:requestId,clientActionId:actionId,requestPending:true},
  {sourceRequestId:requestId,clientActionId:actionId,requestPending:false,createdQuoteId:quoteId},
  {createdQuoteId:quoteId},
 ]){
  const pending=draft({savedAt:Date.now()-90*24*3600000,...receipt});const raw=store(pending);
  expect(readProQuoteDraft('owner-a')).toEqual(pending);
  expect(values.get(proQuoteDraftKey('owner-a'))).toBe(raw);
 }
});

test('incoherent pending attempts block recovery instead of becoming fresh drafts',()=>{
 for(const invalid of [
  {requestPending:true},
  {requestPending:true,sourceRequestId:requestId},
  {requestPending:true,clientActionId:actionId},
  {sourceRequestId:requestId,sourceProjectId:quoteId},
 ]){
  const raw=store(draft(invalid));
  expect(()=>readProQuoteDraft('owner-a')).toThrow(ProQuoteDraftRecoveryError);
  expect(values.get(proQuoteDraftKey('owner-a'))).toBe(raw);
 }
});

test('quote recovery only reads the signed-in account draft',()=>{
 const first=draft({sourceRequestId:requestId,clientActionId:actionId,requestPending:true});
 const second=draft({title:'Different account service',clientName:'Different customer'});
 store(first);store(second,'owner-b');
 expect(readProQuoteDraft('owner-a')).toEqual(first);
 expect(readProQuoteDraft('owner-b')).toEqual(second);
 expect(readProQuoteDraft('owner-c')).toBeNull();
 expect(values.size).toBe(2);
});

test('unreadable or corrupted storage blocks recovery and preserves evidence',()=>{
 for(const raw of ['{broken',JSON.stringify(draft({savedAt:Date.now()+120000})),'x'.repeat(64001)]){
  values.set(proQuoteDraftKey('owner-a'),raw);
  expect(()=>readProQuoteDraft('owner-a')).toThrow(ProQuoteDraftRecoveryError);
  expect(values.get(proQuoteDraftKey('owner-a'))).toBe(raw);
 }
 Object.defineProperty(globalThis,'sessionStorage',{configurable:true,value:{getItem:()=>{throw new Error('Storage denied');}}});
 expect(()=>readProQuoteDraft('owner-a')).toThrow(ProQuoteDraftRecoveryError);
});
