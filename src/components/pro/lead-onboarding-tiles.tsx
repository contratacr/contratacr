'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {Button} from '@/components/ui/button';

/**
 * Leads area: a strip under the list that points to the three ways of bringing leads in (create, import a file, contact form).
 * The person can hide it; that choice is a per-viewer convenience kept in the browser.
 */
const storeKey='contratacr-pro-lead-onboarding-hidden-v1';
export function LeadOnboardingTiles({disabled,onCreate,onImport,onContactForm}:{disabled?:boolean;onCreate:()=>void;onImport:()=>void;onContactForm:()=>void}){
 const en=useLocale()==='en',[hidden,setHidden]=useState(true);
 useEffect(()=>{const timer=setTimeout(()=>{try{setHidden(localStorage.getItem(storeKey)==='1');}catch{setHidden(false);}},0);return()=>clearTimeout(timer);},[]);
 if(hidden)return null;
 const tiles:[string,string,string,()=>void][]=[
  ['create',en?'Create lead':'Crear solicitud',en?'Add one by hand with its customer, source and forecast.':'Agregue una a mano con su cliente, origen y previsión.',onCreate],
  ['import',en?'Import from file':'Importar archivo',en?'Bring many at once from a CSV file and match its columns.':'Traiga muchas a la vez desde un archivo CSV y relacione sus columnas.',onImport],
  ['contact-form',en?'Contact form':'Formulario de contacto',en?'Publish a form and share its link; each submission becomes a lead.':'Publique un formulario y comparta su enlace; cada envío se vuelve una solicitud.',onContactForm],
 ];
 return <section data-lead-onboarding className="min-w-0 space-y-3 rounded-2xl border border-[#cfe9f3] bg-[#eaf7fb] p-4">
  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="font-semibold">{en?'Bring all your leads into one place':'Reúna todas sus solicitudes en un solo lugar'}</h3><p className="text-sm text-[#52627a]">{en?'Stay organized, track your sales and keep your pipeline moving.':'Manténgase organizado, dé seguimiento a sus ventas y mantenga su embudo en movimiento.'}</p></div>
   <Button type="button" variant="ghost" data-lead-onboarding-hide onClick={()=>{setHidden(true);try{localStorage.setItem(storeKey,'1');}catch{/* browser storage unavailable */}}}>{en?'Hide':'Ocultar'}</Button></div>
  <ul className="grid min-w-0 gap-2 sm:grid-cols-3">{tiles.map(([key,title,text,action])=><li key={key} className="min-w-0"><button type="button" data-lead-onboarding-tile={key} disabled={disabled} onClick={action} className="flex h-full min-h-24 w-full min-w-0 flex-col items-start gap-1 rounded-xl border border-[#d7e1ea] bg-white p-3 text-left hover:border-[#008bb5] disabled:opacity-60"><span className="font-semibold text-[#008bb5]">{title}</span><span className="text-sm text-[#52627a]">{text}</span></button></li>)}</ul>
 </section>;
}
