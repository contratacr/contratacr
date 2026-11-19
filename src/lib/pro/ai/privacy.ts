/**
 * Round 6C: personal data handling around AI calls.
 * · redactPersonal(): masks e-mails, phone numbers, Costa Rican ID numbers, card numbers, IBAN/accounts and the
 *   names the caller knows (customer, owner) BEFORE anything reaches the request log. Logs never get prompts,
 *   documents, transcripts or outputs — only counts — and these strings are masked as a second barrier.
 * · untrusted(): every piece of user/third-party content goes to the model inside a delimited block that
 *   cannot be closed from inside (prompt-injection-safe framing: document content is data, never instructions).
 */
export const PERSONAL_MASK={email:'[correo]',phone:'[teléfono]',id:'[identificación]',card:'[tarjeta]',account:'[cuenta]',name:'[nombre]'};
export function redactPersonal(text:string,names:string[]=[]):string{
 let out=text
  .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,PERSONAL_MASK.email)
  .replace(/\bCR\d{2}[0-9 ]{16,24}\b/gi,PERSONAL_MASK.account)
  .replace(/(?<![0-9])(?:\d[ -]?){13,19}(?![0-9])/g,match=>match.replace(/\D/g,'').length>=13?PERSONAL_MASK.card:match)
  .replace(/(?<![0-9])[1-9]-?\d{4}-?\d{4}(?![0-9])/g,PERSONAL_MASK.id)
  .replace(/(?<![0-9])\d{10,12}(?![0-9])/g,PERSONAL_MASK.id)
  .replace(/(?:\+?506[ -]?)?(?<![0-9])[2-8]\d{3}[ -]?\d{4}(?![0-9])/g,PERSONAL_MASK.phone)
  .replace(/\+\d{1,3}[ -]?\d{2,4}[ -]?\d{3,4}[ -]?\d{3,4}/g,PERSONAL_MASK.phone);
 for(const name of names.map(value=>value.trim()).filter(value=>value.length>=3).sort((a,b)=>b.length-a.length)){
  out=out.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),PERSONAL_MASK.name);
 }
 return out;
}
/** Recursively masks every string of a log summary. */
export function redactSummary(value:unknown,names:string[]=[],depth=0):unknown{
 if(depth>5)return '[…]';
 if(typeof value==='string')return redactPersonal(value,names).slice(0,300);
 if(Array.isArray(value))return value.slice(0,20).map(item=>redactSummary(item,names,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,30).map(([key,item])=>[key,redactSummary(item,names,depth+1)]));
 return value;
}
/** Delimited, unclosable block for untrusted content. Tag-like sequences inside are neutralised. */
export function untrusted(label:string,text:string){
 const safe=text.replace(/<\s*\/?\s*untrusted_document/gi,'‹untrusted_document').replace(/\u0000/g,'');
 return `<untrusted_document source="${label.replace(/[^a-z0-9_ -]/gi,'')}">\n${safe}\n</untrusted_document>`;
}
