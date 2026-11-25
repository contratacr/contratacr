/**
 * Round 6A: generic payment-processor adapter. A processor never writes our ledger: it returns what it
 * did, and its EVENTS (webhooks) are the only path that books money (pro_payment_event_apply, exactly once).
 */
export type CardInput={number:string;expMonth:number;expYear:number;cvc:string;name:string};
export type ChargeResult=
 {status:'pending';processorRef:string;cardLast4?:string;cardBrand?:string}
 |{status:'requires_action';processorRef:string;cardLast4?:string;cardBrand?:string}
 |{status:'failed';processorRef:string;failureCode:string;cardLast4?:string;cardBrand?:string};
export type ProcessorEvent={id:string;type:'payment.succeeded'|'payment.failed'|'payment.refunded';processorRef:string;amountCents:number;failureCode?:string;created:number};
export type SignedEvent={body:string;signature:string;event:ProcessorEvent};
/**
 * SINPE order reference. References travel in webhook payloads and the inbox redaction masks any 13–19 digit
 * run as a card number: the old 32-hex reference sometimes contained one, so the stored event no longer
 * matched its attempt («unknown_reference») and the payment was never booked. A UUID keeps every digit run
 * at 12 or fewer (Tilopay card attempts already use UUIDs as order numbers).
 */
export function sinpeProcessorRef(){return 'ccr_sinpe_'+globalThis.crypto.randomUUID();}
export interface PaymentProcessor{
 readonly provider:'tilopay';readonly mode:'mock'|'sandbox'|'production';
 /** Card charge for one link attempt. Never receives more than it needs; nothing is stored by us but last4. */
 chargeCard(input:{attemptId:string;amountCents:number;card:CardInput;description:string}):Promise<ChargeResult>;
 /** 3-D Secure / bank verification completion. */
 completeAction(input:{processorRef:string;amountCents:number;approve:boolean}):Promise<{status:'pending'|'failed';failureCode?:string}>;
 /** SINPE Móvil: the payer gives the bank confirmation number; the processor confirms it was received.
  *  `processorRef` is the reference the SERVER generated and stored with the attempt (never the browser's id);
  *  amount and currency are the attempt's and must match what the processor reports. */
 confirmSinpe(input:{processorRef:string;amountCents:number;currency:'CRC';reference:string;code:string}):Promise<ChargeResult>;
 refund(input:{processorRef:string;amountCents:number}):Promise<{ok:boolean;message:string}>;
 /** Events the processor will deliver to our webhook for what just happened (mock: emitted locally). */
 drainEvents():SignedEvent[];
}
export const luhn=(digits:string)=>{let sum=0,flip=false;for(let i=digits.length-1;i>=0;i--){let d=Number(digits[i]);if(flip){d*=2;if(d>9)d-=9;}sum+=d;flip=!flip;}return digits.length>=13&&sum%10===0;};
export const cardBrand=(digits:string)=>/^4/.test(digits)?'Visa':/^(5[1-5]|2[2-7])/.test(digits)?'Mastercard':/^3[47]/.test(digits)?'Amex':'Tarjeta';
