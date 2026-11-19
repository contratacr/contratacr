'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';

/** Round 6D: reads the token from the URL fragment (never sent in a URL), shows the business and confirms. */
export function MarketingUnsubscribe(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [token,setToken]=useState<string|null>(null),[state,setState]=useState<{business:string;unsubscribed:boolean}|'invalid'|'loading'|'error'>('loading'),[busy,setBusy]=useState(false);
 async function call(value:string,confirm:boolean){const response=await fetch('/api/pro/marketing-unsubscribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value,confirm})});if(!response.ok)return response.status===404||response.status===400?'invalid' as const:'error' as const;return await response.json() as {business:string;unsubscribed:boolean};}
 useEffect(()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get('t');const timer=setTimeout(()=>{if(!value||!/^[a-f0-9]{64}$/.test(value)){setState('invalid');return;}setToken(value);void call(value,false).then(setState).catch(()=>setState('error'));},0);return()=>clearTimeout(timer);},[]);
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-4 py-10 text-[#162543]">
  <ContrataCRLogo/>
  <h1 className="text-2xl font-bold">{t('Darse de baja','Unsubscribe')}</h1>
  {state==='loading'&&<p role="status">{t('Cargando…','Loading…')}</p>}
  {state==='invalid'&&<p role="alert" data-unsubscribe="invalid">{t('Este enlace no es válido o ya no existe.','This link is not valid or no longer exists.')}</p>}
  {state==='error'&&<p role="alert">{t('No se pudo completar. Reintente en un momento.','Could not complete. Retry in a moment.')}</p>}
  {typeof state==='object'&&(state.unsubscribed?<p role="status" data-unsubscribe="done" className="rounded-2xl bg-[#eaf7fb] p-4">{t(`Listo: ya no recibirá correos de ${state.business}.`,`Done: you will no longer receive emails from ${state.business}.`)}</p>
   :<div className="space-y-3"><p>{t(`¿Desea dejar de recibir correos de ${state.business}?`,`Do you want to stop receiving emails from ${state.business}?`)}</p>
    <button type="button" data-unsubscribe-confirm disabled={busy} onClick={()=>{if(!token)return;setBusy(true);void call(token,true).then(setState).catch(()=>setState('error')).finally(()=>setBusy(false));}} className="inline-flex min-h-11 items-center rounded-full bg-[#007aa0] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bb5] disabled:opacity-60">{t('Darme de baja','Unsubscribe me')}</button></div>)}
  <p className="text-xs text-[#52627a]">{t('Esta baja aplica solo a los correos de ese negocio. ContrataCR no comparte su correo con otros negocios.','This applies only to that business\'s emails. ContrataCR does not share your email with other businesses.')}</p>
 </main>;
}
