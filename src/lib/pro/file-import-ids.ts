import {createHash} from 'node:crypto';
// Server-only (node:crypto): kept out of file-import.ts so client components can import that module's schemas.
/** Deterministic ids for one item of one batch, so a retry of the same batch hits the same upload (idempotent) and never duplicates. */
export function importItemIds(batchId:string,externalId:string){
 const make=(label:string)=>{const h=createHash('sha256').update(`pro-import:${batchId}:${externalId}:${label}`).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
 return{fileId:make('file'),actionId:make('action')};
}
