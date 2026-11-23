'use client';

import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';

/**
 * Row 73 (web/PWA only): installable Pro space on phones and tablets. Registers the offline-fallback service worker,
 * points the page at the Pro manifest, offers «Install» where the browser allows it (Android/desktop) or the share-sheet
 * hint on iPhone, and tells the person when the connection drops. Nothing is queued offline: writes need the network.
 * The store apps (iOS/Android binaries, native push and device capabilities) are excluded from this row.
 */
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const KEY='ccr:pro-install-dismissed';
function stored(){try{return localStorage.getItem(KEY)==='1';}catch{return false;}}
function standalone(){return window.matchMedia?.('(display-mode: standalone)').matches||(navigator as Navigator&{standalone?:boolean}).standalone===true||!!(window as unknown as {Capacitor?:{isNativePlatform?:()=>boolean}}).Capacitor?.isNativePlatform?.();}
export function ProAppSupport(){
 const en=useLocale()==='en';
 const [online,setOnline]=useState(true),[prompt,setPrompt]=useState<InstallPrompt|null>(null),[ios,setIos]=useState(false),[dismissed,setDismissed]=useState(true),[installed,setInstalled]=useState(true);
 useEffect(()=>{
  const sync=()=>setOnline(navigator.onLine!==false);
  const timer=setTimeout(()=>{sync();setDismissed(stored());setInstalled(standalone());setIos(/iphone|ipad|ipod/i.test(navigator.userAgent)&&!/crios|fxios/i.test(navigator.userAgent));},0);
  const link=document.querySelector<HTMLLinkElement>('link[rel="manifest"]'),previous=link?.getAttribute('href')??null,previousCors=link?.getAttribute('crossorigin')??null;
  if(link){link.setAttribute('href','/api/pro/app-manifest?lang='+(en?'en':'es'));link.setAttribute('crossorigin','use-credentials');}
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))void navigator.serviceWorker.register('/pro-sw.js',{scope:'/'}).catch(()=>undefined);
  const before=(event:Event)=>{event.preventDefault();setPrompt(event as InstallPrompt);},done=()=>{setInstalled(true);setPrompt(null);};
  window.addEventListener('online',sync);window.addEventListener('offline',sync);window.addEventListener('beforeinstallprompt',before);window.addEventListener('appinstalled',done);
  return()=>{clearTimeout(timer);window.removeEventListener('online',sync);window.removeEventListener('offline',sync);window.removeEventListener('beforeinstallprompt',before);window.removeEventListener('appinstalled',done);
   if(link){if(previous!==null)link.setAttribute('href',previous);if(previousCors===null)link.removeAttribute('crossorigin');else link.setAttribute('crossorigin',previousCors);}};
 },[en]);
 const dismiss=()=>{setDismissed(true);try{localStorage.setItem(KEY,'1');}catch{/* private mode */}};
 const canOffer=!installed&&!dismissed&&(!!prompt||ios);
 return <>
  {!online&&<p role="status" data-pro-offline className="rounded-xl border border-[#f2d9a0] bg-[#fff8e8] p-3 text-sm font-semibold text-[#7a4b00]">{en?'You are offline. You can keep reading what is open, but changes cannot be saved until the connection returns.':'Sin conexión. Puede seguir leyendo lo que tiene abierto, pero los cambios no se pueden guardar hasta que regrese la señal.'}</p>}
  {canOffer&&<div data-pro-install className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#bfe3f2] bg-[#eef8fc] p-3 text-sm text-[#0b3a53]">
   <p className="min-w-0 flex-1 basis-60">{prompt?(en?'Install ContrataCR Pro on your phone for quick access to projects, tasks and the schedule.':'Instale ContrataCR Pro en su teléfono para entrar rápido a proyectos, tareas y agenda.'):(en?'To install ContrataCR Pro: tap Share, then "Add to Home Screen".':'Para instalar ContrataCR Pro: toque Compartir y luego "Agregar a inicio".')}</p>
   <div className="flex gap-2">{prompt&&<Button type="button" data-pro-install-action onClick={()=>{const p=prompt;setPrompt(null);void p.prompt().then(()=>p.userChoice).catch(()=>undefined);}}>{en?'Install':'Instalar'}</Button>}
    <Button type="button" variant="secondary" data-pro-install-dismiss onClick={dismiss}>{en?'Not now':'Ahora no'}</Button></div>
  </div>}
 </>;
}
