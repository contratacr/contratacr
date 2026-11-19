'use client';
import {useState,type InputHTMLAttributes} from 'react';
import {useLocale} from 'next-intl';

type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'children'>&{'aria-label':string;buttonLabel?:string;emptyLabel?:string};
/**
 * Localized file picker for Pro views. The browser's own control prints «Choose File / No file
 * chosen» in the browser language even on Spanish pages; here the real <input type="file"> stays
 * in the page (visually hidden, focusable, same aria-label, so setInputFiles and screen readers keep
 * working) and the visible part is our own button text. Render it INSIDE the existing <label>:
 * clicking the button or the label text opens the picker. `className` styles the wrapper.
 */
export function ProFileInput({className='','aria-label':ariaLabel,buttonLabel,emptyLabel,onChange,multiple,disabled,...props}:Props){
 const en=useLocale()==='en',[names,setNames]=useState('');
 const choose=buttonLabel??(multiple?(en?'Choose files':'Elegir archivos'):(en?'Choose file':'Elegir archivo'));
 const none=emptyLabel??(multiple?(en?'No files chosen':'Ningún archivo elegido'):(en?'No file chosen':'Ningún archivo elegido'));
 return <span data-pro-file-input className={'flex min-w-0 flex-wrap items-center gap-2 font-normal '+className}>
  <input {...props} type="file" multiple={multiple} disabled={disabled} aria-label={ariaLabel} className="peer sr-only" onChange={event=>{
   const picked=Array.from(event.target.files??[]).map(file=>file.name).join(', ');onChange?.(event);
   // Components that upload at once clear the input; then nothing stays «chosen».
   setNames(event.target.value?picked:'');
  }}/>
  <span aria-hidden="true" className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-4 text-sm font-semibold text-[#162543] hover:bg-[#f6f9fb] peer-focus-visible:ring-2 peer-focus-visible:ring-[#009FD9] peer-focus-visible:ring-offset-2 peer-disabled:cursor-not-allowed peer-disabled:opacity-50">{choose}</span>
  <span aria-hidden="true" data-pro-file-input-name className="min-w-0 break-all text-sm text-[#52627a]">{names||none}</span>
 </span>;
}
