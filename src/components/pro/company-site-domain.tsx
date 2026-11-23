'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';
import {useAppDialog} from '@/hooks/use-app-dialog';

/**
 * Pro 29 (row 69): connect a custom domain to the website (Company › Website). TEST mode: it gives the DNS records and
 * simulates the check; nothing is served on the domain and the site stays at /sitio/<slug>.
 */
type Domain={id:string;hostname:string;status:'pending'|'verified'|'revoked';cnameTarget:string;txtName:string;txtValue:string};
type Read={hasSite:boolean;domain:Domain|null;history:{hostname:string;revokedAt:string}[];mode:string};
const card='min-w-0 space-y-3 rounded-2xl border border-[#d7e1ea] bg-white p-4 sm:p-5',field='mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-[#d7e1ea] bg-white px-3 text-base font-normal';
export function CompanySiteDomain(){
 const en=useLocale()==='en',t=useCallback((es:string,english:string)=>en?english:es,[en]),{confirm,dialogNode}=useAppDialog();
 const [data,setData]=useState<Read|null>(null),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[host,setHost]=useState(''),seq=useRef(0);
 const load=useCallback(async()=>{const n=++seq.current;setFailed(false);try{const r=await fetch('/api/pro/company-site-domain',{cache:'no-store'});if(!r.ok)throw Error();const body=await r.json() as Read;if(n===seq.current)setData(body);}catch{if(n===seq.current)setFailed(true);}},[]);
 useEffect(()=>{const counter=seq,timer=setTimeout(()=>void load(),0);return()=>{clearTimeout(timer);counter.current++;};},[load]);
 async function post(payload:Record<string,unknown>,done:string){
  setBusy(true);setError('');setNotice('');
  try{const r=await fetch('/api/pro/company-site-domain',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!r.ok){const body=await r.json().catch(()=>({})) as {reason?:string};setError(body.reason==='not_active'?t('La conexión real de dominios no está activa; solo existe el modo de prueba.','Real domain connection is not active; only the test mode exists.'):r.status===400?t('Escriba un dominio válido, por ejemplo www.suempresa.cr.','Enter a valid domain, for example www.yourcompany.cr.'):r.status===409?t('Ese dominio ya está en uso o su estado cambió.','That domain is already in use or its state changed.'):t('No se pudo completar. Reintente.','Could not complete it. Retry.'));await load();return false;}
   setNotice(done);await load();return true;
  }catch{setError(t('No se pudo completar. Reintente.','Could not complete it. Retry.'));return false;}finally{setBusy(false);}
 }
 if(failed)return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-red-700"><span>{t('No se pudo cargar el dominio.','Could not load the domain.')}</span><Button type="button" variant="secondary" onClick={()=>void load()}>{t('Reintentar','Retry')}</Button></div>;
 if(!data)return <p role="status" aria-busy="true" className="text-sm text-[#52627a]">{t('Cargando…','Loading…')}</p>;
 const d=data.domain;
 return <section data-site-domain={d?.status??'none'} className={card} aria-labelledby="site-domain-connect">{dialogNode}
  <div className="flex flex-wrap items-center gap-2"><h3 id="site-domain-connect" className="font-bold">{t('Conectar su dominio','Connect your domain')}</h3><span className="rounded-lg bg-[#fff6e5] px-2 py-0.5 text-xs font-semibold text-[#8a5300]">{t('Modo de prueba','Test mode')}</span></div>
  <p className="text-sm text-[#52627a]">{t('Registre su dominio para recibir las instrucciones de DNS. En el modo de prueba la verificación es simulada y su sitio se sigue sirviendo en ContrataCR (/sitio/su-nombre); no se publica nada en su dominio.','Register your domain to get the DNS instructions. In test mode the check is simulated and your site keeps being served on ContrataCR (/sitio/your-name); nothing is published on your domain.')}</p>
  {!data.hasSite&&<p data-site-domain-nosite className="text-sm text-[#8a5300]">{t('Guarde el borrador de su sitio web primero.','Save your website draft first.')}</p>}
  {!d&&data.hasSite&&<form data-site-domain-form className="flex flex-wrap items-end gap-2" onSubmit={e=>{e.preventDefault();void post({action:'register',hostname:host},t('Dominio registrado. Agregue los registros DNS.','Domain registered. Add the DNS records.')).then(ok=>{if(ok)setHost('');});}}>
   <label className="block min-w-0 flex-1 text-sm font-medium">{t('Dominio','Domain')}<input data-site-domain-input className={field} value={host} maxLength={253} placeholder="www.suempresa.cr" onChange={e=>setHost(e.target.value.trim().toLowerCase())}/></label>
   <Button type="submit" data-site-domain-register disabled={busy||!host}>{t('Registrar dominio','Register domain')}</Button></form>}
  {d&&<div className="space-y-2 text-sm"><p><strong data-site-domain-host>{d.hostname}</strong> · <span data-site-domain-status>{d.status==='verified'?t('Verificado (simulado)','Verified (simulated)'):t('Pendiente de DNS','Waiting for DNS')}</span></p>
   <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead><tr className="text-[#52627a]"><th scope="col" className="py-1 pr-2">{t('Tipo','Type')}</th><th scope="col" className="px-2">{t('Nombre','Name')}</th><th scope="col" className="px-2">{t('Valor','Value')}</th></tr></thead>
    <tbody><tr data-site-dns="cname" className="border-t border-[#eef2f6]"><td className="py-1 pr-2">CNAME</td><td className="px-2 break-all">{d.hostname}</td><td className="px-2 break-all">{d.cnameTarget}</td></tr>
     <tr data-site-dns="txt" className="border-t border-[#eef2f6]"><td className="py-1 pr-2">TXT</td><td className="px-2 break-all">{d.txtName}</td><td className="px-2 break-all">{d.txtValue}</td></tr></tbody></table></div>
   <div className="flex flex-wrap gap-2">{d.status==='pending'&&<Button type="button" data-site-domain-verify disabled={busy} onClick={()=>void post({action:'verify'},t('Dominio verificado (simulado).','Domain verified (simulated).'))}>{t('Comprobar DNS','Check DNS')}</Button>}
    <Button type="button" variant="ghost" data-site-domain-revoke disabled={busy} onClick={()=>void (async()=>{if(await confirm({title:t('¿Desconectar el dominio?','Disconnect the domain?'),description:t('El dominio queda libre y su sitio sigue en ContrataCR.','The domain is freed and your site stays on ContrataCR.'),confirmLabel:t('Desconectar','Disconnect'),cancelLabel:t('Cancelar','Cancel')}))await post({action:'revoke'},t('Dominio desconectado.','Domain disconnected.'));})()}>{t('Desconectar','Disconnect')}</Button></div></div>}
  {notice&&<p role="status" data-site-domain-notice className="text-sm text-[#175b42]">{notice}</p>}{error&&<p role="alert" data-site-domain-error className="text-sm text-red-700">{error}</p>}
 </section>;
}
