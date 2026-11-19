import {createHash} from 'node:crypto';
import {signWebhook} from '../webhook';

/** Round 6B: provider events of the MOCK signature provider (pure; signed with a PUBLIC local test value). */
export const MOCK_ESIGN_SECRET='ccr-local-mock-esign-v1';
/** Hex digest written with letters a–p: mock ids never contain digit runs that redaction would mask as card numbers. */
export const letterDigest=(text:string,length=24)=>createHash('sha256').update(text).digest('hex').slice(0,length).replace(/[0-9a-f]/g,c=>'abcdefghijklmnop'[parseInt(c,16)]!);
export type EsignEvent={id:string;envelopeId:string;status:'sent'|'delivered'|'completed'|'declined'|'voided'|'expired';reason?:string;typedName?:string;at:string};
export function mockEvent(envelopeId:string,status:EsignEvent['status'],extra:{reason?:string;typedName?:string}={}){
 const event:EsignEvent={id:'evt_'+letterDigest(envelopeId+':'+status),envelopeId,status,...extra,at:new Date().toISOString()};
 const body=JSON.stringify(event);return {body,signature:signWebhook(MOCK_ESIGN_SECRET,body),event};
}
