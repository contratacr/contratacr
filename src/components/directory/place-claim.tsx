'use client';
import {rutaConIdioma} from '@/lib/prefijo-de-idioma';
import {useRef,useState,useSyncExternalStore} from 'react';
import {ClaimReviewed} from './place-claim-reviewed';
import {claimBenefits} from '@/lib/directory/place-verticals';

/**
 * LOCAL PRO ONLY (multivertical F3; e-mail first since the owner decision of 2026-11-17): «¿Es su negocio? Reclámelo
 * gratis» on /negocios/<slug> (only while unclaimed). Choices, in this order:
 *  1. email_listed: a one-time code to the e-mail ALREADY on the place, shown masked (the claimant never types it);
 *  2. email_domain: a code to an address on the business website's domain (free mailboxes refused);
 *  3. staff review: cédula jurídica (Hacienda lookup) or documents (<ClaimReviewed/>, admin queue).
 *  phone_listed (SMS) appears only when DIR_CLAIM_SMS_ENABLED and the database switch are on (off by default).
 * Claiming is free and never changes the order of results. E-mail codes are never shown on screen: in local
 * development the mock sender keeps them in a test mailbox (link below the code field); nothing is sent for real.
 */
export type ClaimChoices={emailListed:string|null;websiteHost:string|null;sms:boolean};
type Method='email_listed'|'email_domain'|'phone_listed';
type Step={kind:'idle'}|{kind:'code';claimId:string;method:Method;masked:string;devCode?:string;testMailbox?:string}|{kind:'done'};
const REASONS:Record<string,[string,string]>={
 login:['Inicie sesión para reclamar este negocio.','Please sign in to claim this business.'],
 claim_email_unavailable:['El correo de esta ficha no se puede usar en este momento. Use otra forma de reclamar (abajo).','The e-mail on this listing cannot be used right now. Use another way to claim (below).'],
 claim_domain_mismatch:['El correo debe ser del dominio del sitio web del negocio (no se aceptan Gmail, Hotmail u otros gratuitos).','The e-mail must be on the business website domain (Gmail, Hotmail and other free mailboxes are not accepted).'],
 email_invalid:['Escriba un correo válido del dominio del sitio web.','Enter a valid e-mail on the website domain.'],
 claim_sms_disabled:['Reclamar por mensaje de texto no está disponible. Use el correo o los documentos.','Claiming by text message is not available. Use e-mail or documents.'],
 claim_phone_unavailable:['Este negocio no tiene un teléfono verificable. Reclámelo con cédula jurídica o con documentos (abajo).','This business has no verifiable phone. Claim it with a corporate ID or with documents (below).'],
 claim_pending:['Ya hay un reclamo en curso para este negocio.','A claim for this business is already in progress.'],
 place_already_claimed:['Este negocio ya tiene responsable.','This business already has a manager.'],
 claim_cap:['Alcanzó el máximo de reclamos por hoy. Intente mañana.','You reached the daily limit of claims. Please try tomorrow.'],
 claim_send_cap:['Ya se enviaron todos los códigos permitidos para este reclamo.','All allowed codes for this claim were already sent.'],
 claim_code_cooldown:['Espere un minuto antes de pedir otro código.','Please wait a minute before asking for another code.'],
 code_format:['Escriba los 6 dígitos del código.','Please type the 6 digits of the code.'],
 wrong_code:['El código no coincide.','The code does not match.'],
 unavailable:['No disponible en este momento. Intente de nuevo.','Not available right now. Please try again.'],
};
// Benefits depend on the section (2026-11-17): menu only for restaurants/cafés, product prices only where people compare
// products, nothing price-related for banks, health, lodging, tours… (place-verticals.ts claimBenefits).
const noSubscribe=()=>()=>{};
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
const button=`inline-flex min-h-11 items-center justify-center rounded-full bg-[#009FD9] px-5 text-[13px] font-bold text-white hover:bg-[#0089bb] disabled:opacity-60 ${ring}`;
const secondary=`inline-flex min-h-11 items-center justify-center rounded-full border border-[#d7e1ea] px-5 text-[13px] font-bold hover:border-[#b9c8d6] disabled:opacity-60 ${ring}`;
const field='min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-[#162543]';
const card='space-y-2 rounded-xl border border-slate-200 bg-white p-3';

