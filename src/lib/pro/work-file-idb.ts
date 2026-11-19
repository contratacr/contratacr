import {parseWorkFileWrite,validateWorkFileWrite,sameWorkFileIntent,assertWorkFileAdvance,type WorkFileScope,type WorkFileWrite,type WorkFileStore} from './work-file-recovery';
const databaseName='ccr-pro-work-file-recovery',storeName='attempts';
/** Separate from public form drafts: no expiry, base64 fallback, silent failures or eviction. */
export function workFileIndexedDB(factory:IDBFactory):WorkFileStore{
 function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let settled=false;const request=factory.open(databaseName,1),timer=setTimeout(()=>finish(Error('File recovery database timed out')),10000);
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else{request.result.onversionchange=()=>request.result.close();resolve(request.result);}}
  request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(storeName))request.result.createObjectStore(storeName,{keyPath:['accountId','workId']});};
  request.onblocked=()=>finish(Error('File recovery database is blocked'));
  request.onerror=()=>finish(request.error??Error('File recovery database unavailable'));
  request.onsuccess=()=>{if(settled){request.result.close();return;}finish();};
 });}
 async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,done:(value:T)=>void,fail:(error:Error)=>void)=>void):Promise<T>{
  const db=await open();return new Promise((resolve,reject)=>{
   let tx:IDBTransaction,settled=false,result:T,error:Error|undefined;
   const finish=(reason?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);db.close();if(reason)reject(reason);else resolve(result);};
   const timer=setTimeout(()=>{try{tx?.abort();}catch{/* Already ended; retain the failure. */}finish(Error('File recovery transaction timed out'));},15000);
   try{tx=db.transaction(storeName,mode);const store=tx.objectStore(storeName);
    if(JSON.stringify(store.keyPath)!==JSON.stringify(['accountId','workId']))throw Error('File recovery schema mismatch');
    tx.oncomplete=()=>finish(error);tx.onabort=()=>finish(error??tx.error??Error('File recovery transaction aborted'));tx.onerror=()=>{error??=tx.error??Error('File recovery transaction failed');};
    run(store,value=>{result=value;},reason=>{error=reason;try{tx.abort();}catch{finish(reason);}});
   }catch(reason){try{tx!.abort();}catch{/* No transaction was opened. */}finish(reason instanceof Error?reason:Error('File recovery unavailable'));}
  });
 }
 const rawRead=(scope:WorkFileScope)=>transaction<unknown>('readonly',(store,done)=>{const request=store.get([scope.accountId,scope.workId]);request.onsuccess=()=>done(request.result??null);});
 async function read(scope:WorkFileScope){const raw=await rawRead(scope);return raw===null?null:validateWorkFileWrite(raw,scope);}
 async function advance(value:WorkFileWrite){
  const scope={accountId:value.accountId,workId:value.workId},next=await validateWorkFileWrite(value,scope);
  await transaction<void>('readwrite',(store,done,fail)=>{const get=store.get([scope.accountId,scope.workId]);get.onsuccess=()=>{
   try{const prior=get.result===undefined?null:parseWorkFileWrite(get.result,scope);assertWorkFileAdvance(prior,next);store.put(next);done();}catch(error){fail(error instanceof Error?error:Error('File recovery collision'));}
  };});
  // A successful request is insufficient: the transaction must commit and retain
  // the exact bytes/checkpoint before the caller may send any network request.
  const saved=await read(scope);
  if(!saved||!sameWorkFileIntent(saved,next)||saved.phase!==next.phase||JSON.stringify(saved.ack)!==JSON.stringify(next.ack))throw Error('File recovery readback mismatch');
 }
 async function remove(value:WorkFileWrite){
  const scope={accountId:value.accountId,workId:value.workId},expected=await validateWorkFileWrite(value,scope);
  await transaction<void>('readwrite',(store,done,fail)=>{const get=store.get([scope.accountId,scope.workId]);get.onsuccess=()=>{
   try{const prior=get.result===undefined?null:parseWorkFileWrite(get.result,scope);if(prior&&(!sameWorkFileIntent(prior,expected)||prior.phase!==expected.phase||JSON.stringify(prior.ack)!==JSON.stringify(expected.ack)))throw Error('File recovery changed before clearing');store.delete([scope.accountId,scope.workId]);done();}catch(error){fail(error instanceof Error?error:Error('File recovery clear failed'));}
  };});
  if(await rawRead(scope)!==null)throw Error('File recovery was not removed');
 }
 return {read,advance,remove};
}
