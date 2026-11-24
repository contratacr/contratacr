'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {PRODUCTION_CONFIRMATION,type IntegrationConnection,type IntegrationMode,type IntegrationProvider,type ResolvedStatus} from '@/lib/pro/integrations/registry';
import {blankEmisor,emisorSettingsSchema,type EmisorSettings} from '@/lib/pro/integrations/hacienda/document';
import {einvoiceSettingsReadSchema} from '@/lib/pro/integrations/hacienda/api';
import {AiSettingsPanel} from './ai-assistant';

/**
 * Round 6A: Company › Integraciones. One card per provider with its mode (simulation / test / production),
 * status, the SERVER variables it needs (names and present/absent only — never values), «Probar conexión»
 * and its non-secret options; the Hacienda issuer data; the redacted request log and webhook inbox.
 */
type Copy={es:string;en:string};
type Env={name:string;present:boolean};
type Provider={id:IntegrationProvider;kind:string;name:Copy;purpose:Copy;docs:string[];connection:IntegrationConnection;resolved:{mode:IntegrationMode;status:ResolvedStatus};env:{sandbox:Env[];production:Env[];optional:Env[];productionFlag:boolean}};
type LogRow={id:string;provider:string;mode:string;operation:string;target:string;statusCode:number|null;outcome:string;durationMs:number;correlation:string|null;at:string};
type WebhookRow={id:string;provider:string;mode:string;eventId:string;eventType:string;status:string;attempts:number;lastError:string|null;receivedAt:string};
type Read={providers:Provider[];productionAllowed:boolean;requests:LogRow[];webhooks:WebhookRow[]};
const api='/api/pro/integrations',card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
const statusStyle:Record<string,string>={ready:'bg-[#e7f5ec] text-[#1d5b33]',missing_keys:'bg-[#fff6e0] text-[#7a4b00]',production_refused:'bg-[#fdeceb] text-[#8a2a1b]',disabled:'bg-[#eef2f6] text-[#38485f]'};
export function CompanyIntegrations(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),l=(copy:Copy)=>en?copy.en:copy.es,{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState<string|null>(null),[message,setMessage]=useState<{provider:string;ok:boolean;text:string}|null>(null),[error,setError]=useState('');
 const seq=useRef(0);
 const invalidate=useCallback(()=>{seq.current++;},[]);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const response=await fetch(api,{cache:'no-store'});if(!response.ok)throw Error();const body=await response.json() as Read;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 async function post(provider:string,payload:Record<string,unknown>){
  setBusy(provider+':'+String(payload.action));setError('');
  try{const response=await fetch(api,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,actionId:crypto.randomUUID()})});const body=await response.json().catch(()=>({}));
   if(!response.ok){setError(en?({production_refused:'Production is not enabled for this account. It requires administrator enablement and your explicit authorization.',production_confirm:'Type exactly ACTIVAR PRODUCCION to confirm.',secret_config:'Options cannot contain keys or secrets: they go in server environment variables.'} as Record<string,string>)[body.reason]??(response.status===409?'The integration changed. Try again.':'Could not save.'):body.error??'No se pudo guardar.');return null;}
   return body as Record<string,unknown>;
  }catch{setError(t('No se pudo comprobar el cambio. Reintente.','Could not confirm the change. Retry.'));return null;}finally{setBusy(null);await load();}
 }
 async function setMode(provider:Provider,mode:IntegrationMode){
  if(mode===provider.connection.mode)return;
  let confirmText:string|undefined;
  if(mode==='production'){
   const answer=await confirm({title:t('¿Activar producción?','Turn on production?'),description:t('Producción envía comprobantes reales a Hacienda o hace cobros reales. Requiere su autorización expresa para esta activación y la habilitación del administrador.','Production sends real documents to Hacienda or makes real charges. It requires your explicit authorization for this activation and administrator enablement.'),confirmLabel:t('Activar producción','Turn on production'),tone:'danger',input:{label:t('Escriba ACTIVAR PRODUCCION','Type ACTIVAR PRODUCCION'),defaultValue:''}});
   if(!answer.confirmed)return;confirmText=answer.value?.trim()??'';
   if(confirmText!==PRODUCTION_CONFIRMATION){setError(t('Escriba exactamente ACTIVAR PRODUCCION para confirmar.','Type exactly ACTIVAR PRODUCCION to confirm.'));return;}
  }
  await post(provider.id,{action:'set_mode',provider:provider.id,revision:provider.connection.revision,mode,...(confirmText?{confirm:confirmText}:{})});
 }
 async function test(provider:Provider){setMessage(null);const body=await post(provider.id,{action:'test',provider:provider.id});if(body)setMessage({provider:provider.id,ok:body.ok===true,text:String((en?body.messageEn:null)??body.message??'')});}
 const modeLabel=(mode:IntegrationMode)=>mode==='mock'?t('Simulación local','Local simulation'):mode==='sandbox'?t('Pruebas del proveedor','Provider test environment'):t('Producción','Production');
 const statusLabel=(status:ResolvedStatus)=>({ready:t('Listo','Ready'),missing_keys:t('Faltan claves en el servidor','Server keys missing'),production_refused:t('Producción no permitida en este servidor','Production not allowed on this server'),disabled:t('Desactivada','Disabled')})[status];
 const when=(value:string)=>new Date(value).toLocaleString(en?'en-US':'es-CR',{timeZone:'America/Costa_Rica',dateStyle:'short',timeStyle:'short'});
 if(failed&&!data)return <div role="alert" className="space-y-2 text-sm"><p>{t('No se pudieron cargar las integraciones.','Could not load integrations.')}</p><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 return <div data-company-integrations className="min-w-0 space-y-4">
  <p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Todo empieza en simulación local: se prueba el flujo completo sin enviar nada a terceros. El modo de pruebas se activa solo cuando el servidor tiene las claves; producción nunca se activa sola.','Everything starts in local simulation: the whole flow is tested without sending anything to third parties. Test mode only activates when the server has the keys; production never turns on by itself.')}</p>
  {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  {data.providers.map(provider=><section key={provider.id} data-integration={provider.id} data-integration-mode={provider.connection.mode} data-integration-status={provider.resolved.status} className={card} aria-labelledby={'integration-'+provider.id}>
   <div className="flex min-w-0 flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 id={'integration-'+provider.id} className="font-bold">{l(provider.name)}</h3><p className="text-sm text-[#52627a]">{l(provider.purpose)}</p></div>
    <span data-integration-status-badge className={'rounded-lg px-2 py-0.5 text-xs font-bold '+statusStyle[provider.resolved.status]}>{modeLabel(provider.connection.mode)} · {statusLabel(provider.resolved.status)}</span></div>
   <fieldset className="space-y-1"><legend className="text-sm font-bold">{t('Modo','Mode')}</legend>
    <div className="flex flex-wrap gap-2">{(['mock','sandbox','production'] as const).map(mode=><label key={mode} className={'flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm '+(provider.connection.mode===mode?'border-[#008bb5] bg-[#eaf7fb] font-semibold':'border-[#d7e1ea]')}><input type="radio" name={'mode-'+provider.id} data-integration-set-mode={mode} checked={provider.connection.mode===mode} disabled={busy!==null||mode==='production'&&!data.productionAllowed} onChange={()=>void setMode(provider,mode)}/>{modeLabel(mode)}</label>)}</div>
    {!data.productionAllowed&&<p className="text-xs text-[#52627a]">{t('Producción no está disponible: requiere habilitación del administrador.','Production is not available: it requires administrator enablement.')}</p>}</fieldset>
   <details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="cursor-pointer text-sm font-semibold">{t('Variables del servidor','Server variables')}</summary><div className="mt-2 space-y-2 text-xs">
    {(['sandbox','production'] as const).map(mode=><div key={mode}><p className="font-bold">{modeLabel(mode)}</p><ul className="space-y-0.5">{provider.env[mode].map(row=><li key={row.name} data-integration-env={row.name} data-present={row.present} className="flex min-w-0 flex-wrap justify-between gap-2"><code className="break-all">{row.name}</code><span className={row.present?'text-[#1d5b33]':'text-[#7a4b00]'}>{row.present?t('configurada','set'):t('no configurada','not set')}</span></li>)}</ul></div>)}
    <p className="text-[#52627a]">{t('Los valores nunca se muestran ni se guardan en la base: solo en variables de entorno del servidor. Vea la guía docs/pro/integrations-setup-guide-local.md.','Values are never shown or stored in the database: only in server environment variables. See docs/pro/integrations-setup-guide-local.md.')}</p></div></details>
   <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="secondary" data-integration-test disabled={busy!==null} onClick={()=>void test(provider)}>{busy===provider.id+':test'?t('Probando…','Testing…'):t('Probar conexión','Test connection')}</Button>
    {provider.connection.lastTestAt&&<span data-integration-last-test={provider.connection.lastTestOk?'ok':'fail'} className="text-xs text-[#52627a]">{t('Última prueba: ','Last test: ')}{when(provider.connection.lastTestAt)} · {provider.connection.lastTestOk?t('correcta','passed'):t('falló','failed')}</span>}</div>
   {message?.provider===provider.id&&<p role="status" data-integration-test-result={message.ok?'ok':'fail'} className={'text-sm '+(message.ok?'text-green-800':'text-red-700')}>{message.text}</p>}
   {provider.id==='ai'&&<AiSettingsPanel/>}
   {provider.id==='tilopay'&&<PaymentOptions provider={provider} busy={busy!==null} onSave={config=>post(provider.id,{action:'save_config',provider:provider.id,revision:provider.connection.revision,config})}/>}
  </section>)}
  <EmisorSettingsForm/>
  <section className={card} aria-labelledby="integration-log"><h3 id="integration-log" className="font-bold">{t('Registro técnico','Technical log')}</h3><p className="text-sm text-[#52627a]">{t('Últimas llamadas a proveedores (sin claves ni datos de tarjeta) y avisos recibidos.','Latest provider calls (no keys or card data) and received notifications.')}</p>
   {data.requests.length===0?<p className="text-sm text-[#52627a]">{t('Todavía no hay llamadas.','No calls yet.')}</p>:<ul data-integration-requests className="space-y-1 text-xs">{data.requests.map(row=><li key={row.id} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg bg-[#f7f9fc] px-2 py-1"><span className="min-w-0 break-all">{when(row.at)} · {row.provider} · {modeLabel(row.mode as IntegrationMode)} · {row.operation} · {row.target}</span><span className={row.outcome==='ok'?'text-[#1d5b33]':'text-[#8a2a1b]'}>{row.statusCode??'—'} · {row.outcome} · {row.durationMs} ms</span></li>)}</ul>}
   <h4 className="text-sm font-bold">{t('Avisos recibidos (webhooks)','Received notifications (webhooks)')}</h4>
   {data.webhooks.length===0?<p className="text-sm text-[#52627a]">{t('Ninguno todavía.','None yet.')}</p>:<ul data-integration-webhooks className="space-y-1 text-xs">{data.webhooks.map(row=><li key={row.id} className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg bg-[#f7f9fc] px-2 py-1"><span className="min-w-0 break-all">{when(row.receivedAt)} · {row.eventType} · {row.eventId}</span><span>{row.status}{row.attempts?` · ${row.attempts} ${t('reintentos','retries')}`:''}{row.lastError?' · '+row.lastError:''}</span></li>)}</ul>}
  </section>
  {dialogNode}
 </div>;
}
function PaymentOptions({provider,busy,onSave}:{provider:Provider;busy:boolean;onSave:(config:Record<string,unknown>)=>Promise<unknown>}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es,config=provider.connection.config as {sinpePhone?:string;linkDays?:number;cardEnabled?:boolean;sinpeEnabled?:boolean};
 const [phone,setPhone]=useState(config.sinpePhone??''),[days,setDays]=useState(config.linkDays??7);
 return <form data-integration-payment-options className="space-y-2 rounded-xl bg-[#f7f9fc] p-3" onSubmit={event=>{event.preventDefault();void onSave({cardEnabled:config.cardEnabled??true,sinpeEnabled:config.sinpeEnabled??true,sinpePhone:phone,linkDays:days});}}>
  <p className="text-sm font-bold">{t('Opciones de cobro (sin secretos)','Payment options (no secrets)')}</p>
  <label className="block text-sm font-bold">{t('Teléfono SINPE Móvil que verá el cliente','SINPE Móvil phone your customer sees')}<input data-integration-sinpe-phone inputMode="numeric" maxLength={8} value={phone} onChange={event=>setPhone(event.target.value.replace(/\D/g,''))} className={field} placeholder="88887777"/></label>
  <label className="block text-sm font-bold">{t('Días de vigencia por defecto','Default validity days')}<input type="number" min={1} max={60} value={days} onChange={event=>setDays(Math.max(1,Math.min(60,Number(event.target.value)||7)))} className={field+' w-28'}/></label>
  <Button type="submit" variant="secondary" data-integration-save-options disabled={busy||phone!==''&&!/^[2-8]\d{7}$/.test(phone)}>{t('Guardar opciones','Save options')}</Button>
 </form>;
}
const PROVINCES=[['1','San José'],['2','Alajuela'],['3','Cartago'],['4','Heredia'],['5','Guanacaste'],['6','Puntarenas'],['7','Limón']];
/** Ronda F2-A: also rendered in Empresa › Facturación electrónica, with the provider choice. */
export function EmisorSettingsForm({withProvider=false,onSaved}:{withProvider?:boolean;onSaved?:()=>void}={}){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [value,setValue]=useState<EmisorSettings>(blankEmisor()),[revision,setRevision]=useState<number|null>(null),[saved,setSaved]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 const load=useCallback(async()=>{setFailed(false);try{const response=await fetch('/api/pro/einvoice?view=settings',{cache:'no-store'});if(!response.ok)throw Error();const body=einvoiceSettingsReadSchema.parse(await response.json());setRevision(body.settingsRevision);const blank=blankEmisor(),keys=Object.keys(blank);setValue(body.settings??{...blank,...Object.fromEntries(Object.entries(body.defaults).filter(([key,v])=>keys.includes(key)&&v!==''))} as EmisorSettings);setSaved(!!body.settings);}catch{setFailed(true);}},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>clearTimeout(timer);},[load]);
 const set=(key:keyof EmisorSettings,next:string)=>{setValue(old=>({...old,[key]:next}));setSaved(false);setError('');};
 async function submit(event:FormEvent){
  event.preventDefault();const parsed=emisorSettingsSchema.safeParse(value);
  if(!parsed.success){setError(parsed.error.issues[0]?.message??t('Revise los datos.','Check the details.'));return;}
  setBusy(true);setError('');
  try{const response=await fetch('/api/pro/einvoice',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save_settings',actionId:crypto.randomUUID(),revision:revision??0,settings:parsed.data})});const body=await response.json().catch(()=>({}));
   if(!response.ok){setError(response.status===409?t('Los datos cambiaron en otra pestaña. Se recargaron.','The data changed in another tab. It was reloaded.'):body.error??t('No se pudo guardar.','Could not save.'));if(response.status===409)await load();return;}
   setRevision(body.settingsRevision);setSaved(true);onSaved?.();
  }catch{setError(t('No se pudo comprobar el guardado. Reintente.','Could not confirm the save. Retry.'));}finally{setBusy(false);}
 }
 const input=(key:keyof EmisorSettings,label:string,props:Record<string,unknown>={})=><label className="block min-w-0 text-sm font-bold">{label}<input data-emisor-field={key} value={value[key]??''} onChange={event=>set(key,event.target.value)} className={field} {...props}/></label>;
 return <section data-emisor-settings className={card} aria-labelledby="emisor-settings"><h3 id="emisor-settings" className="font-bold">{t('Datos del emisor para Hacienda','Issuer details for Hacienda')}</h3>
  <p className="text-sm text-[#52627a]">{t('Se usan en cada comprobante electrónico. Los códigos de ubicación y actividad son los del Registro Único Tributario.','Used on every electronic document. Location and activity codes are those of the tax registry (RUT).')}</p>
  {failed?<div role="alert" className="text-sm"><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>:revision===null?<p role="status" className="text-sm">{t('Cargando…','Loading…')}</p>:
  <form onSubmit={submit} className="grid min-w-0 gap-3 sm:grid-cols-2">
   <label className="block min-w-0 text-sm font-bold">{t('Tipo de identificación','Identification type')}<select data-emisor-field="idType" value={value.idType} onChange={event=>set('idType',event.target.value)} className={field}><option value="01">{t('Cédula física','Individual ID')}</option><option value="02">{t('Cédula jurídica','Company ID')}</option><option value="03">DIMEX</option><option value="04">NITE</option></select></label>
   {input('idNumber',t('Número (sin guiones)','Number (no dashes)'),{inputMode:'numeric',required:true,maxLength:12})}
   {input('name',t('Nombre o razón social','Legal name'),{required:true,maxLength:100})}
   {input('commercialName',t('Nombre comercial (opcional)','Trade name (optional)'),{maxLength:80})}
   {input('activityCode',t('Código de actividad económica (6 dígitos)','Economic activity code (6 digits)'),{inputMode:'numeric',required:true,maxLength:6})}
   {input('providerSystems',t('Proveedor de sistemas (su identificación si es desarrollo propio)','Systems provider (your ID if self-developed)'),{required:true,maxLength:20})}
   <label className="block min-w-0 text-sm font-bold">{t('Provincia','Province')}<select data-emisor-field="province" value={value.province} onChange={event=>set('province',event.target.value)} className={field}>{PROVINCES.map(([code,name])=><option key={code} value={code}>{code} · {name}</option>)}</select></label>
   {input('canton',t('Cantón (2 dígitos)','Canton (2 digits)'),{inputMode:'numeric',required:true,maxLength:2})}
   {input('district',t('Distrito (2 dígitos)','District (2 digits)'),{inputMode:'numeric',required:true,maxLength:2})}
   {input('barrio',t('Barrio (opcional)','Neighborhood (optional)'),{maxLength:50})}
   <div className="sm:col-span-2">{input('otherSigns',t('Otras señas','Address details'),{required:true,maxLength:250})}</div>
   {input('email',t('Correo para comprobantes','Email for documents'),{type:'email',required:true,maxLength:160})}
   {input('phone',t('Teléfono (opcional, solo dígitos)','Phone (optional, digits only)'),{inputMode:'numeric',maxLength:20})}
   {withProvider&&<label className="block min-w-0 text-sm font-bold sm:col-span-2">{t('Proveedor de facturación electrónica','Electronic invoicing provider')}<select data-emisor-field="provider" value={value.provider??'mock'} onChange={event=>set('provider',event.target.value)} className={field}><option value="mock">{t('Simulador local de Hacienda (modo de prueba)','Local Hacienda simulator (test mode)')}</option><option value="hacienda-sandbox">{t('Hacienda (ATV) directo: requiere credenciales','Hacienda (ATV) direct: needs credentials')}</option><option value="gti">{t('GTI: requiere contrato y credenciales','GTI: needs a contract and credentials')}</option></select></label>}
   {input('branch',t('Sucursal (3 dígitos)','Branch (3 digits)'),{inputMode:'numeric',required:true,maxLength:3})}
   {input('terminal',t('Terminal (5 dígitos)','Terminal (5 digits)'),{inputMode:'numeric',required:true,maxLength:5})}
   <div className="space-y-2 sm:col-span-2">{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{saved&&<p role="status" data-emisor-saved className="text-sm text-green-800">{t('Datos del emisor guardados.','Issuer details saved.')}</p>}<Button type="submit" data-emisor-save disabled={busy}>{busy?t('Guardando…','Saving…'):t('Guardar datos del emisor','Save issuer details')}</Button></div>
  </form>}
 </section>;
}
