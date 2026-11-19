'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {ContrataCRLogo} from '@/components/brand/brand-logo';

type State={business:string;confirmed:boolean;already:boolean;expired:boolean};
/** Double opt-in: reads the token from the URL fragment (never sent in a URL), shows the business and confirms on click. */
export function MarketingConfirm(){
 const en=useLocale()==='en',t=(es:string,english:string)=>en?english:es;
 const [token,setToken]=useState<string|null>(null),[state,setState]=useState<State|'invalid'|'loading'|'error'>('loading'),[busy,setBusy]=useState(false);
 async function call(value:string,confirm:boolean){const response=await fetch('/api/pro/marketing-confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value,confirm})});if(!response.ok)return response.status===404||response.status===400?'invalid' as const:'error' as const;return await response.json() as State;}
 useEffect(()=>{const value=new URLSearchParams(window.location.hash.slice(1)).get('t');const timer=setTimeout(()=>{if(!value||!/^[a-f0-9]{64}$/.test(value)){setState('invalid');return;}setToken(value);void call(value,false).then(setState).catch(()=>setState('error'));},0);return()=>clearTimeout(timer);},[]);
 return <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-5 px-4 py-10 text-[#162543]">
  <ContrataCRLogo/>
  <h1 className="text-2xl font-bold">{t('Confirmar suscripción','Confirm subscription')}</h1>
  {state==='loading'&&<p role="status">{t('Cargando…','Loading…')}</p>}
  {state==='invalid'&&<p role="alert" data-confirm-state="invalid">{t('Este enlace no es válido o ya no existe.','This link is not valid or no longer exists.')}</p>}
  {state==='error'&&<p role="alert">{t('No se pudo completar. Reintente en un momento.','Could not complete. Retry in a moment.')}</p>}
  {typeof state==='object'&&(state.expired?<p role="alert" data-confirm-state="expired">{t('Este enlace venció o ya no aplica. Si aún desea recibir correos, vuelva a pedirlo en el sitio del negocio.','This link expired or no longer applies. If you still want emails, ask again on the business\'s website.')}</p>
   :state.confirmed?<p role="status" data-confirm-state="done" className="rounded-2xl bg-[#eaf7fb] p-4">{t(`Listo: recibirá correos de ${state.business}. Puede darse de baja en cualquier momento desde el enlace de cada correo.`,`Done: you will receive emails from ${state.business}. You can unsubscribe at any time from the link in each email.`)}</p>
   :<div className="space-y-3"><p>{t(`¿Confirme que desea recibir novedades y promociones de ${state.business} por correo?`,`Do you confirm you want to receive news and offers from ${state.business} by email?`)}</p>
    <button type="button" data-confirm-subscription disabled={busy} onClick={()=>{if(!token)return;setBusy(true);void call(token,true).then(setState).catch(()=>setState('error')).finally(()=>setBusy(false));}} className="inline-flex min-h-11 items-center rounded-full bg-[#007aa0] px-5 font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008bb5] disabled:opacity-60">{t('Sí, confirmar','Yes, confirm')}</button>
    <p className="text-sm text-[#52627a]">{t('Si no lo pidió usted, cierre esta página: no recibirá nada.','If you did not ask for this, close this page: you will receive nothing.')}</p></div>)}
  <p className="text-xs text-[#52627a]">{t('Esta suscripción aplica solo a los correos de ese negocio. ContrataCR no comparte su correo con otros negocios.','This applies only to that business\'s emails. ContrataCR does not share your email with other businesses.')}</p>
 </main>;
}
