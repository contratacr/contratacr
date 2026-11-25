import {MOCK_WEBHOOK_SECRET,signWebhook} from '../webhook';
import {letterDigest} from '../esign/events';
import {cardBrand,luhn,type CardInput,type ChargeResult,type PaymentProcessor,type ProcessorEvent,type SignedEvent} from './processor';

/**
 * Round 6A: deterministic LOCAL processor (mode «mock»). No network, no real card. Fixtures (shown on the
 * hosted page and in the setup guide):
 *   4242 4242 4242 4242 → approved                4000 0000 0000 0002 → declined («card_declined»)
 *   4000 0000 0000 3220 → bank verification (3-D Secure): «Aprobar» → approved, «Rechazar» → declined
 *   4000 0000 0000 9995 → declined («insufficient_funds»)   any other valid (Luhn) number → approved
 *   SINPE Móvil: confirmation number of 8–25 digits → confirmed; starting with 000 → «sinpe_not_found».
 * Approved payments are NOT booked here: the processor emits a signed `payment.succeeded` event that goes
 * through the webhook inbox like a real one.
 */
export const MOCK_CARDS={approved:'4242424242424242',declined:'4000000000000002',threeDs:'4000000000003220',insufficient:'4000000000009995'} as const;
// Letters only (as the e-sign mock): a hex digest could hold a 13–19 digit run that the inbox redaction masks
// as a card number, and the stored event then no longer matched its attempt or its own id.
const ref=(kind:string,id:string)=>`mock_${kind}_${letterDigest(id,20)}`;
export class MockProcessor implements PaymentProcessor{
 readonly provider='tilopay' as const;readonly mode='mock' as const;
 private events:SignedEvent[]=[];
 private emit(type:ProcessorEvent['type'],processorRef:string,amountCents:number,suffix:string,failureCode?:string){
  const event:ProcessorEvent={id:'evt_'+letterDigest(processorRef+':'+suffix),type,processorRef,amountCents,...(failureCode?{failureCode}:{}),created:Math.floor(Date.now()/1000)};
  const body=JSON.stringify(event);this.events.push({body,signature:signWebhook(MOCK_WEBHOOK_SECRET,body),event});
 }
 async chargeCard({attemptId,amountCents,card}:{attemptId:string;amountCents:number;card:CardInput;description:string}):Promise<ChargeResult>{
  const digits=card.number.replace(/\D/g,''),processorRef=ref('card',attemptId),meta={cardLast4:digits.slice(-4),cardBrand:cardBrand(digits)};
  const now=new Date(),expired=card.expYear<now.getUTCFullYear()||card.expYear===now.getUTCFullYear()&&card.expMonth<now.getUTCMonth()+1;
  if(!luhn(digits)||!/^\d{3,4}$/.test(card.cvc))return {status:'failed',processorRef,failureCode:'invalid_card',...meta};
  if(expired)return {status:'failed',processorRef,failureCode:'expired_card',...meta};
  if(digits===MOCK_CARDS.declined)return {status:'failed',processorRef,failureCode:'card_declined',...meta};
  if(digits===MOCK_CARDS.insufficient)return {status:'failed',processorRef,failureCode:'insufficient_funds',...meta};
  if(digits===MOCK_CARDS.threeDs)return {status:'requires_action',processorRef,...meta};
  this.emit('payment.succeeded',processorRef,amountCents,'succeeded');
  return {status:'pending',processorRef,...meta};
 }
 async completeAction({processorRef,amountCents,approve}:{processorRef:string;amountCents:number;approve:boolean}){
  if(approve){this.emit('payment.succeeded',processorRef,amountCents,'succeeded');return {status:'pending' as const};}
  this.emit('payment.failed',processorRef,amountCents,'failed','authentication_failed');return {status:'failed' as const,failureCode:'authentication_failed'};
 }
 async confirmSinpe({processorRef,amountCents,reference}:{processorRef:string;amountCents:number;currency:'CRC';reference:string;code:string}):Promise<ChargeResult>{
  if(!/^\d{8,25}$/.test(reference))return {status:'failed',processorRef,failureCode:'invalid_reference'};
  if(reference.startsWith('000'))return {status:'failed',processorRef,failureCode:'sinpe_not_found'};
  this.emit('payment.succeeded',processorRef,amountCents,'succeeded');
  return {status:'pending',processorRef};
 }
 async refund({processorRef,amountCents}:{processorRef:string;amountCents:number}){
  this.emit('payment.refunded',processorRef,amountCents,'refunded');
  return {ok:true,message:'Simulación: reembolso aceptado.'};
 }
 drainEvents(){return this.events.splice(0);}
}
