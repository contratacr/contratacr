'use client';
import {useEffect,useId,useRef,type ComponentProps} from 'react';
import {ArrowLeft} from 'lucide-react';
import type {Modal} from '@/components/ui/modal';

/**
 * Round 9: the job page on its own route (/dashboard/pro/trabajo/<id>/<section>) is a page, not a
 * dialog. Same call shape as the shared Modal so the job content is written once: a back arrow that
 * leaves the job, the job name as the page heading, the content, and a pinned footer for the job's
 * actions (Editar trabajo / the active editor's buttons).
 */
export function JobPageFrame({title,ariaLabel,onBack,onClose,backLabel,footer,footerNotice,children}:ComponentProps<typeof Modal>){
 const id=useId(),heading=useRef<HTMLHeadingElement>(null);
 // Like a document load: the heading takes focus once (screen readers announce the job).
 useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
 return <article data-job-route aria-labelledby={id} className="min-w-0 rounded-2xl border border-[#e5e7eb] bg-white">
  <header className="flex min-w-0 items-center gap-2 border-b border-[#e5e7eb] px-3 py-3 sm:px-5">
   <button type="button" onClick={onBack??onClose} data-native-back="page" aria-label={backLabel??'Volver'} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#52627a] transition-colors hover:bg-[#f3f8fb] hover:text-[#162543]"><ArrowLeft className="h-5 w-5"/></button>
   <h1 id={id} ref={heading} tabIndex={-1} aria-label={ariaLabel} style={{outline:"none",boxShadow:"none"}} className="min-w-0 truncate text-xl font-bold text-[#162543] outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 sm:whitespace-normal sm:text-2xl">{title}</h1>
  </header>
  <div data-job-route-body className="min-w-0 px-3 py-4 sm:px-5 sm:py-5">{children}</div>
  {footerNotice&&<div className="border-t border-[#eef2f6] px-3 pt-3 sm:px-5">{footerNotice}</div>}
  {footer&&<div data-job-route-footer style={{paddingBottom:'calc(0.75rem + env(safe-area-inset-bottom))'}} className="sticky bottom-0 z-20 flex flex-wrap justify-end gap-3 rounded-b-2xl border-t border-[#e5e7eb] bg-white px-3 pt-3 sm:px-5">{footer}</div>}
 </article>;
}