export function PlaceClaim({slug,locale,loginHref,choices={emailListed:null,websiteHost:null,sms:false},vertical,proEnabled=false}:{slug:string;locale:string;loginHref:string|null;choices?:ClaimChoices;vertical:string;proEnabled?:boolean}){
 const en=locale==='en',t=(es:string,english:string)=>en?english:es,msg=(r:string)=>(REASONS[r]??REASONS.unavailable)![en?1:0];
 const [step,setStep]=useState<Step>({kind:'idle'}),[error,setError]=useState<string|null>(null),[busy,setBusy]=useState(false);
 // One claim id per method attempt, created on first use in the browser and kept across retries of that method.
 const ids=useRef<Partial<Record<Method,{claimId:string;openAction:string}>>>({}),codeRef=useRef<HTMLInputElement>(null),emailRef=useRef<HTMLInputElement>(null);
 // data-ready marks the block as interactive (true only after hydration).
 const ready=useSyncExternalStore(noSubscribe,()=>true,()=>false);
 const hasCode=!!choices.emailListed||!!choices.websiteHost||choices.sms;
 const post=async(url:string,body:unknown)=>{const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json','accept-language':en?'en':'es'},body:JSON.stringify(body)});return {status:r.status,data:await r.json().catch(()=>({})) as Record<string,unknown>};};
 const sendCode=async(claimId:string,method:Method)=>{
  const s=await post(`/api/reclamos/${claimId}/codigo`,{actionId:crypto.randomUUID()});
  if(s.status!==200){setError(msg(String(s.data.reason??'unavailable')));return;}
  setStep({kind:'code',claimId,method,masked:String(s.data.destinationMasked??''),devCode:s.data.devCode as string|undefined,testMailbox:s.data.testMailbox as string|undefined});
 };
 const start=async(method:Method,extra:Record<string,unknown>={})=>{
  setBusy(true);setError(null);
  const current=ids.current[method]??(ids.current[method]={claimId:crypto.randomUUID(),openAction:crypto.randomUUID()});
  try{
   const o=await post(`/api/lugar/${encodeURIComponent(slug)}/reclamo`,{actionId:current.openAction,claimId:current.claimId,method,...extra});
   if(o.status!==200){
    // A refused opening can be retried with other data (e.g. another e-mail): new ids for the next attempt.
    if(o.status===400)delete ids.current[method];
    setError(msg(String(o.data.reason??'unavailable')));return;
   }
   await sendCode(current.claimId,method);
  }catch{setError(msg('unavailable'));}finally{setBusy(false);}
 };
 const verify=async(claimId:string)=>{
  setBusy(true);setError(null);
  try{
   const v=await post(`/api/reclamos/${claimId}/verificar`,{actionId:crypto.randomUUID(),code:codeRef.current?.value??''});
   if(v.status!==200){setError(msg(String(v.data.reason??'unavailable')));return;}
   if(v.data.verified===true){setStep({kind:'done'});return;}
   setError(`${msg('wrong_code')} ${t('Intentos restantes: ','Attempts left: ')}${String(v.data.attemptsLeft??0)}`);
  }catch{setError(msg('unavailable'));}finally{setBusy(false);}
 };
 const resend=async(claimId:string,method:Method)=>{setBusy(true);setError(null);try{await sendCode(claimId,method);}catch{setError(msg('unavailable'));}finally{setBusy(false);}};
 return <section aria-labelledby="place-claim" data-place-claim={step.kind} data-ready={ready||undefined} className="space-y-4 rounded-2xl border border-[#e5e7eb] shadow-sm bg-[#F7FAFC] p-5 text-[#162543]">
  <h2 id="place-claim" className="text-lg font-bold">{t('¿Es su negocio? Reclámelo gratis','Is this your business? Claim it for free')}</h2>
  {step.kind==='done'
   ?<div role="status" data-place-claim-done className="space-y-3"><p>{t('Listo: usted ya administra esta ficha. Desde "Mi negocio" puede actualizar sus datos, horario y más, gratis.','Done: you now manage this listing. From "My business" you can update your details, hours and more, for free.')}</p>
    <a data-place-claim-manage href={rutaConIdioma(locale,'/dashboard/negocio')} className={button}>{t('Abrir Mi negocio','Open My business')}</a></div>
   :<>
    {step.kind==='idle'&&<div className="space-y-2 rounded-xl border border-[#cfe3ee] bg-white p-4" data-claim-benefits>
     <h3 className="font-semibold">{t('¿Qué gana al reclamar su negocio?','What do you get by claiming your business?')}</h3>
     <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{claimBenefits(vertical,proEnabled).map(([es,english])=><li key={es}>{t(es,english)}</li>)}</ul>
    </div>}
    <p className="text-sm text-slate-700">{t('Reclamar y verificar su negocio es gratis.','Claiming and verifying your business is free.')}</p>
    {loginHref?<a className={button} href={loginHref}>{t('Inicie sesión para reclamar','Sign in to claim')}</a>
     :step.kind==='code'
      ?<form className="space-y-3" onSubmit={e=>{e.preventDefault();void verify(step.claimId);}}>
        <p data-claim-sent-to={step.masked}>{step.method==='phone_listed'?t('Enviamos un código al teléfono ','We sent a code to the phone '):t('Enviamos un código al correo ','We sent a code to the e-mail ')}<span className="font-semibold">{step.masked}</span>.
         {step.method!=='phone_listed'&&<> {t('Revise también la carpeta de correo no deseado. El código vence en 10 minutos.','Please also check the spam folder. The code expires in 10 minutes.')}</>}</p>
        {step.devCode&&<p className="rounded-xl border border-dashed border-slate-400 p-2 text-sm" data-claim-dev-code={step.devCode}>{t('Prueba local (sin envío real): el código es ','Local test (nothing is sent): the code is ')}<span className="font-mono">{step.devCode}</span></p>}
        {step.testMailbox&&<p className="rounded-xl border border-dashed border-slate-400 p-2 text-sm" data-claim-test-mailbox>{t('Prueba local: no se envía ningún correo real. ','Local test: no real e-mail is sent. ')}
         <a className={`font-semibold underline ${ring}`} href={step.testMailbox} target="_blank" rel="noreferrer">{t('Abrir el buzón de prueba','Open the test mailbox')}</a></p>}
        <label className="flex flex-col gap-1 text-sm font-medium">{t('Código de 6 dígitos','6-digit code')}
         <input ref={codeRef} name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={field}/></label>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className={button}>{t('Confirmar código','Confirm code')}</button>
         <button type="button" disabled={busy} onClick={()=>void resend(step.claimId,step.method)} className={secondary}>{t('Enviar otro código','Send another code')}</button></div>
       </form>
      :hasCode&&<ol className="space-y-3" data-claim-choices>
        {choices.emailListed&&<li className={card} data-claim-method="email_listed">
         <h3 className="font-semibold">{t('Código al correo de esta ficha','Code to the e-mail on this listing')}</h3>
         <p className="text-sm text-slate-700">{t('Le enviaremos un código a ','We will send a code to ')}<span className="font-semibold" data-claim-email-masked>{choices.emailListed}</span>{t(', el correo que aparece registrado para este negocio.',', the e-mail on record for this business.')}</p>
         <button type="button" disabled={busy} onClick={()=>void start('email_listed')} className={button}>{t('Enviar código al correo','Send code to the e-mail')}</button>
        </li>}
        {choices.websiteHost&&<li className={card} data-claim-method="email_domain">
         <h3 className="font-semibold">{t('Con un correo del sitio web del negocio','With an e-mail on the business website')}</h3>
         <form className="space-y-2" onSubmit={e=>{e.preventDefault();void start('email_domain',{email:emailRef.current?.value??''});}}>
          <label className="flex flex-col gap-1 text-sm font-medium">{t(`Su correo en ${choices.websiteHost}`,`Your e-mail on ${choices.websiteHost}`)}
           <input ref={emailRef} name="email" type="email" required autoComplete="email" maxLength={254} placeholder={`${t('nombre','name')}@${choices.websiteHost}`} className={field}/></label>
          <p className="text-xs text-slate-600">{t('No se aceptan correos gratuitos (Gmail, Hotmail y similares).','Free mailboxes (Gmail, Hotmail and similar) are not accepted.')}</p>
          <button type="submit" disabled={busy} className={choices.emailListed?secondary:button}>{t('Enviar código a este correo','Send code to this e-mail')}</button>
         </form>
        </li>}
        {choices.sms&&<li className={card} data-claim-method="phone_listed">
         <h3 className="font-semibold">{t('Código al teléfono de esta ficha','Code to the phone on this listing')}</h3>
         <button type="button" disabled={busy} onClick={()=>void start('phone_listed')} className={secondary}>{t('Recibir un código por mensaje','Get a code by text message')}</button>
        </li>}
       </ol>}
   </>}
  {error&&<p role="alert" className="text-sm font-semibold text-red-800" data-place-claim-error>{error}</p>}
  {!loginHref&&step.kind==='idle'&&<ClaimReviewed slug={slug} locale={locale} afterCode={hasCode}/>}
 </section>;
}
