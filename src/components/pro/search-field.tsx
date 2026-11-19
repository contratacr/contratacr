'use client';
import {useRef} from 'react';
import {useTranslations} from 'next-intl';
import {Search,X} from 'lucide-react';

export function ProSearchField({label,placeholder,value,onChange}:{label:string;placeholder?:string;value:string;onChange:(value:string)=>void}){
 const input=useRef<HTMLInputElement>(null),copy=useTranslations('ProUsability');
 return <div className="relative">
  <Search aria-hidden className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-[#68778d]"/>
  <input ref={input} aria-label={label} placeholder={placeholder??label} value={value} maxLength={160} onChange={event=>onChange(event.target.value)} className="block min-h-11 w-full min-w-0 rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-10 pr-12 text-[15px] text-[#162543] focus:outline-none focus:ring-2 focus:ring-[#009FD9]"/>
  {value&&<button type="button" aria-label={copy('clearSearch')} onClick={()=>{onChange('');input.current?.focus();}} className="absolute right-0 top-0 grid h-11 w-11 place-items-center rounded-xl text-[#52627a] hover:bg-[#eef6fb] focus-visible:outline-2 focus-visible:outline-[#009FD9]"><X aria-hidden className="h-5 w-5"/></button>}
 </div>;
}
