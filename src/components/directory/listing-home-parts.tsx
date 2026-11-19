import type {ReactNode} from 'react';

/**
 * LOCAL PRO ONLY (multivertical V4/R1): pieces shared by vehicles-home and properties-home. Server-safe (no hooks,
 * no 'use client'), so the landing pages stay server components. Query keys used by the chips match FILTER_KEYS in search-schemas.ts: type, make,
 * province, operation (see dir-wiring-UI.md).
 */
const ring='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]';
export type Chip={key:string;label:string;href:string;current?:boolean};

export function hrefWith(base:string,params:Record<string,string|undefined>){
 const q=new URLSearchParams();for(const[k,v]of Object.entries(params))if(v)q.set(k,v);
 const s=q.toString();return s?`${base}?${s}`:base;
}

export function ChipGroup({id,title,chips,scroll}:{id:string;title:string;chips:Chip[];scroll?:boolean}){
 if(!chips.length)return null;
 return <section aria-labelledby={id} className="space-y-3">
  <h2 id={id} className="text-lg font-bold">{title}</h2>
  <ul className={scroll?'-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0':'flex flex-wrap gap-2'}>
   {chips.map(c=><li key={c.key} className="shrink-0"><a href={c.href} aria-current={c.current?'page':undefined} data-chip={c.key}
    className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${c.current?'border-[#162543] bg-[#162543] text-white':'border-[#d7e1ea] bg-white text-[#162543] hover:border-[#009FD9]'} ${ring}`}>{c.label}</a></li>)}
  </ul>
 </section>;
}

export function HomeHero({title,lead,actions}:{title:string;lead:string;actions?:ReactNode}){
 return <header className="space-y-3 rounded-3xl bg-[#EBF5FB] px-5 py-8 sm:px-8 sm:py-10">
  <h1 className="text-3xl font-extrabold leading-tight text-[#162543] sm:text-4xl">{title}</h1>
  <p className="max-w-2xl text-base text-slate-700 sm:text-lg">{lead}</p>
  {actions&&<div className="flex flex-wrap gap-3 pt-1">{actions}</div>}
 </header>;
}

export function HomeLink({href,children,primary}:{href:string;children:ReactNode;primary?:boolean}){
 return <a href={href} className={`inline-flex min-h-11 items-center rounded-full px-5 font-semibold ${primary?'bg-[#162543] text-white':'border border-[#162543] bg-white text-[#162543]'} ${ring}`}>{children}</a>;
}

export function NeutralityNote({locale,children}:{locale:string;children?:ReactNode}){
 const en=locale==='en';
 return <aside role="note" className="space-y-1 border-t border-[#d7e1ea] pt-6 text-sm text-slate-700">
  {children}
  <p>{en?'Results are ordered by neutral criteria (relevance, date, price, distance). Order never depends on payment.':'Los resultados se ordenan con criterios neutros (relevancia, fecha, precio, distancia). El orden nunca depende de pagos.'}{' '}
   <a className={`underline underline-offset-2 ${ring}`} href={en?'/en/como-ordenamos':'/como-ordenamos'}>{en?'How we rank':'Cómo ordenamos'}</a></p>
 </aside>;
}
