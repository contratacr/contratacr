/**
 * Post-security fixes (2026-11-13): how a Tilopay /api/v1/consult answer is judged before we treat an order as
 * paid. Pure (no network, no secrets) so it is unit-tested. The order number we consult is ALWAYS the reference
 * the server generated and stored with the attempt (never a value chosen by the browser), and an approved order
 * only counts when its amount AND currency match the attempt; otherwise it is «amount_mismatch» (the same review
 * reason the webhook inbox uses). Field names (code, amount, currency) must be re-checked against the merchant's
 * sandbox before enabling the real adapter; a missing field never counts as a match (fail closed).
 */
export type TilopayVerdict={ok:true}|{ok:false;failureCode:'sinpe_not_found'|'amount_mismatch'|'not_approved'};
const cents=(value:unknown)=>{
 const text=typeof value==='number'?value.toFixed(2):typeof value==='string'?value.trim().replace(/,/g,''):'';
 return /^\d{1,12}(\.\d{1,2})?$/.test(text)?Math.round(Number(text)*100):null;
};
export function tilopayConsultVerdict(json:unknown,expected:{orderNumber:string;amountCents:number;currency:string},missing:'sinpe_not_found'|'not_approved'='sinpe_not_found'):TilopayVerdict{
 const response=json&&typeof json==='object'?(json as {response?:unknown}).response:null;
 const row=Array.isArray(response)&&response.length===1&&response[0]&&typeof response[0]==='object'?response[0] as Record<string,unknown>:null;
 if(!row||String(row.code??'')!=='1')return {ok:false,failureCode:missing};
 // When Tilopay echoes the order number it must be ours.
 if(row.orderNumber!==undefined&&String(row.orderNumber)!==expected.orderNumber)return {ok:false,failureCode:missing};
 if(cents(row.amount)!==expected.amountCents||String(row.currency??'').toUpperCase()!==expected.currency.toUpperCase())return {ok:false,failureCode:'amount_mismatch'};
 return {ok:true};
}
