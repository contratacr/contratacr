import {createHash,randomBytes} from 'node:crypto';
/** Server only. 32 random bytes; the database keeps only this domain-prefixed SHA-256. */
export const workInviteNewToken=()=>randomBytes(32).toString('base64url');
export const workInviteHash=(token:string)=>createHash('sha256').update('ccr-work-invite:v1:'+token,'utf8').digest('hex');
