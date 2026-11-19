'use client';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {useLocale} from 'next-intl';
import {Modal} from '@/components/ui/modal';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';
import {closeProStep,currentProPath,PRO_PATH_CHANGED} from '@/lib/pro/navigation';
import {emptyInvoiceIssuer,type InvoiceIssuer} from '@/lib/pro/invoice-preparation';
import {issuerSettingsSchema} from '@/lib/pro/issuer-settings';
import {InvoiceIssuerFields} from './invoice-issuer-fields';
import {registerProTraversalGuard} from './use-pro-search-params';
export function InvoiceIssuerSettings(){
 const en=useLocale()==='en',t=useCallback((es:string,eng:string)=>en?eng:es,[en]);
 const [issuer,setIssuer]=useState(emptyInvoiceIssuer),[revision,setRevision]=useState(0),[loading,setLoading]=useState(true),[ready,setReady]=useState(false),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const {confirm,dialogNode}=useAppDialog(),sequence=useRef(0),lock=useRef(false),allowExit=useRef(false);
 const load=useCallback(async()=>{const token=++sequence.current;setLoading(true);setError('');try{const response=await fetch('/api/pro/invoice-issuer',{cache:'no-store'}),body=await response.json();if(!response.ok)throw Error(t('No se pudieron cargar los datos del emisor.','Could not load issuer settings.'));if(token!==sequence.current)return;setIssuer(body.issuer);setRevision(body.revision);setReady(true);setDirty(false);setNotice('');}catch(e){if(token===sequence.current)setError(e instanceof TypeError?t('Revise la conexión e intente nuevamente.','Check your connection and try again.'):(e as Error).message);}finally{if(token===sequence.current)setLoading(false);}},[t]);
 const invalidate=useCallback(()=>{sequence.current++;},[]);
 useEffect(()=>{const timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);invalidate();};},[load,invalidate]);
 useEffect(()=>{if(!dirty&&!saving)return;const path=currentProPath(),state={...window.history.state};let asking=false;
 function unload(e:BeforeUnloadEvent){if(!allowExit.current){e.preventDefault();e.returnValue='';}}
 function back(event:PopStateEvent){if(allowExit.current)return false;event.stopImmediatePropagation();window.history.pushState(state,'',path);window.dispatchEvent(new Event(PRO_PATH_CHANGED));if(saving||asking)return true;asking=true;void confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los cambios del emisor todavía no se han guardado.','Issuer changes have not been saved yet.'),confirmLabel:t('Salir sin guardar','Leave without saving')}).then(answer=>{asking=false;if(answer.confirmed){allowExit.current=true;window.history.back();}});return true;}
 const unregister=registerProTraversalGuard(back);window.addEventListener('beforeunload',unload);return()=>{unregister();window.removeEventListener('beforeunload',unload);};
 },[dirty,saving,confirm,t]);
 async function discard(){return !dirty||(await confirm({title:t('¿Salir sin guardar?','Leave without saving?'),description:t('Los cambios del emisor todavía no se han guardado.','Issuer changes have not been saved yet.'),confirmLabel:t('Salir sin guardar','Leave without saving')})).confirmed;}
 async function close(){if(!saving&&await discard()){allowExit.current=true;closeProStep('emisor');}}
 function change(value:InvoiceIssuer){setIssuer(value);setDirty(true);setNotice('');setError('');}
 async function save(event:FormEvent){event.preventDefault();if(!ready||loading||lock.current)return;const checked=issuerSettingsSchema.safeParse({issuer,revision});if(!checked.success){setError(t('Revise los datos: ','Check the details: ')+checked.error.issues[0].message);const key=String(checked.error.issues[0].path[1]??'issuerName');document.querySelector<HTMLInputElement>(`#pro-issuer-settings [data-issuer-field="${key}"]`)?.focus();return;}
 lock.current=true;setSaving(true);setError('');setNotice('');try{const response=await fetch('/api/pro/invoice-issuer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(checked.data)}),body=await response.json();if(!response.ok)throw Error(response.status===409?t('Los datos del emisor cambiaron. Recárguelos antes de guardar.','Issuer settings changed. Reload before saving.'):t('No se pudieron guardar los datos. Revise el emisor.','Could not save settings. Check issuer details.'));setIssuer(body.issuer);setRevision(body.revision);setDirty(false);setNotice(t('Emisor guardado. Se usará en los borradores nuevos; los existentes no cambiaron.','Issuer saved. New drafts will use it; existing drafts are unchanged.'));}catch(e){setError(e instanceof TypeError?t('No se pudo confirmar el guardado. Recargue para comprobarlo antes de repetir.','Could not confirm the save. Reload to check before retrying.'):(e as Error).message);}finally{lock.current=false;setSaving(false);}}
 return <><Modal title={t('Emisor de facturación','Billing issuer')} ariaLabel={t('Emisor de facturación','Billing issuer')} mobilePresentation="fullscreen" closeLabel={t('Volver a Facturación','Back to billing')} onClose={()=>void close()} footer={<Button type="submit" form="pro-issuer-settings" disabled={!ready||loading||saving}>{saving?t('Guardando…','Saving…'):t('Guardar emisor','Save issuer')}</Button>} footerNotice={error?<p role="alert" className="text-sm text-red-700">{error}</p>:undefined}>
 <div className="space-y-4"><p className="rounded-xl bg-[#f3f8fb] p-3 text-sm text-[#52627a]">{t('Se copian al crear un borrador. Cambiar estos datos no modifica sus borradores anteriores ni su perfil.','Copied when a draft is created. Changes do not modify previous drafts or your profile.')}</p>
 {notice&&<p role="status" className="text-sm text-green-800">{notice}</p>}{loading&&<p role="status">{t('Cargando emisor…','Loading issuer…')}</p>}
 {error&&<Button type="button" variant="secondary" disabled={loading||saving} onClick={async()=>{if(await discard())void load();}}>{t('Recargar emisor','Reload issuer')}</Button>}
 {ready&&<form id="pro-issuer-settings" onSubmit={save}><fieldset disabled={loading||saving}><InvoiceIssuerFields value={issuer} onChange={change}/></fieldset></form>}
 <p className="text-xs text-[#68778d]">{t('Puede completar los campos pendientes después. Estos datos no validan identificación, actividad ni autorización fiscal, y no habilitan la emisión.','You may complete missing fields later. These settings do not validate identification, activity or fiscal authorization and do not enable issuance.')}</p></div>
 </Modal>{dialogNode}</>;
}
