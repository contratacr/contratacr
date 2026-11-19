import {createHmac,timingSafeEqual} from 'node:crypto';

/**
 * Round 6A: webhook signatures. Header `X-CCR-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, t + "." + raw body)>`,
 * accepted within ±5 minutes, compared in constant time. The MOCK processor signs with a fixed, PUBLIC
 * local test value (it is not a secret: mock events only ever touch links created in mock mode, and the
 * routes exist only in development). Real providers use their own verification (see payments/tilopay.ts).
 */
export const MOCK_WEBHOOK_SECRET='ccr-local-mock-processor-v1';
export const SIGNATURE_HEADER='x-ccr-signature';
export const SIGNATURE_TOLERANCE_SECONDS=300;
export function signWebhook(secret:string,body:string,timestamp=Math.floor(Date.now()/1000)){
 return `t=${timestamp},v1=${createHmac('sha256',secret).update(`${timestamp}.${body}`,'utf8').digest('hex')}`;
}
export type SignatureCheck={ok:true}|{ok:false;reason:'missing'|'malformed'|'stale'|'mismatch'};
export function verifyWebhook(secret:string,body:string,header:string|null,now=Math.floor(Date.now()/1000)):SignatureCheck{
 if(!header)return {ok:false,reason:'missing'};
 const parts=Object.fromEntries(header.split(',').map(part=>{const index=part.indexOf('=');return [part.slice(0,index).trim(),part.slice(index+1).trim()];}));
 const t=Number(parts.t),v1=parts.v1;
 if(!Number.isInteger(t)||typeof v1!=='string'||!/^[a-f0-9]{64}$/.test(v1))return {ok:false,reason:'malformed'};
 if(Math.abs(now-t)>SIGNATURE_TOLERANCE_SECONDS)return {ok:false,reason:'stale'};
 const expected=Buffer.from(createHmac('sha256',secret).update(`${t}.${body}`,'utf8').digest('hex'),'hex'),given=Buffer.from(v1,'hex');
 return expected.length===given.length&&timingSafeEqual(expected,given)?{ok:true}:{ok:false,reason:'mismatch'};
}
