'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,currentProPath,PRO_PATH_CHANGED} from '@/lib/pro/navigation';
import {emptyReceiverFiscal,type FiscalReceiver} from '@/lib/pro/client-fiscal';
import {clientFiscalSettingsSchema} from '@/lib/pro/client-fiscal';
import {InvoiceReceiverFields} from './invoice-receiver-fields';
import {registerProTraversalGuard} from './use-pro-search-params';
export function ClientFiscalSettings({clientId}:{clientId:string}){
 const [mounted,setMounted]=useState(false);useEffect(()=>{const timer=setTimeout(()=>setMounted(true),0);return()=>clearTimeout(timer);},[]);
 return mounted?<ClientFiscalForm clientId={clientId}/>:null;
}
function ClientFiscalForm({clientId}:{clientId:string}){
 const en=useLocale()==='en',t=useCallback((es:string,eng:string)=>en?eng:es,[en]);
 const [receiver,setReceiver]=useState<FiscalReceiver>({...emptyReceiverFiscal(),name:'',identification:'',email:'',phone:'',address:''}),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const {confirm,dialogNode}=useAppDialog(),sequence=useRef(0),lock=useRef(false),allowExit=useRef(false);
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');try{const response=await fetch('/api/pro/client-fiscal?'+new URLSearchParams({clientId}),{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(t('No se pudieron cargar los datos para facturas.','Could not load invoice details.'));if(token!==sequence.current)return;setReceiver(body.receiver);setRevision(body.revision);setReady(true);setDirty(false);setNotice('');}catch(e){if(token===sequence.current)setError(e instanceof TypeError?t('Revise la conexión e intente nuevamente.','Check your connection and try again.'):(e as Error).message);}finally{if(token===sequence.current)setLoading(false);}},[t,clientId]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 useEffect(()=>{if(!dirty&&!saving)return;const path=currentProPath(),state={...window.history.state};let asking=false;
 function unload(e:BeforeUnloadEvent){if(!allowExit.current){e.preventDefault();e.returnValue='';}}
 function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));if(saving||asking)return true;asking=true;void confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los datos para facturas todavía no se han guardado.','Customer invoice details have not been saved yet.'),confirmLabel:t('Salir sin guardar','Leave without saving')}).then(answer=>{asking=false;if(answer.confirmed){allowExit.current=true;window.history.back();}});return true;}
 const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};
 },[dirty,saving,confirm,t]);
 async function discard(){return !dirty||(await confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los datos para facturas todavía no se han guardado.','Customer invoice details have not been saved yet.'),confirmLabel:t('Salir sin guardar','Leave without saving')})).confirmed;}
 async function close(){if(!saving&&await discard()){allowExit.current=true;closeProStep('fiscalCliente');}}
 function change(value:FiscalReceiver){setReceiver(value);setDirty(true);setNotice('');setError('');}
 async function save(event:FormEvent){event.preventDefault();if(!ready||loading||lock.current)return;const checked=clientFiscalSettingsSchema.safeParse({clientId,receiver,revision});if(!checked.success){setError(t('Revise los datos: ','Check the details: ')+checked.error.issues[0].message);const key=String(checked.error.issues[0].path[1]??'name');const field=document.querySelector<HTMLInputElement>(`#pro-client-fiscal-settings [data-receiver-field="${key}"]`);for(let node=field?.parentElement;node;node=node.parentElement)if(node instanceof HTMLDetailsElement)node.open=true;field?.focus();return;}
 lock.current=true;setSaving(true);setError('');setNotice('');try{const response=await fetch('/api/pro/client-fiscal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked.data)}),body=await response.json();if(!response.ok)throw Error(response.status===409?t('Los datos para facturas cambiaron. Recárguelos antes de guardar.','Invoice details changed. Reload before saving.'):t('No se pudieron guardar los datos. Revise los datos.','Could not save settings. Check invoice details.'));setReceiver(body.receiver);setRevision(body.revision);setDirty(false);setNotice(t('Datos guardados. Se usarán en los borradores nuevos; los anteriores no cambiaron.','Details saved. New drafts will use them; existing drafts are unchanged.'));}catch(e){setError(e instanceof TypeError?t('No se pudo confirmar el guardado. Recargue para comprobarlo antes de repetir.','Could not confirm the save. Reload to check before retrying.'):(e as Error).message);}finally{lock.current=false;setSaving(false);}}
 return <><Modal title={t('Datos para facturas','Customer invoice details')} ariaLabel={t('Datos para facturas','Customer invoice details')} mobilePresentation="fullscreen" closeLabel={t('Volver al cliente','Back to customer')} onClose={()=>void close()} footer={<Button type="submit" form="pro-client-fiscal-settings" disabled={!ready||loading||saving}>{saving?t('Guardando…','Saving…'):t('Guardar datos para facturas','Save invoice details')}</Button>} footerNotice={error?<p role="alert" className="text-sm text-red-700">{error}</p>:undefined}>
 <div className="space-y-4"><p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Se reutilizan al preparar facturas para este cliente. Puede usar una razón social y un correo distintos a los de contacto. Los cambios no modifican sus facturas anteriores ni el contacto del cliente.','Used when preparing invoices for this customer. You may use a business name and email different from their contact details. Changes do not modify existing invoices or the customer contact.')}</p>
 {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}{loading&&<p role="status">{t('Cargando datos…','Loading details…')}</p>}
 {error&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={async()=>{if(await discard())void load();}}>{t('Recargar datos','Reload details')}</Button>}
 {ready&&<form id="pro-client-fiscal-settings" onSubmit={save}><fieldset disabled={loading||saving}><InvoiceReceiverFields value={receiver} onChange={value=>change({...receiver,...value})} includeName/></fieldset></form>}
 <p className="text-xs text-[#68778d]">{t('Puede completar los campos pendientes después. La identificación, actividad y domicilio requieren revisión antes de una futura emisión fiscal.','You may complete missing fields later. Identification, activity and address require review before any future fiscal issuance.')}</p></div>
 </Modal>{dialogNode}</>;
}
