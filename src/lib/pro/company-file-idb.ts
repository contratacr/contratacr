import {parseCompanyFileWrite,validateCompanyFileWrite,assertCompanyFileAdvance,type CompanyFileWrite,type CompanyFileStore} from './company-file-recovery';
const databaseName='ccr-pro-company-file-recovery',storeName='attempts';
/** Separate from public form drafts: no expiry, base64 fallback, silent failures or eviction. */
export function companyFileIndexedDB(factory:IDBFactory):CompanyFileStore{
 function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let settled=false;const request=factory.open(databaseName,1),timer=setTimeout(()=>finish(Error('File recovery database timed out')),10000);
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else{request.result.onversionchange=()=>request.result.close();resolve(request.result);}}
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName,{keyPath:'accountId'});if(!request.result.objectStoreNames.contains('archives'))request.result.createObjectStore('archives',{keyPath:['accountId','inputHash']});};
  request.onblocked=()=>finish(Error('File recovery database is blocked'));
  request.onerror=()=>finish(request.error??Error('File recovery database unavailable'));
  request.onsuccess=()=>{if(settled){request.result.close();return;}finish();};
 });}
 async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:Error)=>void)=>void):Promise<T>{
  const db=await open();return new Promise((resolve,reject)=>{
   let tx:IDBTransaction,settled=false,result:T,error:Error|undefined;
   const finish=(reason?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);db.close();if(reason)reject(reason);else resolve(result);};
   const timer=setTimeout(()=>{try{tx?.abort();}catch{/* Already ended; retain the failure. */}finish(Error('File recovery transaction timed out'));},15000);
   try{tx=db.transaction([storeName,'archives'],mode);const store=tx.objectStore(storeName);
    if(store.keyPath!=='accountId')throw Error('File recovery schema mismatch');
    tx.oncomplete=()=>finish(error);tx.onabort=()=>finish(error??tx.error??Error('File recovery transaction aborted'));tx.onerror=()=>{error??=tx.error??Error('File recovery transaction failed');};
    run(store,value=>{result=value;},reason=>{error=reason;try{tx.abort();}catch{finish(reason);}});
   }catch(reason){try{tx!.abort();}catch{/* No transaction was opened. */}finish(reason instanceof Error?reason:Error('File recovery unavailable'));}
  });
 }
 const rawRead=(actor:string)=>transaction<unknown>('readonly',(store,done)=>{const request=store.get(actor);request.onsuccess=()=>done(request.result??null);});
 async function read(actor:string){const raw=await rawRead(actor);return raw===null?null:validateCompanyFileWrite(raw,actor);}
 async function advance(value:CompanyFileWrite){
  const actor=value.accountId,next=await validateCompanyFileWrite(value,actor);
  await transaction<void>('readwrite',(store,done,fail)=>{const get=store.get(actor);get.onsuccess=()=>{
   try{const prior=get.result===undefined?null:parseCompanyFileWrite(get.result,actor);assertCompanyFileAdvance(prior,next);store.put(next);done();}catch(error){fail(error instanceof Error?error:Error('File recovery collision'));}
  };});
  // A successful request is insufficient: the transaction must commit and retain
  // the exact bytes/checkpoint before the caller may send any network request.
  const saved=await read(actor);
  if(!saved||JSON.stringify(saved)!==JSON.stringify(next))throw Error('File recovery readback mismatch');
 }
 async function remove(value:CompanyFileWrite){
  const actor=value.accountId,expected=await validateCompanyFileWrite(value,actor);
  await transaction<void>('readwrite',(store,done,fail)=>{const get=store.get(actor);get.onsuccess=()=>{
   try{const prior=get.result===undefined?null:parseCompanyFileWrite(get.result,actor);if(prior&&(JSON.stringify(prior)!==JSON.stringify(expected)))throw Error('File recovery changed before clearing');store.delete(actor);done();}catch(error){fail(error instanceof Error?error:Error('File recovery clear failed'));}
  };});
  if(await rawRead(actor)!==null)throw Error('File recovery was not removed');
 }
 async function archive(value:CompanyFileWrite){
  const actor=value.accountId,expected=await validateCompanyFileWrite(value,actor);
  await transaction<void>('readwrite',(store,done,fail)=>{const get=store.get(actor);get.onsuccess=()=>{try{const prior=get.result===undefined?null:parseCompanyFileWrite(get.result,actor);if(!prior||JSON.stringify(prior)!==JSON.stringify(expected))throw Error('Company file recovery changed');const archives=store.transaction.objectStore('archives'),old=archives.get([actor,expected.inputHash]);old.onsuccess=()=>{try{if(old.result!==undefined&&JSON.stringify(old.result)!==JSON.stringify(expected))throw Error('Company file archive collision');archives.put(expected);store.delete(actor);done();}catch(error){fail(error instanceof Error?error:Error('Company file archive failed'));}};}catch(error){fail(error instanceof Error?error:Error('Company file archive failed'));}};});
  if(await rawRead(actor)!==null)throw Error('Company file recovery was not archived');
 }
 return {read,advance,remove,archive};
}
