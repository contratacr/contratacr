import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {ProBodyError,proBoundedForm,proSameOrigin} from '@/lib/pro/route-common';
import {EsignError,esignRpc,mockSignerAction,signerTokenHash} from '@/lib/pro/integrations/esign/service';
import {moneyText} from '@/lib/pro/integrations/esign/document';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: signer page of the MOCK signature provider (development only; plays the role of the DocuSign
// signing ceremony). Opening it records «viewed»; the form records «signed» (typed name + consent) or
// «declined» (reason). Every action becomes an HMAC-signed provider event that goes through the same webhook
// inbox as a real one. Only mock-mode requests are reachable, by the hash of the link token.
const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Type':'text/html; charset=utf-8'};
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
type View={envelopeId:string;status:string;label:string;documentHash:string;signerName:string;language:'es'|'en';expiresAt:string;title:string;totalCents:number|null;currency:string;kind:string};
const tokenOk=(token:string|null):token is string=>!!token&&/^[A-Za-z0-9_-]{20,100}$/.test(token);
function page(view:View|null,token:string,notice:string|null,en:boolean){
 const t=(es:string,english:string)=>en?english:es;
 const label:Record<string,string>=en?{sent:'Waiting for your signature',viewed:'Waiting for your signature',signed:'Signed',declined:'Declined',expired:'Expired',cancelled:'Cancelled by the sender'}:{sent:'Pendiente de su firma',viewed:'Pendiente de su firma',signed:'Firmado',declined:'Rechazado',expired:'Vencido',cancelled:'Anulado por quien lo envió'};
 const open=view&&(view.status==='sent'||view.status==='viewed');
 return `<!doctype html><html lang="${en?'en':'es'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${t('Firma electrónica','Electronic signature')}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f3f6f9;color:#162543}main{max-width:620px;margin:16px auto;background:#fff;border:1px solid #d7e1ea;border-radius:16px;padding:16px 20px}
.w{background:#fff6e0;border-radius:12px;padding:10px;font-size:14px}label{display:block;font-weight:700;margin-top:12px}input[type=text],textarea{display:block;width:100%;box-sizing:border-box;min-height:44px;border:1px solid #d7e1ea;border-radius:12px;padding:8px 12px;font:inherit;font-weight:400}
button{min-height:44px;border-radius:999px;border:0;padding:0 20px;font:inherit;font-weight:700;margin-top:12px;cursor:pointer}.y{background:#008bb5;color:#fff}.n{background:#fff;border:1px solid #d7e1ea;color:#8a2a1b}code{word-break:break-all;font-size:12px}
.c{display:flex;gap:8px;align-items:flex-start;font-weight:400}.c input{width:22px;height:22px;flex:none;margin-top:2px}</style></head><body><main data-mock-signer data-mock-signer-status="${esc(view?.status??'missing')}">
<p class="w">${t('SIMULACIÓN LOCAL del proveedor de firma: no tiene validez legal y no se envía nada a terceros.','LOCAL SIMULATION of the signature provider: no legal value and nothing is sent to third parties.')}</p>
${notice?`<p role="status" data-mock-signer-notice>${esc(notice)}</p>`:''}
${view?`<h1 style="font-size:20px">${esc(view.label)}</h1><p>${t('Para','For')}: <strong>${esc(view.signerName)}</strong>${view.totalCents==null?'':` · ${t('Total','Total')}: ${esc(moneyText(view.totalCents,view.currency))}`}</p>
<p>${t('Estado','Status')}: <strong data-mock-signer-state>${esc(label[view.status]??view.status)}</strong></p><p>${t('Huella del documento','Document fingerprint')}: <code>${esc(view.documentHash)}</code></p>
${open?`<form method="post" data-mock-sign-form><input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="action" value="sign">
<label>${t('Escriba su nombre completo para firmar','Type your full name to sign')}<input type="text" name="typedName" required minlength="2" maxlength="160" data-mock-sign-name autocomplete="name"></label>
<label class="c"><input type="checkbox" name="consent" value="yes" required data-mock-sign-consent>${t('Acepto firmar electrónicamente este documento y que mi nombre escrito tenga el efecto de mi firma.','I agree to sign this document electronically and that my typed name has the effect of my signature.')}</label>
<button class="y" type="submit" data-mock-sign-submit>${t('Firmar','Sign')}</button></form>
<form method="post" data-mock-decline-form><input type="hidden" name="t" value="${esc(token)}"><input type="hidden" name="action" value="decline">
<label>${t('Motivo para rechazar','Reason to decline')}<textarea name="reason" required minlength="3" maxlength="500" data-mock-decline-reason></textarea></label><button class="n" type="submit" data-mock-decline-submit>${t('Rechazar','Decline')}</button></form>`:''}`
 :`<p data-mock-signer-missing>${t('Este enlace de firma no es válido.','This signing link is not valid.')}</p>`}</main></body></html>`;
}
async function view(token:string){return esignRpc<View|null>(createAdminClient(),'pro_esign_signer_view',{p_token_hash:signerTokenHash(token)});}
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'esign-mock-sign',120,60000);if(limited)return limited;
 const token=new URL(req.url).searchParams.get('t');
 if(!tokenOk(token))return new Response(page(null,'',null,false),{status:404,headers});
 try{
  let current=await view(token);if(!current)return new Response(page(null,'',null,false),{status:404,headers});
  if(current.status==='sent'){await mockSignerAction(createAdminClient(),token,'view',{});current=await view(token);}
  return new Response(page(current,token,null,current?.language==='en'),{headers});
 }catch{return new Response(page(null,'','No disponible',false),{status:503,headers});}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return new Response('Origen no autorizado',{status:403,headers});
 const limited=await enforceRateLimit(req,'esign-mock-sign-post',30,60000);if(limited)return limited;
 try{
  // Post-security fixes: the signer form is tiny; the body is read with a streamed 8 KB cap, no files, known fields only.
  let form:FormData;
  try{form=await proBoundedForm(req,{maxBytes:8192,maxFiles:0,fields:['t','action','typedName','consent','reason'],types:['application/x-www-form-urlencoded','multipart/form-data']});}
  catch(error){return new Response(page(null,'',null,false),{status:error instanceof ProBodyError?error.status:400,headers});}
  const token=String(form.get('t')??''),action=String(form.get('action')??'');
  if(!tokenOk(token)||(action!=='sign'&&action!=='decline'))return new Response(page(null,'',null,false),{status:400,headers});
  const before=await view(token);if(!before)return new Response(page(null,'',null,false),{status:404,headers});
  const en=before.language==='en',typedName=String(form.get('typedName')??'').trim().slice(0,160),reason=String(form.get('reason')??'').trim().slice(0,500);
  if(action==='sign'&&(typedName.length<2||form.get('consent')!=='yes'))return new Response(page(before,token,en?'Type your name and accept to sign.':'Escriba su nombre y acepte para firmar.',en),{status:400,headers});
  if(action==='decline'&&reason.length<3)return new Response(page(before,token,en?'Tell the sender why.':'Indique el motivo.',en),{status:400,headers});
  const outcome=await mockSignerAction(createAdminClient(),token,action,{typedName,reason});
  const after=await view(token);
  const notice=outcome.status!==200?(en?'Could not record it. Retry.':'No se pudo registrar. Reintente.'):action==='sign'?(en?'Signed. The sender received the signed PDF and the audit certificate.':'Firmado. Quien lo envió recibió el PDF firmado y el certificado de auditoría.'):(en?'Declined. The sender was notified.':'Rechazado. Se avisó a quien lo envió.');
  return new Response(page(after,token,notice,en),{status:outcome.status===200?200:503,headers});
 }catch(error){return new Response(page(null,'',error instanceof EsignError?error.message:'No disponible',false),{status:503,headers});}
}
