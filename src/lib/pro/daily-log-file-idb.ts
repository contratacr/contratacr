import {assertDailyLogFileQueueAdvance,assertDailyLogFileQueueRemoval,assertDailyLogFileQueueArchive,dailyLogFileQueueSignature,validateDailyLogFileQueue,isCompanyDailyLogQueuedFile,type DailyLogFileQueue,type DailyLogFileStore} from './daily-log-file-recovery';

/** Private raw bytes never enter expiring form drafts or localStorage. */
export function dailyLogFileIndexedDB(factory:IDBFactory):DailyLogFileStore{
 const database='ccr-pro-daily-log-files',table='attempts';
 async function open():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
  let settled=false;const r=factory.open(database,2),timer=setTimeout(()=>finish(Error('File recovery database timed out')),10000);
  function finish(error?:Error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else{r.result.onversionchange=()=>r.result.close();resolve(r.result);}}
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(table))r.result.createObjectStore(table,{keyPath:'scope.accountId'});if(!r.result.objectStoreNames.contains('archives'))r.result.createObjectStore('archives');};
  r.onerror=()=>finish(r.error??Error('File recovery unavailable'));r.onblocked=()=>finish(Error('File recovery blocked'));
  r.onsuccess=()=>{if(settled)r.result.close();else finish();};
 });}
 async function transaction<T>(mode:IDBTransactionMode,run:(store:IDBObjectStore,done:(v:T)=>void,fail:(e:Error)=>void)=>void):Promise<T>{
  const db=await open();return new Promise((resolve,reject)=>{
   let tx:IDBTransaction|undefined,value:T,error:Error|undefined,settled=false;
   const finish=(reason?:Error)=>{if(settled)return;settled=true;clearTimeout(timer);db.close();if(reason)reject(reason);else resolve(value);};
   const timer=setTimeout(()=>{try{tx?.abort();}catch{/* retain timeout */}finish(Error('File recovery transaction timed out'));},15000);
   try{tx=db.transaction([table,'archives'],mode);tx.oncomplete=()=>finish(error);tx.onabort=()=>finish(error??tx?.error??Error('File recovery transaction aborted'));tx.onerror=()=>{error??=tx?.error??Error('File recovery transaction failed');};
    run(tx.objectStore(table),v=>{value=v;},e=>{error=e;try{tx?.abort();}catch{finish(e);}});
   }catch(e){try{tx?.abort();}catch{/* no transaction */}finish(e instanceof Error?e:Error('File recovery unavailable'));}
  });
 }
 const actor=(scope:Parameters<DailyLogFileStore['read']>[0])=>typeof scope==='string'?scope:scope.accountId;
 const rawRead=(id:string)=>transaction<unknown>('readonly',(s,done)=>{const r=s.get(id);r.onsuccess=()=>done(r.result??null);});
 const read:DailyLogFileStore['read']=async scope=>{const id=actor(scope),raw=await rawRead(id);return raw===null?null:validateDailyLogFileQueue(raw,id);};
 const same=(a:DailyLogFileQueue|null,b:DailyLogFileQueue|null)=>{
  if(a===null||b===null)return a===b;if(dailyLogFileQueueSignature(a)!==dailyLogFileQueueSignature(b))return false;
  return a.files.every((f,i)=>{const other=b.files[i];if(isCompanyDailyLogQueuedFile(f)||isCompanyDailyLogQueuedFile(other))return isCompanyDailyLogQueuedFile(f)&&isCompanyDailyLogQueuedFile(other);const left=new Uint8Array(f.bytes),right=new Uint8Array(other.bytes);return left.length===right.length&&left.every((byte,n)=>byte===right[n]);});
 };
 async function mutate(expected:DailyLogFileQueue|null,next:DailyLogFileQueue|null){
  if(next===null&&expected)assertDailyLogFileQueueRemoval(expected);
  const id=(next??expected)!.scope.accountId;
  const old=expected===null?null:await validateDailyLogFileQueue(expected,id),value=next===null?null:await validateDailyLogFileQueue(next,id);
  if(value)assertDailyLogFileQueueAdvance(old,value);
  // Verify stored bytes before CAS; the transaction checks its exact checksum-bound metadata.
  if(!same(await read(id),old))throw Error('Daily log file recovery changed');
  await transaction<void>('readwrite',(s,done,fail)=>{const r=s.get(id);r.onsuccess=()=>{try{
   const actual=r.result??null;if(!same(actual,old))throw Error('Daily log file recovery changed concurrently');
   if(value===null)s.delete(id);else s.put(value);done();
  }catch(e){fail(e instanceof Error?e:Error('Daily log recovery failed'));}};});
  if(!same(await read(id),value))throw Error('Daily log file recovery readback failed');
 }
 async function archiveQueue(expected:DailyLogFileQueue){
  assertDailyLogFileQueueArchive(expected);const value=await validateDailyLogFileQueue(expected,expected.scope.accountId),id=value.scope.accountId;
  if(!same(await read(id),value))throw Error('Daily log file recovery changed');
  const key=[id,value.scope.logId,value.intent!.uploads[0].actionId];
  await transaction<void>('readwrite',(s,done,fail)=>{const r=s.get(id);r.onsuccess=()=>{try{
   if(!same(r.result??null,value))throw Error('Daily log file recovery changed concurrently');
   const archives=s.transaction.objectStore('archives'),prior=archives.get(key);prior.onsuccess=()=>{try{if(prior.result!==undefined&&!same(prior.result,value))throw Error('Daily log file archive collision');archives.put(value,key);s.delete(id);done();}catch(e){fail(e instanceof Error?e:Error('Daily log file archive failed'));}};
  }catch(e){fail(e instanceof Error?e:Error('Daily log file archive failed'));}};});
  if(await read(id)!==null)throw Error('Daily log file archive not retained');
  const saved=await transaction<unknown>('readonly',(s,done)=>{const r=s.transaction.objectStore('archives').get(key);r.onsuccess=()=>done(r.result);});
  if(!same(await validateDailyLogFileQueue(saved,id),value))throw Error('Daily log file archive readback failed');
 }
 return{read,advance:(expected,next)=>mutate(expected,next),removeQueue:expected=>mutate(expected,null),archiveQueue};
}
