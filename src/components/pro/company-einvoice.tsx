'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {proMoney} from '@/lib/pro/money';
import {ID_TYPE_LABELS,STATUS_LABELS} from '@/lib/pro/integrations/hacienda/codes';
import {einvoiceReceiverReadSchema,type EinvoiceReceiverMessage} from '@/lib/pro/integrations/hacienda/api';
import {EmisorSettingsForm} from './company-integrations';
import {EINVOICE_COPY,EINVOICE_ERRORS,EINVOICE_PROVIDER_LABELS,EINVOICE_SETTINGS_COPY as S} from './einvoice-copy';

/**
 * Ronda F2-A: Empresa › Facturación electrónica. Provider and mode (mode read-only: Prueba while the server has no real
 * provider configured), emisor data with branch/terminal/activity (the same form as Integraciones), and the answers to
 * documents RECEIVED from suppliers (MensajeReceptor: aceptar, aceptar parcialmente, rechazar) through the same adapter.
 */
type Copy={es:string;en:string};
type Read=ReturnType<typeof einvoiceReceiverReadSchema.parse>;
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5';
const field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const badge:Record<string,string>={aceptado:'bg-[#e7f5ec] text-[#1d5b33]',rechazado:'bg-[#fdeceb] text-[#8a2a1b]',error:'bg-[#fff6e0] text-[#7a4b00]'};
const blank={receivedClave:'',emisorIdType:'02',emisorId:'',emisorName:'',receivedIssuedOn:'',total:'',tax:'',messageCode:'1' as '1'|'2'|'3',detail:'',creditTax:''};
const colonesToCents=(value:string)=>{const v=value.trim().replace(/\s/g,'');if(!/^\d{1,11}([.,]\d{1,2})?$/.test(v))return null;return Math.round(Number(v.replace(',','.'))*100);};
export function CompanyEinvoice(){
 const en=useLocale()==='en',l=useCallback((copy:Copy)=>en?copy.en:copy.es,[en]);
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[form,setForm]=useState(blank),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const seq=useRef(0),attempt=useRef<{key:string;id:string}|null>(null);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);
  try{const response=await fetch('/api/pro/invoice-einvoice?view=received',{cache:'no-store'});if(!response.ok)throw Error();const body=einvoiceReceiverReadSchema.parse(await response.json());if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 const when=(at:string)=>new Date(at).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'medium',timeStyle:'short'});
 async function post(key:string,payload:Record<string,unknown>,done:Copy){
  if(attempt.current?.key!==key)attempt.current={key,id:crypto.randomUUID()};
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch('/api/pro/invoice-einvoice',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,actionId:attempt.current.id})});
   const body=await response.json().catch(()=>({}));
   if(!response.ok){if(response.status!==503)attempt.current=null;const issues=Array.isArray(body.issues)&&body.issues.length?' '+body.issues.map((row:{es:string;en:string})=>en?row.en:row.es).join(' '):'';const known=EINVOICE_ERRORS[body.reason as string];setError((known?l(known):body.error??l(EINVOICE_COPY.failed))+issues);return false;}
   attempt.current=null;setNotice(l(done));return true;
  }catch{setError(l(EINVOICE_COPY.unconfirmed));return false;}
  finally{setBusy(false);await load();}
 }
 async function submit(event:FormEvent){
  event.preventDefault();
  const total=colonesToCents(form.total),tax=colonesToCents(form.tax),credit=form.messageCode==='2'?colonesToCents(form.creditTax):null;
  if(total===null||tax===null||form.messageCode==='2'&&credit===null||!form.receivedIssuedOn){setError(l(EINVOICE_ERRORS.validation!));return;}
  const ok=await post('receiver:'+form.receivedClave+':'+form.messageCode,{action:'receiver_message',receivedClave:form.receivedClave.trim(),emisorIdType:form.emisorIdType,emisorId:form.emisorId.trim(),emisorName:form.emisorName.trim(),
   receivedIssuedAt:form.receivedIssuedOn+'T12:00:00-06:00',receivedTotalCents:total,receivedTaxCents:tax,messageCode:form.messageCode,detail:form.messageCode==='1'?'':form.detail.trim(),
   taxCondition:form.messageCode==='3'?'':form.messageCode==='2'?'02':'01',creditTaxCents:form.messageCode==='3'?null:form.messageCode==='2'?credit:tax,expenseCents:form.messageCode==='3'?null:total},S.sent);
  if(ok)setForm(blank);
 }
 const p=data?.pipeline,modeTest=!p||p.test;
 const set=(key:keyof typeof blank,value:string)=>{setForm(old=>({...old,[key]:value}));setError('');};
 function messageRow(m:EinvoiceReceiverMessage){
  const canPoll=['borrador','firmado','enviado','recibido','procesando','error'].includes(m.status);
  return <li key={m.id} data-einvoice-received-row={m.consecutivo} className="min-w-0 space-y-2 rounded-xl border border-[#d7e1ea] p-3">
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold">{m.emisorName}</p><p className="text-sm text-[#52627a]">{l(m.messageCode==='1'?S.accept:m.messageCode==='2'?S.partial:S.reject)} · {proMoney(m.receivedTotalCents/100,en)}</p></div>
    <span data-einvoice-received-status={m.status} className={'rounded-lg px-2 py-0.5 text-xs font-bold '+(badge[m.status]??'bg-[#eaf7fb] text-[#00668a]')}>{l(STATUS_LABELS[m.status]!)}</span></div>
   <dl className="grid min-w-0 gap-1 text-xs"><div className="min-w-0"><dt className="font-bold text-[#52627a]">{l(EINVOICE_COPY.clave)}</dt><dd className="break-all font-mono">{m.receivedClave}</dd></div>
    <div className="min-w-0"><dt className="font-bold text-[#52627a]">{l(EINVOICE_COPY.consecutivo)}</dt><dd className="break-all font-mono">{m.consecutivo}</dd></div></dl>
   {m.responseMessage&&<p className="text-sm text-[#52627a]">{m.responseMessage}</p>}
   <p className="text-xs text-[#52627a]">{m.events.map(event=>l(STATUS_LABELS[event.to]??{es:event.to,en:event.to})).join(' → ')} · {when(m.updatedAt)}</p>
   <div className="flex flex-wrap gap-2">{canPoll&&<Button type="button" variant="secondary" data-einvoice-received-poll disabled={busy} onClick={()=>void post('rpoll:'+m.id+':'+m.updatedAt,{action:'receiver_poll',messageId:m.id},EINVOICE_COPY.statusUpdated)}>{l(S.check)}</Button>}
    {m.hasXml&&<a className="inline-flex min-h-11 items-center rounded-xl border border-[#d7e1ea] px-3 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb]" href={'/api/pro/einvoice-file?'+new URLSearchParams({id:m.id,kind:'receiver_xml'})}>{l(EINVOICE_COPY.downloadXml)}</a>}</div>
  </li>;
 }
 return <div data-company-einvoice className="min-w-0 space-y-4">
  <section data-einvoice-settings-status className={card} aria-labelledby="einvoice-status"><h3 id="einvoice-status" className="font-bold">{l(S.statusTitle)}</h3>
   <p className="text-sm text-[#52627a]">{l(S.statusHelp)}</p>
   {failed&&!data?<Button type="button" variant="secondary" onClick={()=>void load()}>{l(EINVOICE_COPY.retry)}</Button>:!data?<p role="status" className="text-sm">{l(EINVOICE_COPY.loading)}</p>:<>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
     <div className="min-w-0 rounded-xl bg-[#fff6e0] p-3 text-[#7a4b00]"><p className="text-xs font-bold uppercase tracking-wide">{l(S.mode)}</p><p data-einvoice-settings-mode={modeTest?'test':'live'} className="text-lg font-bold">{modeTest?l(S.modeTest):l(EINVOICE_COPY.modeLive)}</p><p className="text-xs">{l(S.modeHelp)}</p></div>
     <div className="min-w-0 rounded-xl bg-[#f3f8fb] p-3"><p className="text-xs font-bold uppercase tracking-wide text-[#52627a]">{l(S.provider)}</p>
      <ul className="space-y-1 text-sm">{(['mock','hacienda-sandbox','gti'] as const).map(id=><li key={id} data-einvoice-provider-option={id} className="flex min-w-0 flex-wrap items-center justify-between gap-1"><span className="min-w-0 font-semibold">{l(EINVOICE_PROVIDER_LABELS[id])}</span>
       <span className="text-xs text-[#52627a]">{(modeTest?'mock':p!.provider)===id?l(S.providerActive):id==='gti'?l(S.providerContract):l(S.providerNeeds)}</span></li>)}</ul></div>
    </div>
    <p data-einvoice-server-env={p!.env.status} className="text-xs text-[#52627a]">{l(S.serverEnv)}: {p!.env.status==='ready'?l(S.envReady):p!.env.missing.length?l(S.envMissing)+' '+p!.env.missing.join(', '):l(S.modeTest)}</p>
    <p className="text-xs text-[#52627a]">{l(S.sequence)}</p>
   </>}
  </section>
  <EmisorSettingsForm withProvider onSaved={()=>void load()}/>
  <section data-einvoice-received className={card} aria-labelledby="einvoice-received"><h3 id="einvoice-received" className="font-bold">{l(S.received)}</h3>
   <p className="text-sm text-[#52627a]">{l(S.receivedHelp)}</p>
   {data&&!data.settingsReady?<p className="text-sm text-[#7a4b00]">{l(S.needsSettings)}</p>:<form data-einvoice-received-form onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="block min-w-0 text-sm font-bold sm:col-span-2">{l(S.clave)}<input data-received-field="receivedClave" required inputMode="numeric" maxLength={50} value={form.receivedClave} onChange={event=>set('receivedClave',event.target.value)} className={field+' font-mono'}/></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.emisorIdType)}<select data-received-field="emisorIdType" value={form.emisorIdType} onChange={event=>set('emisorIdType',event.target.value)} className={field}>{['01','02','03','04'].map(code=><option key={code} value={code}>{l(ID_TYPE_LABELS[code]!)}</option>)}</select></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.emisorId)}<input data-received-field="emisorId" required inputMode="numeric" maxLength={12} value={form.emisorId} onChange={event=>set('emisorId',event.target.value)} className={field}/></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.emisorName)}<input data-received-field="emisorName" required maxLength={100} value={form.emisorName} onChange={event=>set('emisorName',event.target.value)} className={field}/></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.issuedOn)}<input data-received-field="receivedIssuedOn" type="date" required value={form.receivedIssuedOn} onChange={event=>set('receivedIssuedOn',event.target.value)} className={field}/></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.total)}<input data-received-field="total" required inputMode="decimal" value={form.total} onChange={event=>set('total',event.target.value)} className={field}/></label>
    <label className="block min-w-0 text-sm font-bold">{l(S.tax)}<input data-received-field="tax" required inputMode="decimal" value={form.tax} onChange={event=>set('tax',event.target.value)} className={field}/></label>
    <fieldset className="min-w-0 space-y-1 sm:col-span-2"><legend className="text-sm font-bold">{l(S.answer)}</legend><div className="flex flex-wrap gap-x-4">
     {([['1',S.accept],['2',S.partial],['3',S.reject]] as const).map(([code,label])=><label key={code} className="flex min-h-11 items-center gap-2 text-sm"><input type="radio" name="received-code" data-received-code={code} checked={form.messageCode===code} onChange={()=>set('messageCode',code)}/>{l(label)}</label>)}</div></fieldset>
    {form.messageCode!=='1'&&<label className="block min-w-0 text-sm font-bold sm:col-span-2">{l(S.detail)}<input data-received-field="detail" required minLength={5} maxLength={160} value={form.detail} onChange={event=>set('detail',event.target.value)} className={field}/></label>}
    {form.messageCode==='2'&&<label className="block min-w-0 text-sm font-bold">{l(S.creditTax)}<input data-received-field="creditTax" required inputMode="decimal" value={form.creditTax} onChange={event=>set('creditTax',event.target.value)} className={field}/></label>}
    <div className="space-y-2 sm:col-span-2">{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{notice&&<p role="status" data-einvoice-received-notice className="text-sm text-green-800">{notice}</p>}<Button type="submit" data-einvoice-received-send disabled={busy}>{l(S.send)}</Button></div>
   </form>}
   {data&&(data.messages.length?<ul className="space-y-2">{data.messages.map(messageRow)}</ul>:<p className="text-sm text-[#52627a]">{l(S.none)}</p>)}
  </section>
 </div>;
}
