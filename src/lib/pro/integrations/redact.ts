/**
 * Round 6A: redaction for the outbound request log and the webhook inbox. Anything that looks like a
 * credential, a card number, a PIN, a signature or a large blob (XML/base64/PEM) is replaced BEFORE it
 * reaches the database; SQL (pro_integration_config_safe) rejects what slips through.
 */
export const REDACTED='[redactado]';
const SECRET_KEY=/(secret|passw|pass$|token|authori|api.?key|^key$|_key$|pin$|^pin|p12|pfx|private|cvc|cvv|card.?number|^pan$|cookie|credential)/i;
export const isSecretKey=(key:string)=>SECRET_KEY.test(key);
/** Masks 13–19 digit runs (card numbers) to their last four digits. 20+ digit runs (claves, consecutivos) stay. */
export function maskCardNumbers(text:string){return text.replace(/(?<![0-9])[0-9]{13,19}(?![0-9])/g,digits=>'••••'+digits.slice(-4));}
export function redact(value:unknown,depth=0):unknown{
 if(depth>6)return REDACTED;
 if(typeof value==='string'){
  if(/-----BEGIN/.test(value)||/[A-Za-z0-9+/=]{400,}/.test(value))return `[contenido omitido: ${value.length} caracteres]`;
  if(value.trimStart().startsWith('<')&&value.length>200)return `[XML omitido: ${value.length} caracteres]`;
  return maskCardNumbers(value).slice(0,500);
 }
 if(Array.isArray(value))return value.slice(0,20).map(item=>redact(item,depth+1));
 if(value&&typeof value==='object'){
  const out:Record<string,unknown>={};
  for(const [key,item] of Object.entries(value).slice(0,40))out[key]=isSecretKey(key)?REDACTED:redact(item,depth+1);
  return out;
 }
 return value;
}
/** Host + path only: query strings can carry keys (Tilopay puts the API key in some paths: masked too). */
export function redactTarget(url:string){
 try{const parsed=new URL(url);return (parsed.host+parsed.pathname).replace(/\/[A-Za-z0-9_-]{24,}(?=\/|$)/g,'/'+REDACTED).slice(0,200);}catch{return url.split('?')[0]!.slice(0,200);}
}
