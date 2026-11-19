import {createHash} from 'node:crypto';
/** Deterministic UUID (v4 layout) for a sub-step of one idempotent action: retries reuse the same ids. */
export function derivedId(base:string,label:string){
 const hex=createHash('sha256').update(`ccr-integration:${base}:${label}`).digest('hex').slice(0,32).split('');
 hex[12]='4';hex[16]=((parseInt(hex[16]!,16)&0x3)|0x8).toString(16);
 const h=hex.join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
