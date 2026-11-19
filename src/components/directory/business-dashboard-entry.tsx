'use client';
import {useEffect,useState} from 'react';

/**
 * Launch without Pro (2026-11-18): entry to «Mi negocio» from the account panel (/dashboard/profesional). Shows only
 * when the account manages a claimed place (GET /api/negocio); renders nothing otherwise (also while the directory is
 * off: the API answers 404). Plain anchor with the locale prefix.
 */
type Hub={places:{id:string;slug:string;name:string}[]};
export function BusinessDashboardEntry({locale}:{locale:string}){
 const en=locale==='en',[hub,setHub]=useState<Hub|null>(null);
 useEffect(()=>{let alive=true;fetch('/api/negocio',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{if(alive&&j)setHub(j as Hub);}).catch(()=>{});return ()=>{alive=false;};},[]);
 if(!hub||!hub.places.length)return null;
 const first=hub.places[0]!.name,more=hub.places.length-1;
 return <div data-business-entry className="flex w-full flex-col gap-3 rounded-2xl border border-[#d7e1ea] bg-[#F7FAFC] p-4 text-[#162543] sm:flex-row sm:items-center sm:justify-between">
  <div className="min-w-0">
   <p className="font-bold">{en?'My business in the directory':'Mi negocio en el directorio'}</p>
   <p className="truncate text-sm text-[#52627a]">{first}{more>0?(en?` and ${more} more`:` y ${more} más`):''} · {en?'contact, hours, menu, reservations and events, free':'contacto, horario, menú, reservas y eventos, gratis'}</p>
  </div>
  <a href={(en?'/en':'')+'/dashboard/negocio'} data-business-entry-link className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-[#162543] px-5 text-sm font-semibold text-white hover:bg-[#22355c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">{en?'Open My business':'Abrir Mi negocio'}</a>
 </div>;
}
