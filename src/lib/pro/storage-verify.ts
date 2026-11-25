import {createHash} from 'node:crypto';

type Downloadable={download(path:string):Promise<{data:Blob|null;error:unknown}>};
export type StoredObjectCheck='ok'|'missing'|'mismatch';

// Two simultaneous replays of the same idempotent upload both succeed in Supabase Storage even with
// upsert:false: the later write replaces the object's version and deletes the earlier one, so the first
// request's verification read can hit the deleted version (ENOENT, a 500 from Storage). The bytes are
// identical, so re-read briefly before treating the object as missing. A real mismatch fails at once.
export async function verifyStoredObject(bucket:Downloadable,path:string,sizeBytes:number,sha256:string):Promise<StoredObjectCheck>{
 for(let attempt=0;attempt<4;attempt++){
  if(attempt)await new Promise(resolve=>setTimeout(resolve,150*attempt));
  const stored=await bucket.download(path);if(stored.error||!stored.data||stored.data.size!==sizeBytes)continue;
  return createHash('sha256').update(new Uint8Array(await stored.data.arrayBuffer())).digest('hex')===sha256?'ok':'mismatch';
 }
 return 'missing';
}
