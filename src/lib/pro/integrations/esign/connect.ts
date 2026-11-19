import {createHmac,timingSafeEqual} from 'node:crypto';

/** Round 6B: DocuSign Connect helpers (pure; unit-tested). */
/** Connect HMAC: base64(HMAC-SHA256(key, raw body)) in X-DocuSign-Signature-1 (one header per key). */
export function verifyConnectHmac(key:string,body:string,header:string|null){
 if(!header||!key)return false;
 const expected=Buffer.from(createHmac('sha256',key).update(body,'utf8').digest('base64')),given=Buffer.from(header.trim());
 return expected.length===given.length&&timingSafeEqual(expected,given);
}
/** Connect event → our provider status vocabulary. Expired envelopes arrive as voided with an expiry reason. */
export function connectStatus(event:string,voidedReason?:string){
 const map:Record<string,string>={'envelope-sent':'sent','envelope-delivered':'delivered','envelope-completed':'completed','envelope-declined':'declined','envelope-voided':'voided'};
 const status=map[event]??null;
 return status==='voided'&&/expir/i.test(voidedReason??'')?'expired':status;
}
